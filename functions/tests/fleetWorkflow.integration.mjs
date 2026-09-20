import assert from "node:assert/strict";
import test from "node:test";

process.env.BYPASS_OTP_PEPPER = "workflow-test-pepper-that-is-at-least-thirty-two-characters";

const { Timestamp } = await import("firebase-admin/firestore");
const { db } = await import("../lib/shared/firebase.js");
const { reportTruckReturn } = await import("../lib/returns/reportTruckReturn.js");
const { requestBypass } = await import("../lib/bypass/requestBypass.js");
const { approveBypass } = await import("../lib/bypass/approveBypass.js");
const { validateBypassOtp } = await import("../lib/bypass/validateBypassOtp.js");
const { previewProgrammingBatch } = await import("../lib/programming/previewProgrammingBatch.js");
const { confirmProgrammingBatch } = await import("../lib/programming/confirmProgrammingBatch.js");
const { confirmTruckDispatch } = await import("../lib/dispatch/confirmTruckDispatch.js");

const siteId = "workflow-site";
const fleetOfficerId = "fleet-officer";
const overseerId = "overseer";
const programmerId = "programmer";

function request(uid, roles, data) {
  return { auth: { uid, token: { siteId, roles } }, data };
}

function truckRef(id) {
  return db.doc(`sites/${siteId}/trucks/${id}`);
}

function cycleRef(id) {
  return db.doc(`sites/${siteId}/queueCycles/${id}`);
}

test("fleet return through dispatch preserves FIFO, bypass approval, OTP, ATC, reconciliation, and audit trail", async () => {
  const now = Date.now();
  const fleetTruckId = "fleet-truck";

  await Promise.all([
    db.doc(`sites/${siteId}/users/${fleetOfficerId}`).set({ siteId, isActive: true, name: "Fleet Officer", roles: ["fleetOfficer"] }),
    db.doc(`sites/${siteId}/users/${overseerId}`).set({ siteId, isActive: true, name: "Overseer", roles: ["overseer"] }),
    db.doc(`sites/${siteId}/users/${programmerId}`).set({ siteId, isActive: true, name: "Programmer", roles: ["programmingOfficer"] }),
    truckRef("first-truck").set({ registrationNumber: "AAA 001 AA", normalizedRegistration: "AAA001AA", assignedFleetOfficerId: "other-officer", currentStatus: "QUEUED", activeCycleId: "first-cycle", latestInsuranceStatus: "VALID" }),
    cycleRef("first-cycle").set({ siteId, truckId: "first-truck", fleetOfficerId: "other-officer", status: "QUEUED", queueEnteredAt: Timestamp.fromMillis(now - 180000) }),
    truckRef("middle-truck").set({ registrationNumber: "BBB 002 BB", normalizedRegistration: "BBB002BB", assignedFleetOfficerId: "other-officer", currentStatus: "QUEUED", activeCycleId: "middle-cycle", latestInsuranceStatus: "VALID" }),
    cycleRef("middle-cycle").set({ siteId, truckId: "middle-truck", fleetOfficerId: "other-officer", status: "QUEUED", queueEnteredAt: Timestamp.fromMillis(now - 120000) }),
    truckRef(fleetTruckId).set({ registrationNumber: "FZE 919 DI", normalizedRegistration: "FZE919DI", assignedFleetOfficerId: fleetOfficerId, assignedFleetOfficerName: "Fleet Officer", currentStatus: "ON_TRIP", activeCycleId: null, isActive: true, latestInsuranceStatus: "VALID" })
  ]);

  const returned = await reportTruckReturn.run(request(fleetOfficerId, ["fleetOfficer"], { siteId, truckId: fleetTruckId }));
  assert.equal(returned.status, "QUEUED");

  const queuePosition = await db.collection(`sites/${siteId}/queueCycles`).where("status", "==", "QUEUED").orderBy("queueEnteredAt", "asc").get();
  assert.deepEqual(queuePosition.docs.map((item) => item.data().truckId), ["first-truck", "middle-truck", fleetTruckId]);

  const bypass = await requestBypass.run(request(fleetOfficerId, ["fleetOfficer"], {
    siteId,
    truckId: fleetTruckId,
    queueCycleId: returned.cycleId,
    reasonCategory: "OPERATIONAL_REQUIREMENT",
    explanation: "Urgent delivery movement required for the destination."
  }));
  assert.equal(bypass.queuePositionAtRequest, 3);
  assert.equal(bypass.numberOfTrucksBypassed, 2);

  const approved = await approveBypass.run(request(overseerId, ["overseer"], { siteId, bypassRequestId: bypass.bypassRequestId }));
  assert.equal(approved.otp, undefined, "the approver must not receive the code");

  const deliveredBefore = await db.collection(`sites/${siteId}/notifications`)
    .where("userId", "==", fleetOfficerId).where("type", "==", "BYPASS_APPROVED").get();
  assert.equal(deliveredBefore.docs.length, 1, "the approved code must reach the assigned fleet officer");
  const deliveredOtp = deliveredBefore.docs[0].data().otp;
  assert.match(deliveredOtp, /^\d{6}$/);

  const validated = await validateBypassOtp.run(request(fleetOfficerId, ["fleetOfficer"], {
    siteId,
    truckId: fleetTruckId,
    otp: deliveredOtp
  }));
  assert.equal(validated.status, "VALIDATED");
  const deliveredAfter = await db.doc(`sites/${siteId}/notifications/${deliveredBefore.docs[0].id}`).get();
  assert.equal(deliveredAfter.data()?.otp, undefined, "the delivered code must be cleared once validated");

  const preview = await previewProgrammingBatch.run(request(programmerId, ["programmingOfficer"], {
    siteId,
    requestedSize: 2,
    includeBypassAuthorizationIds: [approved.authorizationId]
  }));
  assert.equal(preview.fifoCount, 1);
  assert.equal(preview.bypassCount, 1);
  assert.deepEqual(preview.items.map((item) => item.selectionType), ["FIFO", "BYPASS"]);

  const confirmed = await confirmProgrammingBatch.run(request(programmerId, ["programmingOfficer"], {
    siteId,
    requestedSize: 2,
    includeBypassAuthorizationIds: [approved.authorizationId],
    atcAssignments: preview.items.map((item, index) => ({ queueCycleId: item.queueCycleId, atcNo: `ATC-WF-${index + 1}` }))
  }));
  assert.equal(confirmed.confirmedSize, 2);
  assert.equal(confirmed.bypassCount, 1);
  assert.equal(confirmed.atcCount, 2);

  const [fleetCycle, fleetTruck, authorization, bypassRequest, firstCycle, middleCycle, auditEvents] = await Promise.all([
    cycleRef(returned.cycleId).get(),
    truckRef(fleetTruckId).get(),
    db.doc(`sites/${siteId}/bypassAuthorizations/${approved.authorizationId}`).get(),
    db.doc(`sites/${siteId}/bypassRequests/${bypass.bypassRequestId}`).get(),
    cycleRef("first-cycle").get(),
    cycleRef("middle-cycle").get(),
    db.collection(`sites/${siteId}/auditEvents`).get()
  ]);

  assert.equal(fleetCycle.data()?.status, "PROGRAMMED");
  assert.equal(fleetCycle.data()?.atcNo, "ATC-WF-2");
  assert.equal(fleetTruck.data()?.currentStatus, "PROGRAMMED");
  assert.equal(authorization.data()?.status, "USED");
  assert.equal(bypassRequest.data()?.status, "USED");
  assert.equal(firstCycle.data()?.status, "PROGRAMMED");
  assert.equal(middleCycle.data()?.status, "QUEUED");

  const eventTypes = new Set(auditEvents.docs.map((item) => item.data().eventType));
  ["RETURN_REPORTED", "QUEUE_ENTERED", "BYPASS_REQUESTED", "BYPASS_APPROVED", "BYPASS_OTP_GENERATED", "BYPASS_OTP_VALIDATED", "BYPASS_OTP_USED", "TRUCK_PROGRAMMED", "PROGRAMMING_BATCH_CONFIRMED"].forEach((eventType) => assert.ok(eventTypes.has(eventType), `missing ${eventType}`));

  const dispatched = await confirmTruckDispatch.run(request(programmerId, ["programmingOfficer"], { siteId, queueCycleId: returned.cycleId }));
  assert.equal(dispatched.status, "DISPATCHED");
  const [dispatchedCycle, returnedTruck, dispatchEvents] = await Promise.all([
    cycleRef(returned.cycleId).get(),
    truckRef(fleetTruckId).get(),
    db.collection(`sites/${siteId}/auditEvents`).where("queueCycleId", "==", returned.cycleId).get()
  ]);
  assert.equal(dispatchedCycle.data()?.status, "DISPATCHED");
  assert.equal(returnedTruck.data()?.currentStatus, "ON_TRIP");
  assert.ok(dispatchEvents.docs.some((item) => item.data().eventType === "DISPATCH_CONFIRMED"));
});
