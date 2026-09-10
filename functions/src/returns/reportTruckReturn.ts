import { reportTruckReturnInputSchema } from "@refinery/validation";
import { FieldValue } from "firebase-admin/firestore";
import { normalizeRegistration } from "@refinery/shared";
import { validatedCall } from "../shared/callable.js";
import { requireAuth, requireRole, requireSameSite } from "../shared/auth.js";
import { db } from "../shared/firebase.js";
import { failedPrecondition, notFound, permissionDenied } from "../shared/errors.js";
import { queueCyclesRef, trucksRef } from "../shared/paths.js";
import { writeAuditEvent } from "../shared/audit.js";
import { writeNotification } from "../shared/notifications.js";

export const reportTruckReturn = validatedCall(
  reportTruckReturnInputSchema,
  async (data, request) => {
    const context = requireAuth(request);
    requireSameSite(context, data.siteId);
    requireRole(context, "fleetOfficer");

    return db.runTransaction(async (transaction) => {
      const truckRef = trucksRef(data.siteId).doc(data.truckId);
      const truckSnap = await transaction.get(truckRef);

      if (!truckSnap.exists) {
        notFound("Truck was not found.");
      }

      const truck = truckSnap.data() ?? {};

      if (truck.isActive !== true) {
        failedPrecondition("Truck is not active.");
      }

      if (truck.assignedFleetOfficerId !== context.uid) {
        permissionDenied("Fleet officers can only report returns for assigned trucks.");
      }

      if (truck.activeCycleId) {
        failedPrecondition("Truck already has an active cycle.");
      }

      if (truck.currentStatus !== "ON_TRIP") {
        failedPrecondition("Only trucks currently on trip can be reported returned.");
      }

      const cycleRef = queueCyclesRef(data.siteId).doc();
      const now = FieldValue.serverTimestamp();
      const hasValidInsurance =
        truck.latestInsuranceStatus === "VALID" || truck.latestInsuranceStatus === "EXPIRING_SOON";
      const normalizedRegistration =
        typeof truck.normalizedRegistration === "string"
          ? truck.normalizedRegistration
          : normalizeRegistration(String(truck.registrationNumber ?? ""));
      const nextStatus = hasValidInsurance ? "QUEUED" : "INSURANCE_HOLD";

      transaction.set(cycleRef, {
        siteId: data.siteId,
        truckId: data.truckId,
        normalizedRegistration,
        fleetOfficerId: context.uid,
        fleetOfficerName: String(truck.assignedFleetOfficerName ?? context.uid),
        status: nextStatus,
        returnReportedAt: now,
        queueEnteredAt: hasValidInsurance ? now : null,
        insuranceEvaluatedAt: now,
        createdBy: context.uid,
        createdAt: now,
        updatedAt: now
      });

      transaction.update(truckRef, {
        currentStatus: nextStatus,
        activeCycleId: cycleRef.id,
        updatedAt: now
      });

      writeAuditEvent(transaction, {
        siteId: data.siteId,
        eventType: "RETURN_REPORTED",
        actorUserId: context.uid,
        actorRoles: context.roles,
        truckId: data.truckId,
        queueCycleId: cycleRef.id,
        newState: { status: nextStatus }
      });

      if (hasValidInsurance) {
        writeAuditEvent(transaction, {
          siteId: data.siteId,
          eventType: "QUEUE_ENTERED",
          actorUserId: context.uid,
          actorRoles: context.roles,
          truckId: data.truckId,
          queueCycleId: cycleRef.id
        });
      } else {
        writeAuditEvent(transaction, {
          siteId: data.siteId,
          eventType: "INSURANCE_HOLD_APPLIED",
          actorUserId: context.uid,
          actorRoles: context.roles,
          truckId: data.truckId,
          queueCycleId: cycleRef.id,
          metadata: { insuranceStatus: truck.latestInsuranceStatus ?? "UNKNOWN" }
        });
      }

      writeNotification(transaction, {
        siteId: data.siteId,
        userId: context.uid,
        type: hasValidInsurance ? "RETURN_QUEUED" : "INSURANCE_HOLD",
        title: hasValidInsurance ? "Truck entered the queue" : "Truck placed on insurance hold",
        body: hasValidInsurance
          ? `${String(truck.registrationNumber ?? data.truckId)} entered the FIFO queue.`
          : `${String(truck.registrationNumber ?? data.truckId)} cannot queue until insurance is valid.`,
        truckId: data.truckId
      });

      return {
        cycleId: cycleRef.id,
        truckId: data.truckId,
        status: nextStatus,
        insuranceStatus: truck.latestInsuranceStatus ?? "UNKNOWN"
      };
    });
  }
);
