import { updateInsuranceInputSchema } from "@refinery/validation";
import { Timestamp } from "firebase-admin/firestore";
import { writeAuditEvent } from "../shared/audit.js";
import { requireAuth, requireRole, requireSameSite } from "../shared/auth.js";
import { validatedCall } from "../shared/callable.js";
import { failedPrecondition, notFound } from "../shared/errors.js";
import { db } from "../shared/firebase.js";
import { writeNotification } from "../shared/notifications.js";
import {
  insuranceRecordsRef,
  queueCyclesRef,
  trucksRef
} from "../shared/paths.js";
import { evaluateInsuranceStatus } from "./status.js";

function parseDate(value: string, label: string): Timestamp {
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) {
    failedPrecondition(`${label} must be a valid date.`);
  }
  return Timestamp.fromMillis(millis);
}

export const updateInsurance = validatedCall(
  updateInsuranceInputSchema,
  async (data, request) => {
    const context = requireAuth(request);
    requireSameSite(context, data.siteId);
    requireRole(context, "administrator");

    const effectiveDate = parseDate(data.effectiveDate, "Effective date");
    const expiryDate = parseDate(data.expiryDate, "Expiry date");
    const now = Timestamp.now();
    let statusAtRecordTime: ReturnType<typeof evaluateInsuranceStatus>;

    try {
      statusAtRecordTime = evaluateInsuranceStatus(
        effectiveDate.toMillis(),
        expiryDate.toMillis(),
        now.toMillis()
      );
    } catch (error) {
      failedPrecondition(
        error instanceof Error ? error.message : "Insurance dates are invalid."
      );
    }

    return db.runTransaction(async (transaction) => {
      const truckRef = trucksRef(data.siteId).doc(data.truckId);
      const previousRecordQuery = insuranceRecordsRef(data.siteId)
        .where("truckId", "==", data.truckId)
        .orderBy("recordedAt", "desc")
        .limit(1);
      const [truckSnapshot, previousRecordSnapshot] = await Promise.all([
        transaction.get(truckRef),
        transaction.get(previousRecordQuery)
      ]);

      if (!truckSnapshot.exists) {
        notFound("Truck was not found.");
      }

      const truck = truckSnapshot.data() ?? {};
      if (truck.isActive !== true) {
        failedPrecondition("Insurance cannot be updated for an inactive truck.");
      }

      const insuranceRef = insuranceRecordsRef(data.siteId).doc();
      const previousRecordId = previousRecordSnapshot.docs[0]?.id;
      transaction.set(insuranceRef, {
        siteId: data.siteId,
        truckId: data.truckId,
        policyNumber: data.policyNumber,
        provider: data.provider,
        effectiveDate,
        expiryDate,
        ...(data.documentPath ? { documentPath: data.documentPath } : {}),
        recordedBy: context.uid,
        recordedAt: now,
        statusAtRecordTime,
        ...(previousRecordId ? { supersedesRecordId: previousRecordId } : {})
      });

      const wasOnHold = truck.currentStatus === "INSURANCE_HOLD";
      const becomesEligible =
        wasOnHold &&
        (statusAtRecordTime === "VALID" || statusAtRecordTime === "EXPIRING_SOON");
      const becomesHeld =
        truck.currentStatus === "QUEUED" && statusAtRecordTime === "EXPIRED";

      transaction.update(truckRef, {
        latestInsuranceStatus: statusAtRecordTime,
        latestInsuranceExpiry: expiryDate,
        ...(becomesEligible ? { currentStatus: "QUEUED" } : {}),
        ...(becomesHeld ? { currentStatus: "INSURANCE_HOLD" } : {}),
        updatedAt: now
      });

      if ((becomesEligible || becomesHeld) && typeof truck.activeCycleId === "string") {
        transaction.update(
          queueCyclesRef(data.siteId).doc(truck.activeCycleId),
          becomesEligible
            ? {
                status: "QUEUED",
                queueEnteredAt: now,
                insuranceEvaluatedAt: now,
                updatedAt: now
              }
            : {
                status: "INSURANCE_HOLD",
                queueEnteredAt: null,
                insuranceEvaluatedAt: now,
                updatedAt: now
              }
        );
      }

      writeAuditEvent(transaction, {
        siteId: data.siteId,
        eventType: previousRecordId
          ? "INSURANCE_RENEWED"
          : "INSURANCE_RECORD_CREATED",
        actorUserId: context.uid,
        actorRoles: context.roles,
        truckId: data.truckId,
        relatedRecordPath: insuranceRef.path,
        previousState: {
          latestInsuranceStatus: truck.latestInsuranceStatus ?? "UNKNOWN"
        },
        newState: {
          latestInsuranceStatus: statusAtRecordTime,
          latestInsuranceExpiry: expiryDate.toDate().toISOString(),
          queueReentered: becomesEligible
        }
      });

      if (becomesHeld) {
        writeAuditEvent(transaction, {
          siteId: data.siteId,
          eventType: "INSURANCE_HOLD_APPLIED",
          actorUserId: context.uid,
          actorRoles: context.roles,
          truckId: data.truckId,
          queueCycleId: String(truck.activeCycleId),
          metadata: { source: "insurance-update" }
        });
      }

      if (typeof truck.assignedFleetOfficerId === "string") {
        writeNotification(transaction, {
          siteId: data.siteId,
          userId: truck.assignedFleetOfficerId,
          type: becomesHeld ? "INSURANCE_HOLD" : "INSURANCE_RENEWED",
          title: becomesHeld ? "Truck placed on insurance hold" : "Insurance updated",
          body: `${String(truck.registrationNumber ?? data.truckId)} insurance is ${statusAtRecordTime.toLowerCase().replace("_", " ")}.`,
          truckId: data.truckId
        });
      }

      return {
        insuranceRecordId: insuranceRef.id,
        truckId: data.truckId,
        status: statusAtRecordTime,
        expiryDate: expiryDate.toDate().toISOString(),
        queueReentered: becomesEligible
      };
    });
  }
);
