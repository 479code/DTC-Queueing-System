import { createHash } from "node:crypto";
import { normalizeRegistration } from "@refinery/shared";
import { processDispatchImportInputSchema } from "@refinery/validation";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { readSheet } from "read-excel-file/node";
import { validatedCall } from "../shared/callable.js";
import { requireAnyRole, requireAuth, requireSameSite } from "../shared/auth.js";
import { db, storage } from "../shared/firebase.js";
import {
  auditEventsRef,
  dispatchImportsRef,
  dispatchRecordsRef,
  queueCyclesRef,
  trucksRef
} from "../shared/paths.js";
import { writeAuditEvent } from "../shared/audit.js";
import { failedPrecondition, notFound } from "../shared/errors.js";
import {
  parseDispatchRows,
  reconcileDispatchRows,
  type DispatchCell,
  type DispatchSummary,
  type KnownTruck,
  type ProgrammedCycle
} from "./reconcile.js";

function asDate(value: unknown, fallback = new Date()): Date {
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) return value.toDate();
  return fallback;
}

function compact<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function summaryFromImport(data: Record<string, unknown>): DispatchSummary {
  return {
    rowsProcessed: Number(data.rowsProcessed ?? 0),
    matchedCount: Number(data.matchedCount ?? 0),
    programmedNotDispatchedCount: Number(data.programmedNotDispatchedCount ?? 0),
    dispatchedNotProgrammedCount: Number(data.dispatchedNotProgrammedCount ?? 0),
    truckMismatchCount: Number(data.truckMismatchCount ?? 0),
    unknownTruckCount: Number(data.unknownTruckCount ?? 0),
    duplicateRowCount: Number(data.duplicateRowCount ?? 0)
  };
}

export const processDispatchImport = validatedCall(
  processDispatchImportInputSchema,
  async (data, request) => {
    const context = requireAuth(request);
    requireSameSite(context, data.siteId);
    requireAnyRole(context, ["programmingOfficer", "administrator"]);

    const importRef = dispatchImportsRef(data.siteId).doc(data.importId);
    const claim = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(importRef);
      if (!snapshot.exists) notFound("The dispatch import does not exist.");
      const importData = snapshot.data()!;
      if (importData.status === "PROCESSED") {
        return { alreadyProcessed: true, importData };
      }
      if (importData.status === "PROCESSING") {
        failedPrecondition("This dispatch import is already being processed.");
      }
      if (!["UPLOADED", "FAILED"].includes(String(importData.status))) {
        failedPrecondition("This dispatch import is not ready for processing.");
      }
      transaction.update(importRef, {
        status: "PROCESSING",
        processingStartedAt: FieldValue.serverTimestamp(),
        errorMessage: FieldValue.delete()
      });
      return { alreadyProcessed: false, importData };
    });

    if (claim.alreadyProcessed) {
      return { importId: data.importId, status: "PROCESSED" as const, ...summaryFromImport(claim.importData) };
    }

    try {
      const storagePath = String(claim.importData.storagePath ?? "");
      const [buffer] = await storage.bucket().file(storagePath).download();
      const checksum = createHash("sha256").update(buffer).digest("hex");
      if (checksum !== claim.importData.checksum) {
        throw new Error("The spreadsheet checksum changed after upload.");
      }

      const sheet = await readSheet(buffer);
      const rows = parseDispatchRows(sheet as unknown as DispatchCell[][]);
      const [truckSnapshot, programmedSnapshot, claimedSnapshot] = await Promise.all([
        trucksRef(data.siteId).get(),
        queueCyclesRef(data.siteId).where("status", "==", "PROGRAMMED").get(),
        queueCyclesRef(data.siteId).where("dispatchImportId", "==", data.importId).get()
      ]);

      const trucks: KnownTruck[] = truckSnapshot.docs.map((document) => {
        const truck = document.data();
        const registrationNumber = String(truck.registrationNumber ?? document.id);
        return {
          id: document.id,
          registrationNumber,
          normalizedRegistration: String(truck.normalizedRegistration ?? normalizeRegistration(registrationNumber)),
          driverName: typeof truck.driverName === "string" ? truck.driverName : undefined
        };
      });
      const truckById = new Map(trucks.map((truck) => [truck.id, truck]));
      const cycleDocuments = new Map(
        [...programmedSnapshot.docs, ...claimedSnapshot.docs].map((document) => [document.id, document])
      );
      const programmedCycles: ProgrammedCycle[] = [...cycleDocuments.values()].map((document) => {
        const cycle = document.data();
        const truck = truckById.get(String(cycle.truckId));
        const registrationNumber = truck?.registrationNumber ?? String(cycle.normalizedRegistration ?? document.id);
        return {
          id: document.id,
          truckId: String(cycle.truckId),
          registrationNumber,
          normalizedRegistration: truck?.normalizedRegistration ?? String(cycle.normalizedRegistration ?? normalizeRegistration(registrationNumber)),
          driverName: truck?.driverName,
          atcNo: typeof cycle.atcNo === "string" ? cycle.atcNo : undefined,
          programmingBatchId: typeof cycle.programmingBatchId === "string" ? cycle.programmingBatchId : undefined,
          programmedAt: asDate(cycle.programmedAt)
        };
      });

      const reconciliation = reconcileDispatchRows(data.importId, rows, trucks, programmedCycles);
      const matchedRecordByCycle = new Map(
        reconciliation.records
          .filter((record) => record.matchStatus === "MATCHED" && record.matchedQueueCycleId)
          .map((record) => [record.matchedQueueCycleId!, record])
      );

      if (matchedRecordByCycle.size > 0) {
        await db.runTransaction(async (transaction) => {
          const cycleRefs = [...matchedRecordByCycle.keys()].map((cycleId) => queueCyclesRef(data.siteId).doc(cycleId));
          const snapshots = await transaction.getAll(...cycleRefs);
          snapshots.forEach((snapshot) => {
            if (!snapshot.exists) failedPrecondition("A programmed queue entry no longer exists.");
            const cycle = snapshot.data()!;
            const record = matchedRecordByCycle.get(snapshot.id)!;
            const alreadyClaimedByThisImport = cycle.status === "DISPATCHED" && cycle.dispatchImportId === data.importId;
            if (!alreadyClaimedByThisImport && cycle.status !== "PROGRAMMED") {
              failedPrecondition(`ATC ${record.atcNo} has already been reconciled by another dispatch import.`);
            }
            if (
              String(cycle.atcNo ?? "").trim().toUpperCase() !== record.atcNo?.trim().toUpperCase() ||
              String(cycle.truckId ?? "") !== record.truckId
            ) {
              failedPrecondition(`The programmed assignment for ATC ${record.atcNo} changed during reconciliation.`);
            }
            if (alreadyClaimedByThisImport) return;

            transaction.update(snapshot.ref, {
              status: "DISPATCHED",
              dispatchConfirmedAt: FieldValue.serverTimestamp(),
              dispatchImportId: data.importId,
              dispatchRecordId: record.id,
              updatedAt: FieldValue.serverTimestamp()
            });
            transaction.update(trucksRef(data.siteId).doc(String(cycle.truckId)), {
              currentStatus: "ON_TRIP",
              activeCycleId: null,
              updatedAt: FieldValue.serverTimestamp()
            });
          });
        });
      }

      const writer = db.bulkWriter();

      reconciliation.records.forEach((record) => {
        const recordRef = dispatchRecordsRef(data.siteId).doc(record.id);
        writer.set(recordRef, compact({
          ...record,
          siteId: data.siteId,
          importId: data.importId,
          loadingDate: Timestamp.fromDate(record.loadingDate),
          createdAt: FieldValue.serverTimestamp()
        }));

        if (record.recordKind === "IMPORT_ROW") {
          writer.set(importRef.collection("rows").doc(`row-${record.sourceRowNumber}`), compact({
            sourceRowNumber: record.sourceRowNumber,
            rawData: record.rawData,
            dispatchRecordId: record.id,
            matchStatus: record.matchStatus,
            createdAt: FieldValue.serverTimestamp()
          }));
        }

        writer.set(auditEventsRef(data.siteId).doc(`${data.importId}_${record.id}`), compact({
          siteId: data.siteId,
          eventType: record.matchStatus === "MATCHED" ? "DISPATCH_CONFIRMED" : "DISPATCH_MISMATCH",
          actorUserId: context.uid,
          actorRoles: context.roles,
          truckId: record.truckId,
          queueCycleId: record.matchedQueueCycleId,
          programmingBatchId: record.matchedProgrammingBatchId,
          dispatchImportId: data.importId,
          dispatchRecordId: record.id,
          relatedRecordPath: recordRef.path,
          metadata: { matchStatus: record.matchStatus, matchReason: record.matchReason, atcNo: record.atcNo ?? null },
          createdAt: FieldValue.serverTimestamp()
        }));
      });

      await writer.close();
      await db.runTransaction(async (transaction) => {
        transaction.update(importRef, {
          status: "PROCESSED",
          processedAt: FieldValue.serverTimestamp(),
          ...reconciliation.summary
        });
        writeAuditEvent(transaction, {
          siteId: data.siteId,
          eventType: "DISPATCH_IMPORT_PROCESSED",
          actorUserId: context.uid,
          actorRoles: context.roles,
          dispatchImportId: data.importId,
          relatedRecordPath: importRef.path,
          metadata: reconciliation.summary
        });
      });

      return { importId: data.importId, status: "PROCESSED" as const, ...reconciliation.summary };
    } catch (error) {
      const message = error instanceof Error ? error.message : "The spreadsheet could not be processed.";
      await importRef.set({
        status: "FAILED",
        errorMessage: message,
        processedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      failedPrecondition(`Dispatch import failed: ${message}`);
    }
  },
  { timeoutSeconds: 300, memory: "1GiB" }
);
