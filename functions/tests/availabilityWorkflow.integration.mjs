import assert from "node:assert/strict";
import test from "node:test";

const { Timestamp } = await import("firebase-admin/firestore");
const { db } = await import("../lib/shared/firebase.js");
const { startAvailabilityBatch, confirmTruckAvailability, expireAvailabilityRequests, requeueStrandedReplacements } = await import("../lib/programming/availability.js");
const { confirmProgrammingWithOrders } = await import("../lib/programming/confirmProgrammingWithOrders.js");
const { confirmTruckDispatch } = await import("../lib/dispatch/confirmTruckDispatch.js");

const siteId = "availability-site";
const fleetOfficerId = "availability-fleet-officer";
const programmerId = "availability-programmer";

function request(uid, roles, data) {
  return { auth: { uid, token: { siteId, roles } }, data };
}

const truckRef = (id) => db.doc(`sites/${siteId}/trucks/${id}`);
const cycleRef = (id) => db.doc(`sites/${siteId}/queueCycles/${id}`);
const orderRef = (id) => db.doc(`sites/${siteId}/orders/${id}`);

async function seedQueuedTruck(id, enteredAtMillis) {
  await Promise.all([
    truckRef(id).set({ registrationNumber: id.toUpperCase(), normalizedRegistration: id.toUpperCase(), assignedFleetOfficerId: fleetOfficerId, currentStatus: "QUEUED", activeCycleId: `${id}-cycle`, isActive: true, latestInsuranceStatus: "VALID" }),
    cycleRef(`${id}-cycle`).set({ siteId, truckId: id, fleetOfficerId, status: "QUEUED", queueEnteredAt: Timestamp.fromMillis(enteredAtMillis) })
  ]);
}

test("availability batch confirms, expires, replaces from FIFO, re-queues the expired truck, and programs with imported orders", async () => {
  const now = Date.now();
  await seedQueuedTruck("truck-a", now - 300000);
  await seedQueuedTruck("truck-b", now - 200000);
  await seedQueuedTruck("truck-c", now - 100000);
  await Promise.all([
    orderRef("order-1").set({ siteId, status: "AVAILABLE", atcNo: "0472438", salesOrderNo: "3100458812", createdAt: Timestamp.fromMillis(now) }),
    orderRef("order-2").set({ siteId, status: "AVAILABLE", atcNo: "0472439", salesOrderNo: "3100458813", createdAt: Timestamp.fromMillis(now) })
  ]);

  const started = await startAvailabilityBatch.run(request(programmerId, ["programmingOfficer"], { siteId, requestedSize: 2 }));
  const [cycleA, cycleB, cycleC] = await Promise.all(["truck-a", "truck-b", "truck-c"].map((id) => cycleRef(`${id}-cycle`).get()));
  assert.equal(cycleA.data()?.status, "AWAITING_AVAILABILITY");
  assert.equal(cycleB.data()?.status, "AWAITING_AVAILABILITY");
  assert.equal(cycleC.data()?.status, "QUEUED");

  await confirmTruckAvailability.run(request(fleetOfficerId, ["fleetOfficer"], { siteId, batchId: started.batchId, queueCycleId: "truck-a-cycle" }));
  assert.equal((await cycleRef("truck-a-cycle").get()).data()?.status, "READY_FOR_PROGRAMMING");

  const expiredCount = await expireAvailabilityRequests(Timestamp.fromMillis(now + 61 * 60 * 1000));
  assert.equal(expiredCount, 1);
  // The truck that missed its window goes back to the queue at once, rather
  // than waiting on a replacement that may never confirm.
  const requeued = await cycleRef("truck-b-cycle").get();
  assert.equal(requeued.data()?.status, "QUEUED");
  assert.ok(requeued.data()?.queueEnteredAt.toMillis() > now, "expired truck must return to the back of the queue");
  assert.equal((await truckRef("truck-b").get()).data()?.currentStatus, "QUEUED");
  const replacementCycle = await cycleRef("truck-c-cycle").get();
  assert.equal(replacementCycle.data()?.status, "AWAITING_AVAILABILITY");
  assert.equal(replacementCycle.data()?.replacementForQueueCycleId, "truck-b-cycle");

  await confirmTruckAvailability.run(request(fleetOfficerId, ["fleetOfficer"], { siteId, batchId: started.batchId, queueCycleId: "truck-c-cycle" }));

  const programmed = await confirmProgrammingWithOrders.run(request(programmerId, ["programmingOfficer"], {
    siteId,
    batchId: started.batchId,
    orderAssignments: [
      { queueCycleId: "truck-a-cycle", orderId: "order-1" },
      { queueCycleId: "truck-c-cycle", orderId: "order-2" }
    ]
  }));
  assert.equal(programmed.confirmedSize, 2);

  const [finalA, finalC, order1, order2, batch] = await Promise.all([
    cycleRef("truck-a-cycle").get(),
    cycleRef("truck-c-cycle").get(),
    orderRef("order-1").get(),
    orderRef("order-2").get(),
    db.doc(`sites/${siteId}/programmingBatches/${started.batchId}`).get()
  ]);
  assert.equal(finalA.data()?.status, "PROGRAMMED");
  assert.equal(finalA.data()?.atcNo, "0472438");
  assert.equal(finalC.data()?.status, "PROGRAMMED");
  assert.equal(finalC.data()?.atcNo, "0472439");
  assert.equal(order1.data()?.status, "PROGRAMMED");
  assert.equal(order2.data()?.status, "PROGRAMMED");
  assert.equal(batch.data()?.status, "CONFIRMED");

  const dispatched = await confirmTruckDispatch.run(request(programmerId, ["programmingOfficer"], { siteId, queueCycleId: "truck-a-cycle" }));
  assert.equal(dispatched.status, "DISPATCHED");
  const [dispatchedCycle, dispatchedTruck] = await Promise.all([cycleRef("truck-a-cycle").get(), truckRef("truck-a").get()]);
  assert.equal(dispatchedCycle.data()?.status, "DISPATCHED");
  assert.equal(dispatchedTruck.data()?.currentStatus, "ON_TRIP");
  assert.equal(dispatchedTruck.data()?.activeCycleId, null);
  await assert.rejects(() => confirmTruckDispatch.run(request(programmerId, ["programmingOfficer"], { siteId, queueCycleId: "truck-a-cycle" })), /already recorded as dispatched/);
  await assert.rejects(() => confirmTruckDispatch.run(request(fleetOfficerId, ["fleetOfficer"], { siteId, queueCycleId: "truck-c-cycle" })));

  const auditEventsAfterDispatch = await db.collection(`sites/${siteId}/auditEvents`).get();
  const eventTypes = new Set(auditEventsAfterDispatch.docs.map((item) => item.data().eventType));
  ["DISPATCH_CONFIRMED", "AVAILABILITY_REQUESTED", "AVAILABILITY_CONFIRMED", "AVAILABILITY_EXPIRED", "QUEUE_REENTERED_AFTER_TIMEOUT", "ORDER_ATC_ASSIGNED", "TRUCK_PROGRAMMED", "PROGRAMMING_BATCH_CONFIRMED"]
    .forEach((eventType) => assert.ok(eventTypes.has(eventType), `missing ${eventType}`));
});

test("a truck whose window expires with nobody left to replace it still returns to the queue", async () => {
  const now = Date.now();
  const lonelySite = `${siteId}-lonely`;
  const lonelyTruck = db.doc(`sites/${lonelySite}/trucks/truck-lone`);
  const lonelyCycle = db.doc(`sites/${lonelySite}/queueCycles/truck-lone-cycle`);
  await Promise.all([
    lonelyTruck.set({ registrationNumber: "TRUCK-LONE", normalizedRegistration: "TRUCK-LONE", assignedFleetOfficerId: fleetOfficerId, currentStatus: "QUEUED", activeCycleId: "truck-lone-cycle", isActive: true, latestInsuranceStatus: "VALID" }),
    lonelyCycle.set({ siteId: lonelySite, truckId: "truck-lone", fleetOfficerId, status: "QUEUED", queueEnteredAt: Timestamp.fromMillis(now - 300000) })
  ]);

  await startAvailabilityBatch.run({ auth: { uid: programmerId, token: { siteId: lonelySite, roles: ["programmingOfficer"] } }, data: { siteId: lonelySite, requestedSize: 1 } });
  assert.equal((await lonelyCycle.get()).data()?.status, "AWAITING_AVAILABILITY");

  await expireAvailabilityRequests(Timestamp.fromMillis(now + 61 * 60 * 1000));

  const after = await lonelyCycle.get();
  assert.equal(after.data()?.status, "QUEUED", "with no replacement available the truck must not be stranded");
  assert.equal((await lonelyTruck.get()).data()?.currentStatus, "QUEUED");
  assert.ok(after.data()?.queueEnteredAt.toMillis() > now, "it returns to the back of the queue");
});

test("a truck already stranded in AWAITING_REPLACEMENT is swept back into the queue", async () => {
  const now = Date.now();
  const strandedSite = `${siteId}-stranded`;
  const strandedTruck = db.doc(`sites/${strandedSite}/trucks/truck-stuck`);
  const strandedCycle = db.doc(`sites/${strandedSite}/queueCycles/truck-stuck-cycle`);
  await Promise.all([
    strandedTruck.set({ registrationNumber: "TRUCK-STUCK", normalizedRegistration: "TRUCK-STUCK", assignedFleetOfficerId: fleetOfficerId, currentStatus: "AWAITING_REPLACEMENT", activeCycleId: "truck-stuck-cycle", isActive: true, latestInsuranceStatus: "VALID" }),
    strandedCycle.set({ siteId: strandedSite, truckId: "truck-stuck", fleetOfficerId, status: "AWAITING_REPLACEMENT", queueEnteredAt: Timestamp.fromMillis(now - 900000) })
  ]);

  const swept = await requeueStrandedReplacements();
  assert.ok(swept >= 1);

  const after = await strandedCycle.get();
  assert.equal(after.data()?.status, "QUEUED");
  assert.equal((await strandedTruck.get()).data()?.currentStatus, "QUEUED");
  assert.equal(await requeueStrandedReplacements(), 0, "the sweep leaves nothing behind to do twice");
});
