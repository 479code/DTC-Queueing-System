import { BYPASS_OTP_TTL_MINUTES } from "@refinery/shared";
import { approveBypassInputSchema } from "@refinery/validation";
import { Timestamp } from "firebase-admin/firestore";
import { writeAuditEvent } from "../shared/audit.js";
import { requireAuth, requireRole, requireSameSite } from "../shared/auth.js";
import { validatedCall } from "../shared/callable.js";
import { failedPrecondition, notFound } from "../shared/errors.js";
import { db } from "../shared/firebase.js";
import { writeNotification } from "../shared/notifications.js";
import {
  bypassAuthorizationsRef,
  bypassRequestsRef,
  queueCyclesRef,
  trucksRef
} from "../shared/paths.js";
import { bypassOtpPepper, getBypassOtpPepper } from "./config.js";
import { generateBypassOtp, hashBypassOtp } from "./otp.js";
import { calculateQueuePosition } from "./queuePosition.js";

export const approveBypass = validatedCall(
  approveBypassInputSchema,
  async (data, request) => {
    const context = requireAuth(request);
    requireSameSite(context, data.siteId);
    requireRole(context, "overseer");

    const otp = generateBypassOtp();
    const pepper = getBypassOtpPepper();
    const authorizationRef = bypassAuthorizationsRef(data.siteId).doc();
    const generatedAt = Timestamp.now();
    const expiresAt = Timestamp.fromMillis(
      generatedAt.toMillis() + BYPASS_OTP_TTL_MINUTES * 60 * 1000
    );

    return db.runTransaction(async (transaction) => {
      const bypassRequestRef = bypassRequestsRef(data.siteId).doc(
        data.bypassRequestId
      );
      const bypassRequestSnap = await transaction.get(bypassRequestRef);

      if (!bypassRequestSnap.exists) {
        notFound("Bypass request was not found.");
      }

      const bypassRequest = bypassRequestSnap.data() ?? {};

      if (bypassRequest.status !== "PENDING") {
        failedPrecondition("Only pending bypass requests can be approved.");
      }

      if (bypassRequest.requestedBy === context.uid) {
        failedPrecondition("Overseers cannot approve their own bypass requests.");
      }

      const truckId = String(bypassRequest.truckId);
      const queueCycleId = String(bypassRequest.queueCycleId);
      const truckRef = trucksRef(data.siteId).doc(truckId);
      const cycleRef = queueCyclesRef(data.siteId).doc(queueCycleId);
      const activeQueueQuery = queueCyclesRef(data.siteId)
        .where("status", "==", "QUEUED")
        .orderBy("queueEnteredAt", "asc");
      const [truckSnap, cycleSnap, queueSnapshot] = await Promise.all([
        transaction.get(truckRef),
        transaction.get(cycleRef),
        transaction.get(activeQueueQuery)
      ]);

      if (!truckSnap.exists || !cycleSnap.exists) {
        failedPrecondition("The request truck or queue cycle no longer exists.");
      }

      const truck = truckSnap.data() ?? {};
      const cycle = cycleSnap.data() ?? {};

      if (
        truck.currentStatus !== "QUEUED" ||
        truck.activeCycleId !== queueCycleId ||
        cycle.status !== "QUEUED" ||
        cycle.truckId !== truckId
      ) {
        failedPrecondition("The truck is no longer in the active queue.");
      }

      const currentQueuePosition = calculateQueuePosition(
        queueSnapshot.docs,
        queueCycleId
      );

      if (currentQueuePosition === 0) {
        failedPrecondition("The truck is no longer in the active queue.");
      }

      if (currentQueuePosition === 1) {
        failedPrecondition("Bypass is unnecessary for the first truck in the queue.");
      }

      const requestedBy = String(bypassRequest.requestedBy);
      const otpHash = hashBypassOtp(
        otp,
        {
          siteId: data.siteId,
          bypassRequestId: data.bypassRequestId,
          truckId,
          queueCycleId,
          requestedBy,
          approvedBy: context.uid,
          expiresAtMillis: expiresAt.toMillis()
        },
        pepper
      );

      transaction.set(authorizationRef, {
        siteId: data.siteId,
        bypassRequestId: data.bypassRequestId,
        truckId,
        queueCycleId,
        requestedBy,
        approvedBy: context.uid,
        otpHash,
        generatedAt,
        expiresAt,
        failedAttempts: 0,
        status: "ACTIVE"
      });

      transaction.update(bypassRequestRef, {
        status: "APPROVED",
        decidedBy: context.uid,
        decidedAt: generatedAt,
        authorizationId: authorizationRef.id
      });

      writeAuditEvent(transaction, {
        siteId: data.siteId,
        eventType: "BYPASS_APPROVED",
        actorUserId: context.uid,
        actorRoles: context.roles,
        truckId,
        queueCycleId,
        bypassRequestId: data.bypassRequestId,
        bypassAuthorizationId: authorizationRef.id,
        previousState: { status: "PENDING" },
        newState: { status: "APPROVED" },
        metadata: {
          currentQueuePosition,
          numberOfTrucksBypassed: currentQueuePosition - 1,
          expiresAt: expiresAt.toDate().toISOString()
        }
      });

      writeAuditEvent(transaction, {
        siteId: data.siteId,
        eventType: "BYPASS_OTP_GENERATED",
        actorUserId: context.uid,
        actorRoles: context.roles,
        truckId,
        queueCycleId,
        bypassRequestId: data.bypassRequestId,
        bypassAuthorizationId: authorizationRef.id,
        metadata: {
          expiresAt: expiresAt.toDate().toISOString()
        }
      });

      writeNotification(transaction, {
        siteId: data.siteId,
        userId: requestedBy,
        type: "BYPASS_APPROVED",
        title: "Bypass approved",
        body: `${String(truck.registrationNumber ?? truckId)} bypass was approved. Use the authorization code below before it expires.`,
        truckId,
        bypassRequestId: data.bypassRequestId,
        bypassAuthorizationId: authorizationRef.id,
        otp
      });

      return {
        bypassRequestId: data.bypassRequestId,
        authorizationId: authorizationRef.id,
        otp,
        expiresAt: expiresAt.toDate().toISOString(),
        truckId
      };
    });
  },
  { secrets: [bypassOtpPepper] }
);
