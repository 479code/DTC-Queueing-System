import { BYPASS_OTP_MAX_FAILED_ATTEMPTS } from "@refinery/shared";
import { validateBypassOtpInputSchema } from "@refinery/validation";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { writeAuditEvent } from "../shared/audit.js";
import { requireAuth, requireRole, requireSameSite } from "../shared/auth.js";
import { validatedCall } from "../shared/callable.js";
import {
  failedPrecondition,
  notFound,
  permissionDenied
} from "../shared/errors.js";
import { db } from "../shared/firebase.js";
import {
  bypassAuthorizationsRef,
  bypassRequestsRef,
  notificationsRef,
  queueCyclesRef,
  trucksRef
} from "../shared/paths.js";
import { bypassOtpPepper, getBypassOtpPepper } from "./config.js";
import { verifyBypassOtp } from "./otp.js";

type ValidationOutcome =
  | {
      ok: true;
      authorizationId: string;
      expiresAt: string;
    }
  | {
      ok: false;
      reason: "EXPIRED" | "INVALID" | "LOCKED";
      remainingAttempts?: number;
    };

export const validateBypassOtp = validatedCall(
  validateBypassOtpInputSchema,
  async (data, request) => {
    const context = requireAuth(request);
    requireSameSite(context, data.siteId);
    requireRole(context, "fleetOfficer");
    const pepper = getBypassOtpPepper();

    const outcome: ValidationOutcome = await db.runTransaction(
      async (transaction) => {
        const requestSnapshot = await transaction.get(
          bypassRequestsRef(data.siteId).where("truckId", "==", data.truckId)
        );
        const approvedRequests = requestSnapshot.docs.filter((requestDoc) => {
          const requestData = requestDoc.data();
          return (
            requestData.requestedBy === context.uid &&
            requestData.fleetOfficerId === context.uid &&
            requestData.status === "APPROVED"
          );
        });

        if (approvedRequests.length === 0) {
          notFound("No approved bypass authorization was found for this truck.");
        }

        if (approvedRequests.length > 1) {
          failedPrecondition(
            "More than one approved bypass authorization exists for this truck."
          );
        }

        const bypassRequestSnap = approvedRequests[0];
        if (!bypassRequestSnap) {
          notFound("No approved bypass authorization was found for this truck.");
        }
        const bypassRequestRef = bypassRequestSnap.ref;
        const bypassRequestId = bypassRequestSnap.id;
        const bypassRequest = bypassRequestSnap.data() ?? {};

        if (
          bypassRequest.requestedBy !== context.uid ||
          bypassRequest.fleetOfficerId !== context.uid
        ) {
          permissionDenied("Only the requesting fleet officer can validate this code.");
        }

        if (
          bypassRequest.truckId !== data.truckId ||
          bypassRequest.status !== "APPROVED"
        ) {
          failedPrecondition("Bypass request is not approved for this truck.");
        }

        const authorizationId = bypassRequest.authorizationId;

        if (typeof authorizationId !== "string" || authorizationId.length === 0) {
          failedPrecondition("Approved bypass request has no authorization.");
        }

        const authorizationRef = bypassAuthorizationsRef(data.siteId).doc(
          authorizationId
        );
        const authorizationSnap = await transaction.get(authorizationRef);

        if (!authorizationSnap.exists) {
          notFound("Bypass authorization was not found.");
        }

        const authorization = authorizationSnap.data() ?? {};
        const queueCycleId = String(bypassRequest.queueCycleId);
        const deliveredCodes = await transaction.get(
          notificationsRef(data.siteId).where("bypassAuthorizationId", "==", authorizationId)
        );
        const [cycleSnap, truckSnap] = await Promise.all([
          transaction.get(queueCyclesRef(data.siteId).doc(queueCycleId)),
          transaction.get(trucksRef(data.siteId).doc(data.truckId))
        ]);

        if (!cycleSnap.exists || !truckSnap.exists) {
          failedPrecondition("The truck or queue cycle no longer exists.");
        }

        const cycle = cycleSnap.data() ?? {};
        const truck = truckSnap.data() ?? {};

        if (
          cycle.status !== "QUEUED" ||
          cycle.truckId !== data.truckId ||
          truck.currentStatus !== "QUEUED" ||
          truck.activeCycleId !== queueCycleId
        ) {
          failedPrecondition("The truck is no longer in the active queue.");
        }

        if (
          authorization.bypassRequestId !== bypassRequestId ||
          authorization.truckId !== data.truckId ||
          authorization.queueCycleId !== queueCycleId ||
          authorization.requestedBy !== context.uid
        ) {
          failedPrecondition("Bypass authorization does not match this request.");
        }

        if (authorization.status === "USED") {
          failedPrecondition("This bypass code has already been used.");
        }

        if (authorization.status === "VALIDATED") {
          failedPrecondition("This bypass code has already been validated.");
        }

        if (authorization.status === "REVOKED") {
          return { ok: false, reason: "LOCKED" };
        }

        if (authorization.status !== "ACTIVE") {
          failedPrecondition("This bypass authorization is no longer active.");
        }

        const expiresAt = authorization.expiresAt;

        if (!(expiresAt instanceof Timestamp)) {
          failedPrecondition("Bypass authorization has an invalid expiry.");
        }

        const now = Timestamp.now();

        if (expiresAt.toMillis() <= now.toMillis()) {
          transaction.update(authorizationRef, {
            status: "EXPIRED"
          });
          transaction.update(bypassRequestRef, {
            status: "EXPIRED"
          });
          writeAuditEvent(transaction, {
            siteId: data.siteId,
            eventType: "BYPASS_OTP_FAILED",
            actorUserId: context.uid,
            actorRoles: context.roles,
            truckId: data.truckId,
            queueCycleId,
            bypassRequestId,
            bypassAuthorizationId: authorizationId,
            metadata: { reason: "EXPIRED" }
          });

          return { ok: false, reason: "EXPIRED" };
        }

        const failedAttempts = Number(authorization.failedAttempts ?? 0);

        if (failedAttempts >= BYPASS_OTP_MAX_FAILED_ATTEMPTS) {
          transaction.update(authorizationRef, {
            status: "REVOKED"
          });
          transaction.update(bypassRequestRef, {
            status: "EXPIRED"
          });

          return { ok: false, reason: "LOCKED" };
        }

        const otpMatches = verifyBypassOtp(
          data.otp,
          {
            siteId: data.siteId,
            bypassRequestId,
            truckId: data.truckId,
            queueCycleId,
            requestedBy: context.uid,
            approvedBy: String(authorization.approvedBy),
            expiresAtMillis: expiresAt.toMillis()
          },
          pepper,
          String(authorization.otpHash)
        );

        if (!otpMatches) {
          const nextFailedAttempts = failedAttempts + 1;
          const locked =
            nextFailedAttempts >= BYPASS_OTP_MAX_FAILED_ATTEMPTS;

          transaction.update(authorizationRef, {
            failedAttempts: nextFailedAttempts,
            status: locked ? "REVOKED" : "ACTIVE"
          });

          if (locked) {
            transaction.update(bypassRequestRef, {
              status: "EXPIRED"
            });
          }

          writeAuditEvent(transaction, {
            siteId: data.siteId,
            eventType: "BYPASS_OTP_FAILED",
            actorUserId: context.uid,
            actorRoles: context.roles,
            truckId: data.truckId,
            queueCycleId,
            bypassRequestId,
            bypassAuthorizationId: authorizationId,
            metadata: {
              reason: locked ? "ATTEMPT_LIMIT_REACHED" : "INCORRECT",
              failedAttempts: nextFailedAttempts
            }
          });

          return {
            ok: false,
            reason: locked ? "LOCKED" : "INVALID",
            remainingAttempts: Math.max(
              0,
              BYPASS_OTP_MAX_FAILED_ATTEMPTS - nextFailedAttempts
            )
          };
        }

        transaction.update(authorizationRef, {
          status: "VALIDATED",
          validatedAt: now
        });

        // The delivered code has served its purpose; do not leave it readable.
        for (const delivered of deliveredCodes.docs) {
          transaction.update(delivered.ref, { otp: FieldValue.delete() });
        }

        writeAuditEvent(transaction, {
          siteId: data.siteId,
          eventType: "BYPASS_OTP_VALIDATED",
          actorUserId: context.uid,
          actorRoles: context.roles,
          truckId: data.truckId,
          queueCycleId,
          bypassRequestId,
          bypassAuthorizationId: authorizationId,
          previousState: { status: "ACTIVE" },
          newState: { status: "VALIDATED" }
        });

        return {
          ok: true,
          authorizationId,
          expiresAt: expiresAt.toDate().toISOString()
        };
      }
    );

    if (!outcome.ok) {
      if (outcome.reason === "EXPIRED") {
        failedPrecondition("This bypass code has expired. Request a new approval.");
      }

      if (outcome.reason === "LOCKED") {
        failedPrecondition(
          "This bypass code is locked after too many failed attempts. Request a new approval."
        );
      }

      failedPrecondition(
        `Incorrect bypass code. ${outcome.remainingAttempts ?? 0} attempts remaining.`
      );
    }

    return {
      authorizationId: outcome.authorizationId,
      status: "VALIDATED" as const,
      expiresAt: outcome.expiresAt
    };
  },
  { secrets: [bypassOtpPepper] }
);
