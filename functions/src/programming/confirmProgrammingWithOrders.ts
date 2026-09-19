import { FieldValue } from "firebase-admin/firestore";
import { confirmProgrammingWithOrdersInputSchema } from "@refinery/validation";
import { validatedCall } from "../shared/callable.js";
import { requireAuth, requireRole, requireSameSite } from "../shared/auth.js";
import { db } from "../shared/firebase.js";
import { failedPrecondition, notFound } from "../shared/errors.js";
import { bypassAuthorizationsRef, bypassRequestsRef, ordersRef, programmingBatchesRef, queueCyclesRef, trucksRef } from "../shared/paths.js";
import { writeAuditEvent } from "../shared/audit.js";

export const confirmProgrammingWithOrders = validatedCall(confirmProgrammingWithOrdersInputSchema, async (data, request) => {
  const context = requireAuth(request);
  requireSameSite(context, data.siteId);
  requireRole(context, "programmingOfficer");
  return db.runTransaction(async (transaction) => {
    const batchRef = programmingBatchesRef(data.siteId).doc(data.batchId);
    const batchSnapshot = await transaction.get(batchRef);
    if (!batchSnapshot.exists) notFound("The availability batch was not found.");
    if (batchSnapshot.data()?.status !== "AWAITING_AVAILABILITY") failedPrecondition("This batch is no longer ready for programming.");
    const itemSnapshot = await transaction.get(batchRef.collection("items").where("availabilityStatus", "==", "CONFIRMED"));
    const items = itemSnapshot.docs
      .map((document) => ({ id: document.id, ...document.data() }) as Record<string, unknown> & { id: string })
      .sort((left, right) => Number(left.batchOrder) - Number(right.batchOrder));
    if (!items.length) failedPrecondition("No trucks have confirmed availability in this batch.");
    const assignmentByCycle = new Map(data.orderAssignments.map((item) => [item.queueCycleId, item.orderId]));
    if (assignmentByCycle.size !== items.length || items.some((item) => !assignmentByCycle.has(String(item.queueCycleId)))) {
      failedPrecondition("Select one imported order for every confirmed truck.");
    }
    const orderIds = [...assignmentByCycle.values()];
    if (new Set(orderIds).size !== orderIds.length) failedPrecondition("An imported order can only be assigned once.");
    const orderSnapshots = await transaction.getAll(...orderIds.map((orderId) => ordersRef(data.siteId).doc(orderId)));
    const orders = new Map(orderSnapshots.map((snapshot) => [snapshot.id, snapshot]));
    for (const item of items) {
      const orderId = assignmentByCycle.get(String(item.queueCycleId))!;
      const orderSnapshot = orders.get(orderId);
      if (!orderSnapshot?.exists || orderSnapshot.data()?.status !== "AVAILABLE") failedPrecondition("Every selected order must still be available.");
      const cycleRef = queueCyclesRef(data.siteId).doc(String(item.queueCycleId));
      const cycleSnapshot = await transaction.get(cycleRef);
      if (!cycleSnapshot.exists || cycleSnapshot.data()?.status !== "READY_FOR_PROGRAMMING") failedPrecondition("Every truck must still have confirmed availability.");
      const atcNo = String(orderSnapshot.data()?.atcNo ?? "").trim().toUpperCase();
      transaction.update(orderSnapshot.ref, { status: "PROGRAMMED", assignedQueueCycleId: String(item.queueCycleId), assignedTruckId: String(item.truckId), programmingBatchId: data.batchId, assignedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      transaction.update(cycleRef, { status: "PROGRAMMED", queueExitAt: FieldValue.serverTimestamp(), programmedAt: FieldValue.serverTimestamp(), programmingBatchId: data.batchId, programmingType: item.selectionType, atcNo, orderId, updatedAt: FieldValue.serverTimestamp() });
      transaction.update(trucksRef(data.siteId).doc(String(item.truckId)), { currentStatus: "PROGRAMMED", updatedAt: FieldValue.serverTimestamp() });
      if (item.bypassAuthorizationId) transaction.update(bypassAuthorizationsRef(data.siteId).doc(String(item.bypassAuthorizationId)), { status: "USED", usedAt: FieldValue.serverTimestamp() });
      if (item.bypassRequestId) transaction.update(bypassRequestsRef(data.siteId).doc(String(item.bypassRequestId)), { status: "USED", updatedAt: FieldValue.serverTimestamp() });
      writeAuditEvent(transaction, { siteId: data.siteId, eventType: "ORDER_ATC_ASSIGNED", actorUserId: context.uid, actorRoles: context.roles, truckId: String(item.truckId), queueCycleId: String(item.queueCycleId), programmingBatchId: data.batchId, relatedRecordPath: orderSnapshot.ref.path, metadata: { orderId, atcNo, salesOrderNo: orderSnapshot.data()?.salesOrderNo } });
      writeAuditEvent(transaction, { siteId: data.siteId, eventType: "TRUCK_PROGRAMMED", actorUserId: context.uid, actorRoles: context.roles, truckId: String(item.truckId), queueCycleId: String(item.queueCycleId), programmingBatchId: data.batchId, metadata: { selectionType: item.selectionType, batchOrder: item.batchOrder, atcNo, orderId } });
    }
    transaction.update(batchRef, { status: "CONFIRMED", confirmedSize: items.length, confirmedBy: context.uid, confirmedAt: FieldValue.serverTimestamp() });
    writeAuditEvent(transaction, { siteId: data.siteId, eventType: "PROGRAMMING_BATCH_CONFIRMED", actorUserId: context.uid, actorRoles: context.roles, programmingBatchId: data.batchId, metadata: { confirmedSize: items.length } });
    return { batchId: data.batchId, humanCode: String(batchSnapshot.data()?.humanCode), confirmedSize: items.length, atcCount: items.length };
  });
});
