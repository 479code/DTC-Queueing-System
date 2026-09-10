import { confirmProgrammingBatchInputSchema } from "@refinery/validation";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { formatProgrammingBatchCode } from "@refinery/shared";
import { validatedCall } from "../shared/callable.js";
import { requireAuth, requireRole, requireSameSite } from "../shared/auth.js";
import { db } from "../shared/firebase.js";
import { bypassAuthorizationsRef, bypassRequestsRef, programmingBatchesRef, queueCyclesRef, trucksRef } from "../shared/paths.js";
import { writeAuditEvent } from "../shared/audit.js";
import { failedPrecondition } from "../shared/errors.js";
import { selectProgrammingBatch } from "./selectProgrammingBatch.js";

export const confirmProgrammingBatch = validatedCall(
  confirmProgrammingBatchInputSchema,
  async (data, request) => {
    const context = requireAuth(request);
    requireSameSite(context, data.siteId);
    requireRole(context, "programmingOfficer");

    return db.runTransaction(async (transaction) => {
      const selectedItems = await selectProgrammingBatch(transaction, {
        ...data,
        now: Timestamp.now()
      });
      const atcByCycle = new Map<string, string>();
      for (const assignment of data.atcAssignments) {
        if (atcByCycle.has(assignment.queueCycleId)) {
          failedPrecondition("Each programmed truck must have one ATC number.");
        }
        atcByCycle.set(assignment.queueCycleId, assignment.atcNo);
      }
      if (atcByCycle.size !== selectedItems.length || selectedItems.some((item) => !atcByCycle.has(item.queueCycleId))) {
        failedPrecondition("An ATC number must be entered for every programmed truck.");
      }
      const batchRef = programmingBatchesRef(data.siteId).doc();
      const now = FieldValue.serverTimestamp();
      const fifoCount = selectedItems.filter((item) => item.selectionType === "FIFO").length;
      const bypassCount = selectedItems.length - fifoCount;
      const humanCode = formatProgrammingBatchCode(new Date(), Date.now() % 10000);

      transaction.set(batchRef, {
        siteId: data.siteId,
        humanCode,
        requestedSize: data.requestedSize,
        confirmedSize: selectedItems.length,
        fifoCount,
        bypassCount,
        status: "CONFIRMED",
        createdBy: context.uid,
        createdAt: now,
        confirmedBy: context.uid,
        confirmedAt: now,
        includedBypassAuthorizationIds: data.includeBypassAuthorizationIds ?? []
      });

      selectedItems.forEach((item) => {
        const itemRef = batchRef.collection("items").doc();
        const cycleRef = queueCyclesRef(data.siteId).doc(item.queueCycleId);
        const truckRef = trucksRef(data.siteId).doc(item.truckId);
        const atcNo = atcByCycle.get(item.queueCycleId)!;

        transaction.set(itemRef, {
          ...item,
          atcNo,
          siteId: data.siteId,
          batchId: batchRef.id,
          createdAt: now
        });

        transaction.update(cycleRef, {
          status: "PROGRAMMED",
          queueExitAt: now,
          programmedAt: now,
          programmingBatchId: batchRef.id,
          programmingType: item.selectionType,
          bypassRequestId: item.bypassRequestId ?? null,
          bypassAuthorizationId: item.bypassAuthorizationId ?? null,
          atcNo,
          updatedAt: now
        });

        transaction.update(truckRef, {
          currentStatus: "PROGRAMMED",
          updatedAt: now
        });

        if (item.bypassAuthorizationId) {
          transaction.update(bypassAuthorizationsRef(data.siteId).doc(item.bypassAuthorizationId), {
            status: "USED",
            usedAt: now
          });

          writeAuditEvent(transaction, {
            siteId: data.siteId,
            eventType: "BYPASS_OTP_USED",
            actorUserId: context.uid,
            actorRoles: context.roles,
            truckId: item.truckId,
            queueCycleId: item.queueCycleId,
            programmingBatchId: batchRef.id,
            bypassRequestId: item.bypassRequestId,
            bypassAuthorizationId: item.bypassAuthorizationId,
            previousState: { status: "VALIDATED" },
            newState: { status: "USED" }
          });
        }

        if (item.bypassRequestId) {
          transaction.update(bypassRequestsRef(data.siteId).doc(item.bypassRequestId), {
            status: "USED",
            updatedAt: now
          });
        }

        writeAuditEvent(transaction, {
          siteId: data.siteId,
          eventType: "TRUCK_PROGRAMMED",
          actorUserId: context.uid,
          actorRoles: context.roles,
          truckId: item.truckId,
          queueCycleId: item.queueCycleId,
          programmingBatchId: batchRef.id,
          bypassRequestId: item.bypassRequestId,
          bypassAuthorizationId: item.bypassAuthorizationId,
          metadata: {
            selectionType: item.selectionType,
            originalQueuePosition: item.originalQueuePosition,
            batchOrder: item.batchOrder,
            atcNo
          }
        });
      });

      writeAuditEvent(transaction, {
        siteId: data.siteId,
        eventType: "PROGRAMMING_BATCH_CONFIRMED",
        actorUserId: context.uid,
        actorRoles: context.roles,
        programmingBatchId: batchRef.id,
        metadata: {
          requestedSize: data.requestedSize,
          confirmedSize: selectedItems.length,
          fifoCount,
          bypassCount,
          atcCount: selectedItems.length
        }
      });

      return {
        batchId: batchRef.id,
        humanCode,
        confirmedSize: selectedItems.length,
        fifoCount,
        bypassCount,
        atcCount: selectedItems.length
      };
    });
  }
);
