import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { confirmTruckAvailabilityInputSchema, getAvailabilityBatchInputSchema, startAvailabilityBatchInputSchema } from "@refinery/validation";
import { formatProgrammingBatchCode } from "@refinery/shared";
import { validatedCall } from "../shared/callable.js";
import { requireAuth, requireRole, requireSameSite } from "../shared/auth.js";
import { db } from "../shared/firebase.js";
import { failedPrecondition, notFound, permissionDenied } from "../shared/errors.js";
import { programmingBatchesRef, queueCyclesRef, trucksRef } from "../shared/paths.js";
import { writeAuditEvent } from "../shared/audit.js";
import { writeNotification } from "../shared/notifications.js";
import { selectProgrammingBatch } from "./selectProgrammingBatch.js";

const availabilityWindowMs = 60 * 60 * 1000;

function hasValidInsurance(truck: Record<string, unknown>): boolean {
  return truck.latestInsuranceStatus === "VALID" || truck.latestInsuranceStatus === "EXPIRING_SOON";
}

function timestamp(value: unknown, label: string): FirebaseFirestore.Timestamp {
  if (value instanceof Timestamp) return value;
  failedPrecondition(`${label} is missing or invalid.`);
}

export const startAvailabilityBatch = validatedCall(startAvailabilityBatchInputSchema, async (data, request) => {
  const context = requireAuth(request);
  requireSameSite(context, data.siteId);
  requireRole(context, "programmingOfficer");
  return db.runTransaction(async (transaction) => {
    const selected = await selectProgrammingBatch(transaction, { ...data, now: Timestamp.now() });
    // Firestore transactions require every read to happen before the first write.
    const truckSnapshots = selected.length
      ? await transaction.getAll(...selected.map((item) => trucksRef(data.siteId).doc(item.truckId)))
      : [];
    const trucksById = new Map(truckSnapshots.map((snapshot) => [snapshot.id, snapshot]));
    for (const item of selected) {
      const truckSnapshot = trucksById.get(item.truckId);
      if (!truckSnapshot?.exists || !hasValidInsurance(truckSnapshot.data() ?? {})) {
        failedPrecondition("Every truck in an availability batch must have valid insurance.");
      }
    }
    const batchRef = programmingBatchesRef(data.siteId).doc();
    const now = Timestamp.now();
    const expiresAt = Timestamp.fromMillis(now.toMillis() + availabilityWindowMs);
    const humanCode = formatProgrammingBatchCode(new Date(), Date.now() % 10000);
    transaction.set(batchRef, {
      siteId: data.siteId,
      humanCode,
      requestedSize: data.requestedSize,
      confirmedSize: 0,
      fifoCount: selected.filter((item) => item.selectionType === "FIFO").length,
      bypassCount: selected.filter((item) => item.selectionType === "BYPASS").length,
      status: "AWAITING_AVAILABILITY",
      createdBy: context.uid,
      createdAt: FieldValue.serverTimestamp(),
      availabilityStartedAt: FieldValue.serverTimestamp(),
      availabilityWindowMinutes: 60,
      includedBypassAuthorizationIds: data.includeBypassAuthorizationIds ?? []
    });
    for (const item of selected) {
      const cycleRef = queueCyclesRef(data.siteId).doc(item.queueCycleId);
      const truckRef = trucksRef(data.siteId).doc(item.truckId);
      const truckSnapshot = trucksById.get(item.truckId)!;
      const itemRef = batchRef.collection("items").doc();
      transaction.set(itemRef, {
        ...item,
        siteId: data.siteId,
        batchId: batchRef.id,
        availabilityStatus: "PENDING",
        availabilityRequestedAt: now,
        availabilityExpiresAt: expiresAt,
        createdAt: FieldValue.serverTimestamp()
      });
      transaction.update(cycleRef, {
        status: "AWAITING_AVAILABILITY",
        availabilityBatchId: batchRef.id,
        availabilityItemId: itemRef.id,
        availabilityRequestedAt: now,
        availabilityExpiresAt: expiresAt,
        updatedAt: FieldValue.serverTimestamp()
      });
      transaction.update(truckRef, { currentStatus: "AWAITING_AVAILABILITY", availabilityBatchId: batchRef.id, availabilityQueueCycleId: item.queueCycleId, updatedAt: FieldValue.serverTimestamp() });
      writeNotification(transaction, {
        siteId: data.siteId,
        userId: String(truckSnapshot.data()?.assignedFleetOfficerId),
        type: "AVAILABILITY_REQUESTED",
        title: "Availability confirmation needed",
        body: `${String(truckSnapshot.data()?.registrationNumber ?? item.truckId)} has one hour to confirm availability for programming.`,
        truckId: item.truckId
      });
      writeAuditEvent(transaction, {
        siteId: data.siteId,
        eventType: "AVAILABILITY_REQUESTED",
        actorUserId: context.uid,
        actorRoles: context.roles,
        truckId: item.truckId,
        queueCycleId: item.queueCycleId,
        programmingBatchId: batchRef.id,
        metadata: { expiresAt: expiresAt.toDate().toISOString(), batchOrder: item.batchOrder }
      });
    }
    return { batchId: batchRef.id, humanCode, requestedSize: data.requestedSize, expiresAt: expiresAt.toDate().toISOString() };
  });
});

export const confirmTruckAvailability = validatedCall(confirmTruckAvailabilityInputSchema, async (data, request) => {
  const context = requireAuth(request);
  requireSameSite(context, data.siteId);
  requireRole(context, "fleetOfficer");
  return db.runTransaction(async (transaction) => {
    const batchRef = programmingBatchesRef(data.siteId).doc(data.batchId);
    const itemSnapshot = await transaction.get(batchRef.collection("items").where("queueCycleId", "==", data.queueCycleId).limit(1));
    const item = itemSnapshot.docs[0];
    if (!item) notFound("This truck is not awaiting confirmation in the batch.");
    const itemData = item.data();
    const cycleRef = queueCyclesRef(data.siteId).doc(data.queueCycleId);
    const truckRef = trucksRef(data.siteId).doc(String(itemData.truckId));
    const [cycleSnapshot, truckSnapshot] = await Promise.all([transaction.get(cycleRef), transaction.get(truckRef)]);
    if (!cycleSnapshot.exists || !truckSnapshot.exists) notFound("The queued truck was not found.");
    const truck = truckSnapshot.data() ?? {};
    if (truck.assignedFleetOfficerId !== context.uid) permissionDenied("Fleet officers can only confirm availability for assigned trucks.");
    if (!hasValidInsurance(truck)) failedPrecondition("The truck must have valid insurance before availability can be confirmed.");
    if (itemData.availabilityStatus !== "PENDING" || cycleSnapshot.data()?.status !== "AWAITING_AVAILABILITY") failedPrecondition("This availability request is no longer open.");
    if (timestamp(itemData.availabilityExpiresAt, "availability expiry").toMillis() <= Date.now()) failedPrecondition("The one-hour availability window has expired.");
    // Firestore transactions require every read to happen before the first write,
    // so collect the chain of timed-out trucks this confirmation replaces first.
    const replacedChain: Array<{ id: string; ref: FirebaseFirestore.DocumentReference; data: FirebaseFirestore.DocumentData }> = [];
    let nextReplacedId = String(cycleSnapshot.data()?.replacementForQueueCycleId ?? "");
    for (let depth = 0; nextReplacedId && depth < 20; depth += 1) {
      const replacedRef = queueCyclesRef(data.siteId).doc(nextReplacedId);
      const replacedSnapshot = await transaction.get(replacedRef);
      if (!replacedSnapshot.exists || replacedSnapshot.data()?.status !== "AWAITING_REPLACEMENT") break;
      replacedChain.push({ id: nextReplacedId, ref: replacedRef, data: replacedSnapshot.data() ?? {} });
      nextReplacedId = String(replacedSnapshot.data()?.replacementForQueueCycleId ?? "");
    }
    transaction.update(item.ref, { availabilityStatus: "CONFIRMED", availabilityConfirmedAt: FieldValue.serverTimestamp(), confirmedBy: context.uid });
    transaction.update(cycleRef, { status: "READY_FOR_PROGRAMMING", availabilityConfirmedAt: FieldValue.serverTimestamp(), availabilityConfirmedBy: context.uid, updatedAt: FieldValue.serverTimestamp() });
    transaction.update(truckRef, { currentStatus: "READY_FOR_PROGRAMMING", updatedAt: FieldValue.serverTimestamp() });
    for (const { id: replacedCycleId, ref: replacedRef, data: replaced } of replacedChain) {
      const replacedTruckRef = trucksRef(data.siteId).doc(String(replaced.truckId));
      transaction.update(replacedRef, {
        status: "QUEUED",
        queueEnteredAt: FieldValue.serverTimestamp(),
        replacementForQueueCycleId: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp()
      });
      transaction.update(replacedTruckRef, { currentStatus: "QUEUED", updatedAt: FieldValue.serverTimestamp() });
      writeAuditEvent(transaction, {
        siteId: data.siteId,
        eventType: "QUEUE_REENTERED_AFTER_TIMEOUT",
        actorUserId: context.uid,
        actorRoles: context.roles,
        truckId: String(replaced.truckId),
        queueCycleId: replacedCycleId,
        programmingBatchId: data.batchId,
        metadata: { replacementQueueCycleId: data.queueCycleId }
      });
    }
    writeAuditEvent(transaction, {
      siteId: data.siteId,
      eventType: "AVAILABILITY_CONFIRMED",
      actorUserId: context.uid,
      actorRoles: context.roles,
      truckId: String(itemData.truckId),
      queueCycleId: data.queueCycleId,
      programmingBatchId: data.batchId
    });
    return { queueCycleId: data.queueCycleId, status: "READY_FOR_PROGRAMMING" as const };
  });
});

export async function expireAvailabilityRequests(now = Timestamp.now()): Promise<number> {
  const expired = await db.collectionGroup("items")
    .where("availabilityStatus", "==", "PENDING")
    .where("availabilityExpiresAt", "<=", now)
    .limit(100)
    .get();
  let count = 0;
  for (const item of expired.docs) {
    const itemData = item.data();
    const siteId = String(itemData.siteId ?? "");
    const batchId = String(itemData.batchId ?? "");
    const queueCycleId = String(itemData.queueCycleId ?? "");
    if (!siteId || !batchId || !queueCycleId) continue;
    const changed = await db.runTransaction(async (transaction) => {
      const batchRef = programmingBatchesRef(siteId).doc(batchId);
      const itemRef = batchRef.collection("items").doc(item.id);
      const cycleRef = queueCyclesRef(siteId).doc(queueCycleId);
      const [freshItem, cycleSnapshot] = await Promise.all([transaction.get(itemRef), transaction.get(cycleRef)]);
      if (!freshItem.exists || !cycleSnapshot.exists) return false;
      const current = freshItem.data() ?? {};
      if (current.availabilityStatus !== "PENDING" || timestamp(current.availabilityExpiresAt, "availability expiry").toMillis() > now.toMillis()) return false;
      const truckRef = trucksRef(siteId).doc(String(current.truckId));
      // Firestore transactions require every read to happen before the first write.
      const replacementSnapshot = await transaction.get(queueCyclesRef(siteId).where("status", "==", "QUEUED").orderBy("queueEnteredAt", "asc").limit(1));
      const replacement = replacementSnapshot.docs[0];
      const replacementTruckRef = replacement ? trucksRef(siteId).doc(String(replacement.data().truckId)) : null;
      const replacementTruck = replacementTruckRef ? await transaction.get(replacementTruckRef) : null;
      transaction.update(itemRef, { availabilityStatus: "EXPIRED", availabilityExpiredAt: FieldValue.serverTimestamp() });
      transaction.update(cycleRef, { status: "AWAITING_REPLACEMENT", availabilityExpiredAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      transaction.update(truckRef, { currentStatus: "AWAITING_REPLACEMENT", updatedAt: FieldValue.serverTimestamp() });
      writeAuditEvent(transaction, { siteId, eventType: "AVAILABILITY_EXPIRED", actorUserId: "system", actorRoles: ["administrator"], truckId: String(current.truckId), queueCycleId, programmingBatchId: batchId });
      if (!replacement || !replacementTruckRef || !replacementTruck) return true;
      const replacementData = replacement.data();
      if (!replacementTruck.exists || !hasValidInsurance(replacementTruck.data() ?? {})) return true;
      const replacementItemRef = batchRef.collection("items").doc();
      const expiresAt = Timestamp.fromMillis(now.toMillis() + availabilityWindowMs);
      transaction.set(replacementItemRef, {
        siteId, batchId, truckId: String(replacementData.truckId), queueCycleId: replacement.id,
        batchOrder: Number(current.batchOrder ?? 0), selectionType: "FIFO", originalQueuePosition: 1,
        queueEnteredAt: replacementData.queueEnteredAt, replacementForQueueCycleId: queueCycleId,
        availabilityStatus: "PENDING", availabilityRequestedAt: now, availabilityExpiresAt: expiresAt,
        createdAt: FieldValue.serverTimestamp()
      });
      transaction.update(replacement.ref, {
        status: "AWAITING_AVAILABILITY", availabilityBatchId: batchId, availabilityItemId: replacementItemRef.id,
        availabilityRequestedAt: now, availabilityExpiresAt: expiresAt, replacementForQueueCycleId: queueCycleId,
        updatedAt: FieldValue.serverTimestamp()
      });
      transaction.update(replacementTruckRef, { currentStatus: "AWAITING_AVAILABILITY", availabilityBatchId: batchId, availabilityQueueCycleId: replacement.id, updatedAt: FieldValue.serverTimestamp() });
      writeNotification(transaction, {
        siteId, userId: String(replacementTruck.data()?.assignedFleetOfficerId), type: "AVAILABILITY_REQUESTED",
        title: "Availability confirmation needed",
        body: `${String(replacementTruck.data()?.registrationNumber ?? replacementData.truckId)} has one hour to confirm availability for an open programming slot.`,
        truckId: String(replacementData.truckId)
      });
      return true;
    });
    if (changed) count += 1;
  }
  return count;
}

export const getAvailabilityBatch = validatedCall(getAvailabilityBatchInputSchema, async (data, request) => {
  const context = requireAuth(request);
  requireSameSite(context, data.siteId);
  requireRole(context, "programmingOfficer");
  const batchRef = programmingBatchesRef(data.siteId).doc(data.batchId);
  const [batch, items] = await Promise.all([batchRef.get(), batchRef.collection("items").get()]);
  if (!batch.exists) notFound("The availability batch was not found.");
  return {
    batchId: data.batchId,
    humanCode: String(batch.data()?.humanCode ?? data.batchId),
    status: String(batch.data()?.status ?? "UNKNOWN"),
    items: items.docs.map((item) => {
      const value = item.data();
      return {
        queueCycleId: String(value.queueCycleId),
        truckId: String(value.truckId),
        batchOrder: Number(value.batchOrder),
        availabilityStatus: String(value.availabilityStatus),
        expiresAt: value.availabilityExpiresAt instanceof Timestamp ? value.availabilityExpiresAt.toDate().toISOString() : undefined
      };
    }).sort((left, right) => left.batchOrder - right.batchOrder)
  };
});
