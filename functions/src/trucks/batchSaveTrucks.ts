import { normalizeRegistration } from "@refinery/shared";
import { batchSaveTrucksInputSchema } from "@refinery/validation";
import { FieldValue } from "firebase-admin/firestore";
import { writeAuditEvent } from "../shared/audit.js";
import { requireAuth, requireRole, requireSameSite } from "../shared/auth.js";
import { validatedCall } from "../shared/callable.js";
import { failedPrecondition } from "../shared/errors.js";
import { db } from "../shared/firebase.js";
import { trucksRef, usersRef } from "../shared/paths.js";

export const batchSaveTrucks = validatedCall(
  batchSaveTrucksInputSchema,
  async (data, request) => {
    const context = requireAuth(request);
    requireSameSite(context, data.siteId);
    requireRole(context, "administrator");

    const normalizedRows = data.trucks.map((truck, index) => ({
      ...truck,
      rowNumber: index + 2,
      normalizedRegistration: normalizeRegistration(truck.registrationNumber)
    }));
    const seen = new Map<string, number>();
    for (const row of normalizedRows) {
      if (!row.normalizedRegistration) {
        failedPrecondition(`Row ${row.rowNumber} has an invalid registration number.`);
      }
      const earlierRow = seen.get(row.normalizedRegistration);
      if (earlierRow) {
        failedPrecondition(
          `Rows ${earlierRow} and ${row.rowNumber} contain the same registration number.`
        );
      }
      seen.set(row.normalizedRegistration, row.rowNumber);
    }

    return db.runTransaction(async (transaction) => {
      const uniqueOfficerIds = Array.from(
        new Set(normalizedRows.map((row) => row.assignedFleetOfficerId))
      );
      const [existingTrucks, ...officerSnapshots] = await Promise.all([
        transaction.get(trucksRef(data.siteId)),
        ...uniqueOfficerIds.map((officerId) =>
          transaction.get(usersRef(data.siteId).doc(officerId))
        )
      ]);

      const existingRegistrations = new Set(
        existingTrucks.docs.map((document) =>
          String(document.data().normalizedRegistration ?? "")
        )
      );
      const duplicate = normalizedRows.find((row) =>
        existingRegistrations.has(row.normalizedRegistration)
      );
      if (duplicate) {
        failedPrecondition(
          `Row ${duplicate.rowNumber}: ${duplicate.registrationNumber} already exists.`
        );
      }

      const officerById = new Map(
        officerSnapshots.map((snapshot, index) => [uniqueOfficerIds[index]!, snapshot])
      );
      for (const row of normalizedRows) {
        const officerSnapshot = officerById.get(row.assignedFleetOfficerId);
        const officer = officerSnapshot?.data();
        if (
          !officerSnapshot?.exists ||
          officer?.isActive !== true ||
          !Array.isArray(officer.roles) ||
          !officer.roles.includes("fleetOfficer")
        ) {
          failedPrecondition(
            `Row ${row.rowNumber} does not reference an active fleet officer.`
          );
        }
      }

      const now = FieldValue.serverTimestamp();
      const created = normalizedRows.map((row) => {
        const truckRef = trucksRef(data.siteId).doc();
        const internalCode = `TRK-${truckRef.id.slice(0, 8).toUpperCase()}`;
        const officer = officerById.get(row.assignedFleetOfficerId)?.data() ?? {};
        const truck = {
          siteId: data.siteId,
          internalCode,
          registrationNumber: row.registrationNumber.toUpperCase(),
          normalizedRegistration: row.normalizedRegistration,
          driverName: row.driverName,
          assignedFleetOfficerId: row.assignedFleetOfficerId,
          assignedFleetOfficerName: String(officer.name ?? row.assignedFleetOfficerId),
          isActive: true,
          currentStatus: "ON_TRIP",
          latestInsuranceStatus: "UNKNOWN",
          activeCycleId: null,
          createdAt: now,
          updatedAt: now
        };

        transaction.set(truckRef, truck);
        writeAuditEvent(transaction, {
          siteId: data.siteId,
          eventType: "TRUCK_CREATED",
          actorUserId: context.uid,
          actorRoles: context.roles,
          truckId: truckRef.id,
          newState: {
            internalCode,
            registrationNumber: truck.registrationNumber,
            driverName: row.driverName,
            assignedFleetOfficerId: row.assignedFleetOfficerId,
            assignedFleetOfficerName: truck.assignedFleetOfficerName,
            isActive: true
          },
          metadata: { source: "BATCH_CSV", sourceRowNumber: row.rowNumber }
        });

        return {
          truckId: truckRef.id,
          internalCode,
          registrationNumber: truck.registrationNumber
        };
      });

      return { createdCount: created.length, trucks: created };
    });
  }
);
