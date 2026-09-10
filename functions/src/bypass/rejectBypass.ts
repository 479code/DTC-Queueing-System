import { rejectBypassInputSchema } from "@refinery/validation";
import { Timestamp } from "firebase-admin/firestore";
import { writeAuditEvent } from "../shared/audit.js";
import { requireAuth, requireRole, requireSameSite } from "../shared/auth.js";
import { validatedCall } from "../shared/callable.js";
import { failedPrecondition, notFound } from "../shared/errors.js";
import { db } from "../shared/firebase.js";
import { writeNotification } from "../shared/notifications.js";
import { bypassRequestsRef, trucksRef } from "../shared/paths.js";

export const rejectBypass = validatedCall(
  rejectBypassInputSchema,
  async (data, request) => {
    const context = requireAuth(request);
    requireSameSite(context, data.siteId);
    requireRole(context, "overseer");

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
        failedPrecondition("Only pending bypass requests can be rejected.");
      }

      const truckId = String(bypassRequest.truckId);
      const truckSnap = await transaction.get(trucksRef(data.siteId).doc(truckId));
      const decidedAt = Timestamp.now();

      transaction.update(bypassRequestRef, {
        status: "REJECTED",
        decidedBy: context.uid,
        decidedAt,
        rejectionReason: data.rejectionReason
      });

      writeAuditEvent(transaction, {
        siteId: data.siteId,
        eventType: "BYPASS_REJECTED",
        actorUserId: context.uid,
        actorRoles: context.roles,
        truckId,
        queueCycleId: String(bypassRequest.queueCycleId),
        bypassRequestId: data.bypassRequestId,
        previousState: { status: "PENDING" },
        newState: {
          status: "REJECTED",
          rejectionReason: data.rejectionReason
        }
      });

      writeNotification(transaction, {
        siteId: data.siteId,
        userId: String(bypassRequest.requestedBy),
        type: "BYPASS_REJECTED",
        title: "Bypass request rejected",
        body: `${String(truckSnap.data()?.registrationNumber ?? truckId)} bypass request was rejected: ${data.rejectionReason}`,
        truckId,
        bypassRequestId: data.bypassRequestId
      });

      return {
        bypassRequestId: data.bypassRequestId,
        status: "REJECTED" as const,
        rejectionReason: data.rejectionReason
      };
    });
  }
);
