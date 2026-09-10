import { normalizeRegistration } from "@refinery/shared";
import { saveTruckInputSchema } from "@refinery/validation";
import { FieldValue } from "firebase-admin/firestore";
import { writeAuditEvent } from "../shared/audit.js";
import { requireAuth, requireRole, requireSameSite } from "../shared/auth.js";
import { validatedCall } from "../shared/callable.js";
import { failedPrecondition, notFound } from "../shared/errors.js";
import { db } from "../shared/firebase.js";
import { trucksRef, usersRef } from "../shared/paths.js";

export const saveTruck = validatedCall(
  saveTruckInputSchema,
  async (data, request) => {
    const context = requireAuth(request);
    requireSameSite(context, data.siteId);
    requireRole(context, "administrator");

    const normalizedRegistration = normalizeRegistration(data.registrationNumber);
    if (!normalizedRegistration) {
      failedPrecondition("Registration number must contain letters or numbers.");
    }

    return db.runTransaction(async (transaction) => {
      const truckRef = data.truckId
        ? trucksRef(data.siteId).doc(data.truckId)
        : trucksRef(data.siteId).doc();
      const officerRef = usersRef(data.siteId).doc(data.assignedFleetOfficerId);
      const duplicateQuery = trucksRef(data.siteId).where(
        "normalizedRegistration",
        "==",
        normalizedRegistration
      );
      const [truckSnapshot, officerSnapshot, duplicateSnapshot] = await Promise.all([
        transaction.get(truckRef),
        transaction.get(officerRef),
        transaction.get(duplicateQuery)
      ]);

      if (data.truckId && !truckSnapshot.exists) {
        notFound("Truck was not found.");
      }

      const officer = officerSnapshot.data();
      if (
        !officerSnapshot.exists ||
        officer?.isActive !== true ||
        !Array.isArray(officer.roles) ||
        !officer.roles.includes("fleetOfficer")
      ) {
        failedPrecondition("Assigned fleet officer must be an active fleet officer.");
      }

      if (duplicateSnapshot.docs.some((document) => document.id !== truckRef.id)) {
        failedPrecondition("Another truck already uses this registration number.");
      }

      const previousState = truckSnapshot.data();
      if (
        previousState &&
        data.isActive === false &&
        typeof previousState.activeCycleId === "string" &&
        previousState.activeCycleId.length > 0
      ) {
        failedPrecondition("A truck with an active queue cycle cannot be deactivated.");
      }

      const now = FieldValue.serverTimestamp();
      const internalCode =
        typeof previousState?.internalCode === "string" && previousState.internalCode.length > 0
          ? previousState.internalCode
          : `TRK-${truckRef.id.slice(0, 8).toUpperCase()}`;
      const editableFields = {
        siteId: data.siteId,
        internalCode,
        registrationNumber: data.registrationNumber.toUpperCase(),
        normalizedRegistration,
        driverName: data.driverName,
        assignedFleetOfficerId: data.assignedFleetOfficerId,
        assignedFleetOfficerName: String(officer.name ?? data.assignedFleetOfficerId),
        isActive: data.isActive,
        currentStatus: data.isActive
          ? previousState?.currentStatus === "INACTIVE"
            ? "ON_TRIP"
            : previousState?.currentStatus ?? "ON_TRIP"
          : "INACTIVE",
        updatedAt: now
      };

      if (truckSnapshot.exists) {
        transaction.update(truckRef, editableFields);
      } else {
        transaction.set(truckRef, {
          ...editableFields,
          latestInsuranceStatus: "UNKNOWN",
          activeCycleId: null,
          createdAt: now
        });
      }

      writeAuditEvent(transaction, {
        siteId: data.siteId,
        eventType: truckSnapshot.exists ? "TRUCK_UPDATED" : "TRUCK_CREATED",
        actorUserId: context.uid,
        actorRoles: context.roles,
        truckId: truckRef.id,
        previousState: previousState
          ? {
              internalCode: previousState.internalCode,
              registrationNumber: previousState.registrationNumber,
              driverName: previousState.driverName,
              assignedFleetOfficerId: previousState.assignedFleetOfficerId,
              isActive: previousState.isActive
            }
          : undefined,
        newState: {
          internalCode,
          registrationNumber: data.registrationNumber.toUpperCase(),
          driverName: data.driverName,
          assignedFleetOfficerId: data.assignedFleetOfficerId,
          assignedFleetOfficerName: String(officer.name ?? data.assignedFleetOfficerId),
          isActive: data.isActive
        }
      });

      return {
        truckId: truckRef.id,
        created: !truckSnapshot.exists,
        internalCode,
        normalizedRegistration
      };
    });
  }
);
