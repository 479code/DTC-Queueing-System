import assert from "node:assert/strict";
import test from "node:test";

process.env.BYPASS_OTP_PEPPER = "rules-test-pepper-that-is-at-least-thirty-two-characters";

const { Timestamp } = await import("firebase-admin/firestore");
const { db } = await import("../lib/shared/firebase.js");
const { reportTruckReturn } = await import("../lib/returns/reportTruckReturn.js");
const { expireInsuranceRecords } = await import("../lib/insurance/expireInsurance.js");
const { requestBypass } = await import("../lib/bypass/requestBypass.js");
const { rejectBypass } = await import("../lib/bypass/rejectBypass.js");
const { startAvailabilityBatch, confirmTruckAvailability } = await import("../lib/programming/availability.js");
const { confirmProgrammingWithOrders } = await import("../lib/programming/confirmProgrammingWithOrders.js");
const { parseOrderRows } = await import("../lib/orders/parseOrderRows.js");

const fleetOfficerId = "rules-fleet-officer";
const overseerId = "rules-overseer";
const programmerId = "rules-programmer";

function request(siteId, uid, roles, data) {
  return { auth: { uid, token: { siteId, roles } }, data };
}

const truckRef = (siteId, id) => db.doc(`sites/${siteId}/trucks/${id}`);
const cycleRef = (siteId, id) => db.doc(`sites/${siteId}/queueCycles/${id}`);

async function seedTruck(siteId, id, overrides = {}) {
  await truckRef(siteId, id).set({
    siteId,
    registrationNumber: id.toUpperCase(),
    normalizedRegistration: id.toUpperCase(),
    assignedFleetOfficerId: fleetOfficerId,
    currentStatus: "ON_TRIP",
    activeCycleId: null,
    isActive: true,
    latestInsuranceStatus: "VALID",
    ...overrides
  });
}

async function seedQueued(siteId, id, enteredAtMillis) {
  await seedTruck(siteId, id, { currentStatus: "QUEUED", activeCycleId: `${id}-cycle` });
  await cycleRef(siteId, `${id}-cycle`).set({
    siteId, truckId: id, fleetOfficerId, status: "QUEUED", queueEnteredAt: Timestamp.fromMillis(enteredAtMillis)
  });
}

test("insurance that lapses while a truck is queued removes it from the queue", async () => {
  const siteId = "rules-insurance-site";
  const now = Date.now();
  await seedQueued(siteId, "lapsing-truck", now - 60000);
  await truckRef(siteId, "lapsing-truck").update({
    latestInsuranceExpiry: Timestamp.fromMillis(now - 1000)
  });

  await expireInsuranceRecords();

  const [truck, cycle] = await Promise.all([
    truckRef(siteId, "lapsing-truck").get(),
    cycleRef(siteId, "lapsing-truck-cycle").get()
  ]);
  assert.equal(truck.data()?.latestInsuranceStatus, "EXPIRED");
  assert.equal(truck.data()?.currentStatus, "INSURANCE_HOLD", "a queued truck whose cover lapses must leave the queue");
  assert.equal(cycle.data()?.status, "INSURANCE_HOLD");

  const events = await db.collection(`sites/${siteId}/auditEvents`).get();
  assert.ok(events.docs.some((item) => item.data().eventType === "INSURANCE_HOLD_APPLIED"));
});

test("a truck on insurance hold cannot report a return into the queue", async () => {
  const siteId = "rules-hold-site";
  await seedTruck(siteId, "expired-truck", { latestInsuranceStatus: "EXPIRED" });

  const result = await reportTruckReturn.run(request(siteId, fleetOfficerId, ["fleetOfficer"], { siteId, truckId: "expired-truck" }));
  assert.equal(result.status, "INSURANCE_HOLD");

  const queued = await db.collection(`sites/${siteId}/queueCycles`).where("status", "==", "QUEUED").get();
  assert.equal(queued.docs.length, 0, "an uninsured truck must never enter the FIFO queue");
});

test("the same truck cannot be reported returned twice", async () => {
  const siteId = "rules-duplicate-return-site";
  await seedTruck(siteId, "double-truck");

  await reportTruckReturn.run(request(siteId, fleetOfficerId, ["fleetOfficer"], { siteId, truckId: "double-truck" }));
  await assert.rejects(
    () => reportTruckReturn.run(request(siteId, fleetOfficerId, ["fleetOfficer"], { siteId, truckId: "double-truck" })),
    /already has an active cycle/i
  );

  const cycles = await db.collection(`sites/${siteId}/queueCycles`).get();
  assert.equal(cycles.docs.length, 1, "a duplicate return must not create a second queue entry");
});

test("a truck cannot be programmed twice and an order cannot be assigned twice", async () => {
  const siteId = "rules-concurrency-site";
  const now = Date.now();
  await seedQueued(siteId, "batch-truck-a", now - 300000);
  await seedQueued(siteId, "batch-truck-b", now - 200000);
  await Promise.all([
    db.doc(`sites/${siteId}/orders/order-x`).set({ siteId, status: "AVAILABLE", atcNo: "0500001", salesOrderNo: "SO-1", createdAt: Timestamp.now() }),
    db.doc(`sites/${siteId}/orders/order-y`).set({ siteId, status: "AVAILABLE", atcNo: "0500002", salesOrderNo: "SO-2", createdAt: Timestamp.now() })
  ]);

  const started = await startAvailabilityBatch.run(request(siteId, programmerId, ["programmingOfficer"], { siteId, requestedSize: 2 }));
  await confirmTruckAvailability.run(request(siteId, fleetOfficerId, ["fleetOfficer"], { siteId, batchId: started.batchId, queueCycleId: "batch-truck-a-cycle" }));
  await confirmTruckAvailability.run(request(siteId, fleetOfficerId, ["fleetOfficer"], { siteId, batchId: started.batchId, queueCycleId: "batch-truck-b-cycle" }));

  const assignments = [
    { queueCycleId: "batch-truck-a-cycle", orderId: "order-x" },
    { queueCycleId: "batch-truck-b-cycle", orderId: "order-y" }
  ];
  await confirmProgrammingWithOrders.run(request(siteId, programmerId, ["programmingOfficer"], { siteId, batchId: started.batchId, orderAssignments: assignments }));

  await assert.rejects(
    () => confirmProgrammingWithOrders.run(request(siteId, programmerId, ["programmingOfficer"], { siteId, batchId: started.batchId, orderAssignments: assignments })),
    /no longer ready for programming/i,
    "confirming the same batch twice must fail"
  );

  const programmed = await db.collection(`sites/${siteId}/queueCycles`).where("status", "==", "PROGRAMMED").get();
  assert.equal(programmed.docs.length, 2);

  // The same order cannot be handed to two trucks in one batch.
  const siteB = "rules-duplicate-order-site";
  await seedQueued(siteB, "dup-truck-a", now - 300000);
  await seedQueued(siteB, "dup-truck-b", now - 200000);
  await db.doc(`sites/${siteB}/orders/order-only`).set({ siteId: siteB, status: "AVAILABLE", atcNo: "0500003", salesOrderNo: "SO-3", createdAt: Timestamp.now() });
  const startedB = await startAvailabilityBatch.run(request(siteB, programmerId, ["programmingOfficer"], { siteId: siteB, requestedSize: 2 }));
  await confirmTruckAvailability.run(request(siteB, fleetOfficerId, ["fleetOfficer"], { siteId: siteB, batchId: startedB.batchId, queueCycleId: "dup-truck-a-cycle" }));
  await confirmTruckAvailability.run(request(siteB, fleetOfficerId, ["fleetOfficer"], { siteId: siteB, batchId: startedB.batchId, queueCycleId: "dup-truck-b-cycle" }));
  await assert.rejects(
    () => confirmProgrammingWithOrders.run(request(siteB, programmerId, ["programmingOfficer"], {
      siteId: siteB,
      batchId: startedB.batchId,
      orderAssignments: [
        { queueCycleId: "dup-truck-a-cycle", orderId: "order-only" },
        { queueCycleId: "dup-truck-b-cycle", orderId: "order-only" }
      ]
    })),
    /can only be assigned once/i
  );
});

test("a rejected bypass records the overseer's reason and reaches the officer", async () => {
  const siteId = "rules-rejection-site";
  const now = Date.now();
  await seedQueued(siteId, "front-truck", now - 300000);
  await seedQueued(siteId, "rejected-truck", now - 100000);
  await db.doc(`sites/${siteId}/users/${overseerId}`).set({ siteId, isActive: true, name: "Overseer", roles: ["overseer"] });

  const bypass = await requestBypass.run(request(siteId, fleetOfficerId, ["fleetOfficer"], {
    siteId,
    truckId: "rejected-truck",
    queueCycleId: "rejected-truck-cycle",
    reasonCategory: "CUSTOMER_REQUIREMENT",
    explanation: "Customer asked for an earlier delivery window today."
  }));

  const rejectionReason = "The customer window does not justify moving ahead of two waiting trucks.";
  await rejectBypass.run(request(siteId, overseerId, ["overseer"], { siteId, bypassRequestId: bypass.bypassRequestId, rejectionReason }));

  const stored = await db.doc(`sites/${siteId}/bypassRequests/${bypass.bypassRequestId}`).get();
  assert.equal(stored.data()?.status, "REJECTED");
  assert.equal(stored.data()?.rejectionReason, rejectionReason);

  const delivered = await db.collection(`sites/${siteId}/notifications`)
    .where("userId", "==", fleetOfficerId).where("type", "==", "BYPASS_REJECTED").get();
  assert.equal(delivered.docs.length, 1, "the officer must be told their request was rejected");
  assert.match(String(delivered.docs[0].data().body), /does not justify/);

  const queueAfter = await db.collection(`sites/${siteId}/queueCycles`).where("status", "==", "QUEUED").orderBy("queueEnteredAt", "asc").get();
  assert.deepEqual(queueAfter.docs.map((item) => item.data().truckId), ["front-truck", "rejected-truck"], "a rejection must not disturb the queue");

  const events = await db.collection(`sites/${siteId}/auditEvents`).get();
  assert.ok(events.docs.some((item) => item.data().eventType === "BYPASS_REJECTED"));
});

test("order workbook rows keep leading zeroes and reject duplicates and blanks", () => {
  const header = ["S/N", "ATC NO", "SALES ORDER NO"];
  const parsed = parseOrderRows([header, [1, "0472438", "3100458812"], [2, "0472439", "3100458813"]]);
  assert.deepEqual(parsed.map((row) => row.atcNo), ["0472438", "0472439"], "a supplied ATC must keep its leading zero");

  assert.throws(() => parseOrderRows([header, [1, "0472438", "3100458812"], [2, "0472438", "3100458899"]]), /appears more than once/i);
  assert.throws(() => parseOrderRows([header, [1, "", "3100458812"]]), /missing ATC NO/i);
  assert.throws(() => parseOrderRows([header, [1, "0472438", ""]]), /missing SALES ORDER NO/i);
  assert.throws(() => parseOrderRows([["S/N", "TRUCK"], [1, "ABC 123 XY"]]), /must contain ATC NO and SALES ORDER NO/i);
});
