import { Timestamp } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { writeAuditEvent } from "../shared/audit.js";
import { db } from "../shared/firebase.js";
import { writeNotification } from "../shared/notifications.js";
import { queueCyclesRef } from "../shared/paths.js";

export async function expireInsuranceRecords(): Promise<void> {
    const now = Timestamp.now();
    const expiredCandidates = await db
      .collectionGroup("trucks")
      .where("latestInsuranceExpiry", "<=", now)
      .get();

    await Promise.all(
      expiredCandidates.docs.map((candidate) =>
        db.runTransaction(async (transaction) => {
          const truckSnapshot = await transaction.get(candidate.ref);
          const truck = truckSnapshot.data();
          if (
            !truck ||
            truck.isActive !== true ||
            !["VALID", "EXPIRING_SOON"].includes(String(truck.latestInsuranceStatus))
          ) {
            return;
          }

          const siteId = String(truck.siteId);
          const queued = truck.currentStatus === "QUEUED";
          const activeCycleId =
            typeof truck.activeCycleId === "string" ? truck.activeCycleId : undefined;

          transaction.update(candidate.ref, {
            latestInsuranceStatus: "EXPIRED",
            ...(queued ? { currentStatus: "INSURANCE_HOLD" } : {}),
            updatedAt: now
          });

          if (queued && activeCycleId) {
            transaction.update(queueCyclesRef(siteId).doc(activeCycleId), {
              status: "INSURANCE_HOLD",
              queueEnteredAt: null,
              insuranceEvaluatedAt: now,
              updatedAt: now
            });
          }

          writeAuditEvent(transaction, {
            siteId,
            eventType: "INSURANCE_HOLD_APPLIED",
            actorUserId: "system:insurance-expiry",
            actorRoles: [],
            truckId: candidate.id,
            queueCycleId: queued ? activeCycleId : undefined,
            previousState: {
              latestInsuranceStatus: truck.latestInsuranceStatus,
              currentStatus: truck.currentStatus
            },
            newState: {
              latestInsuranceStatus: "EXPIRED",
              currentStatus: queued ? "INSURANCE_HOLD" : truck.currentStatus
            },
            metadata: { source: "scheduled-expiry-check" }
          });

          if (typeof truck.assignedFleetOfficerId === "string") {
            writeNotification(transaction, {
              siteId,
              userId: truck.assignedFleetOfficerId,
              type: "INSURANCE_HOLD",
              title: queued ? "Truck placed on insurance hold" : "Truck insurance expired",
              body: `${String(truck.registrationNumber ?? candidate.id)} insurance has expired.`,
              truckId: candidate.id
            });
          }
        })
      )
    );
}

export const expireInsurance = onSchedule(
  {
    schedule: "every day 00:15",
    timeZone: "Africa/Lagos"
  },
  expireInsuranceRecords
);
