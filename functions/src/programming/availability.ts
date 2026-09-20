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

// Operationally one hour. AVAILABILITY_WINDOW_MINUTES only exists so the rule
// can be exercised end to end without waiting an hour, and is clamped.
const availabilityWindowMinutes = Math.min(240, Math.max(1, Number(process.env.AVAILABILITY_WINDOW_MINUTES ?? 60)));
const availabilityWindowMs = availabilityWindowMinutes * 60 * 1000;

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
      availabilityWindowMinutes,
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
    transaction.update(item.ref, { availabilityStatus: "CONFIRMED", availabilityConfirmedAt: FieldValue.serverTimestamp(), confirmedBy: context.uid });
    transaction.update(cycleRef, { status: "READY_FOR_PROGRAMMING", availabilityConfirmedAt: FieldValue.serverTimestamp(), availabilityConfirmedBy: context.uid, updatedAt: FieldValue.serverTimestamp() });
    transaction.update(truckRef, { currentStatus: "READY_FOR_PROGRAMMING", updatedAt: FieldValue.serverTimestamp() });
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
      const [freshItem, cycleSnapshot, batchSnapshot] = await Promise.all([transaction.get(itemRef), transaction.get(cycleRef), transaction.get(batchRef)]);
      if (!freshItem.exists || !cycleSnapshot.exists) return false;
      const batchIsOpen = batchSnapshot.data()?.status === "AWAITING_AVAILABILITY";
      // Read the rest of the batch now, so we can tell afterwards whether this
      // run still has anything left to wait for or to program.
      const siblingItems = await transaction.get(batchRef.collection("items"));
      const otherPending = siblingItems.docs.filter((sibling) => sibling.id !== item.id && sibling.data().availabilityStatus === "PENDING").length;
      const anyConfirmed = siblingItems.docs.some((sibling) => sibling.data().availabilityStatus === "CONFIRMED");
      const current = freshItem.data() ?? {};
      if (current.availabilityStatus !== "PENDING" || timestamp(current.availabilityExpiresAt, "availability expiry").toMillis() > now.toMillis()) return false;
      const truckRef = trucksRef(siteId).doc(String(current.truckId));
      // Firestore transactions require every read to happen before the first write.
      // The next in line may not be usable (expired insurance), so consider a
      // few and take the first that can actually be asked.
      const candidateSnapshot = await transaction.get(queueCyclesRef(siteId).where("status", "==", "QUEUED").orderBy("queueEnteredAt", "asc").limit(10));
      const candidateTrucks = candidateSnapshot.docs.length
        ? await transaction.getAll(...candidateSnapshot.docs.map((candidate) => trucksRef(siteId).doc(String(candidate.data().truckId))))
        : [];
      const candidateIndex = candidateSnapshot.docs.findIndex((_, index) => {
        const candidateTruck = candidateTrucks[index];
        return candidateTruck?.exists && hasValidInsurance(candidateTruck.data() ?? {});
      });
      const replacement = candidateIndex < 0 ? undefined : candidateSnapshot.docs[candidateIndex];
      const replacementTruck = candidateIndex < 0 ? undefined : candidateTrucks[candidateIndex];
      const replacementTruckRef = replacementTruck ? trucksRef(siteId).doc(replacementTruck.id) : null;
      transaction.update(itemRef, { availabilityStatus: "EXPIRED", availabilityExpiredAt: FieldValue.serverTimestamp() });
      // A truck that missed its window goes straight back to the end of the
      // queue. Parking it until a replacement confirmed used to strand it for
      // good whenever no replacement confirmed, or the batch closed first.
      transaction.update(cycleRef, {
        status: "QUEUED",
        queueEnteredAt: FieldValue.serverTimestamp(),
        availabilityExpiredAt: FieldValue.serverTimestamp(),
        availabilityBatchId: FieldValue.delete(),
        availabilityItemId: FieldValue.delete(),
        availabilityExpiresAt: FieldValue.delete(),
        replacementForQueueCycleId: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp()
      });
      transaction.update(truckRef, {
        currentStatus: "QUEUED",
        availabilityBatchId: FieldValue.delete(),
        availabilityQueueCycleId: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp()
      });
      writeAuditEvent(transaction, { siteId, eventType: "AVAILABILITY_EXPIRED", actorUserId: "system", actorRoles: ["administrator"], truckId: String(current.truckId), queueCycleId, programmingBatchId: batchId });
      writeAuditEvent(transaction, { siteId, eventType: "QUEUE_REENTERED_AFTER_TIMEOUT", actorUserId: "system", actorRoles: ["administrator"], truckId: String(current.truckId), queueCycleId, programmingBatchId: batchId });
      if (!batchIsOpen || !replacement || !replacementTruckRef || !replacementTruck) {
        // Nobody left to ask and nobody confirmed: the run is over, so close it
        // rather than leaving the officer holding a batch that can never finish.
        if (batchIsOpen && !otherPending && !anyConfirmed) {
          transaction.update(batchRef, { status: "EXPIRED", closedAt: FieldValue.serverTimestamp() });
          writeAuditEvent(transaction, { siteId, eventType: "PROGRAMMING_BATCH_EXPIRED", actorUserId: "system", actorRoles: ["administrator"], programmingBatchId: batchId, metadata: { reason: "No truck confirmed availability." } });
        }
        return true;
      }
      const replacementData = replacement.data();
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

/**
 * Availability expiry used to park a truck in AWAITING_REPLACEMENT until its
 * replacement confirmed, which never happened if no replacement was found or
 * the batch closed first. Nothing produces that state now, so anything left in
 * it is stranded and belongs back in the queue.
 */
export async function requeueStrandedReplacements(): Promise<number> {
  const stranded = await db.collectionGroup("queueCycles").where("status", "==", "AWAITING_REPLACEMENT").limit(100).get();
  let count = 0;
  for (const cycle of stranded.docs) {
    const siteId = String(cycle.data().siteId ?? "");
    const truckId = String(cycle.data().truckId ?? "");
    if (!siteId || !truckId) continue;
    const changed = await db.runTransaction(async (transaction) => {
      const fresh = await transaction.get(cycle.ref);
      if (!fresh.exists || fresh.data()?.status !== "AWAITING_REPLACEMENT") return false;
      transaction.update(cycle.ref, {
        status: "QUEUED",
        queueEnteredAt: FieldValue.serverTimestamp(),
        replacementForQueueCycleId: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp()
      });
      transaction.update(trucksRef(siteId).doc(truckId), { currentStatus: "QUEUED", updatedAt: FieldValue.serverTimestamp() });
      writeAuditEvent(transaction, {
        siteId,
        eventType: "QUEUE_REENTERED_AFTER_TIMEOUT",
        actorUserId: "system",
        actorRoles: ["administrator"],
        truckId,
        queueCycleId: cycle.id,
        metadata: { reason: "Returned to the queue after waiting on a replacement that never came." }
      });
      return true;
    });
    if (changed) count += 1;
  }
  return count;
}

/**
 * A run where every truck's window expired can never be programmed, and the
 * officer's screen keeps restoring it. Close the ones already left open.
 */
export async function closeFinishedAvailabilityBatches(): Promise<number> {
  const open = await db.collectionGroup("programmingBatches").where("status", "==", "AWAITING_AVAILABILITY").limit(50).get();
  let count = 0;
  for (const batch of open.docs) {
    const siteId = String(batch.data().siteId ?? "");
    if (!siteId) continue;
    const items = await batch.ref.collection("items").get();
    const statuses = items.docs.map((item) => String(item.data().availabilityStatus));
    if (!statuses.length || statuses.some((status) => status === "PENDING" || status === "CONFIRMED")) continue;
    const changed = await db.runTransaction(async (transaction) => {
      const fresh = await transaction.get(batch.ref);
      if (fresh.data()?.status !== "AWAITING_AVAILABILITY") return false;
      transaction.update(batch.ref, { status: "EXPIRED", closedAt: FieldValue.serverTimestamp() });
      writeAuditEvent(transaction, {
        siteId,
        eventType: "PROGRAMMING_BATCH_EXPIRED",
        actorUserId: "system",
        actorRoles: ["administrator"],
        programmingBatchId: batch.id,
        metadata: { reason: "No truck confirmed availability." }
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
  const truckIds = [...new Set(items.docs.map((item) => String(item.data().truckId)))];
  const truckSnapshots = truckIds.length ? await db.getAll(...truckIds.map((truckId) => trucksRef(data.siteId).doc(truckId))) : [];
  const trucksById = new Map(truckSnapshots.map((snapshot) => [snapshot.id, snapshot.data() ?? {}]));
  return {
    batchId: data.batchId,
    humanCode: String(batch.data()?.humanCode ?? data.batchId),
    status: String(batch.data()?.status ?? "UNKNOWN"),
    items: items.docs.map((item) => {
      const value = item.data();
      const truck = trucksById.get(String(value.truckId)) ?? {};
      return {
        queueCycleId: String(value.queueCycleId),
        truckId: String(value.truckId),
        registrationNumber: String(truck.registrationNumber ?? value.truckId),
        driverName: String(truck.driverName ?? "Driver not recorded"),
        batchOrder: Number(value.batchOrder),
        availabilityStatus: String(value.availabilityStatus),
        expiresAt: value.availabilityExpiresAt instanceof Timestamp ? value.availabilityExpiresAt.toDate().toISOString() : undefined
      };
    }).sort((left, right) => left.batchOrder - right.batchOrder)
  };
});
