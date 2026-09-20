import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

const projectId = "refinery-queue-rules-test";
const siteId = "default-site";
const sitePath = `sites/${siteId}`;
let testEnvironment;

function asUser(uid) {
  return testEnvironment.authenticatedContext(uid, { siteId }).firestore();
}

before(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: await readFile(new URL("../../../firestore.rules", import.meta.url), "utf8")
    }
  });

  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const seed = [
      ["users/manager-1", { siteId, isActive: true, roles: ["management"] }],
      ["users/overseer-1", { siteId, isActive: true, roles: ["overseer"] }],
      ["users/auditor-1", { siteId, isActive: true, roles: ["auditor"] }],
      ["users/admin-1", { siteId, isActive: true, roles: ["administrator"] }],
      ["users/programmer-1", { siteId, isActive: true, roles: ["programmingOfficer"] }],
      ["users/fleet-1", { siteId, isActive: true, roles: ["fleetOfficer"] }],
      ["trucks/truck-assigned", { registrationNumber: "ABC-123", assignedFleetOfficerId: "fleet-1" }],
      ["trucks/truck-other", { registrationNumber: "DEF-456", assignedFleetOfficerId: "fleet-2" }],
      ["queueCycles/cycle-1", { fleetOfficerId: "fleet-1", status: "QUEUED" }],
      ["programmingBatches/batch-1", { status: "CONFIRMED" }],
      ["orders/order-1", { atcNo: "0472438", status: "AVAILABLE" }],
      ["auditEvents/audit-1", { action: "PROGRAMMING_CONFIRMED" }],
      ["bypassRequests/bypass-1", { fleetOfficerId: "fleet-1", status: "PENDING" }],
      ["bypassRequests/bypass-other", { fleetOfficerId: "fleet-2", status: "PENDING" }],
      ["bypassAuthorizations/auth-1", { truckId: "truck-assigned", status: "ACTIVE" }],
      ["notifications/note-mine", { userId: "fleet-1", type: "BYPASS_APPROVED", otp: "123456" }],
      ["notifications/note-other", { userId: "fleet-2", type: "BYPASS_APPROVED", otp: "654321" }],
      ["dailyMetrics/20260910", { fifoCompliancePercent: 100 }]
    ];

    await Promise.all(
      seed.map(([path, data]) => setDoc(doc(db, `${sitePath}/${path}`), data))
    );
  });
});

after(async () => {
  await testEnvironment.cleanup();
});

test("authorised roles only read the documents assigned to them", async () => {
  const management = asUser("manager-1");
  const programmer = asUser("programmer-1");
  const fleetOfficer = asUser("fleet-1");

  await assertSucceeds(getDoc(doc(management, `${sitePath}/auditEvents/audit-1`)));
  await assertSucceeds(getDoc(doc(programmer, `${sitePath}/programmingBatches/batch-1`)));
  await assertFails(getDoc(doc(programmer, `${sitePath}/auditEvents/audit-1`)));
  await assertSucceeds(getDoc(doc(fleetOfficer, `${sitePath}/trucks/truck-assigned`)));
  await assertSucceeds(getDoc(doc(fleetOfficer, `${sitePath}/queueCycles/cycle-1`)));
  await assertFails(getDoc(doc(fleetOfficer, `${sitePath}/trucks/truck-other`)));
});

// Every role that can open a screen must be able to read what that screen needs,
// and nothing more. Two live permission bugs came from gaps in this matrix.
test("each role reads exactly the collections its screens need", async () => {
  const expectations = [
    // [uid, path, allowed]
    ["programmer-1", "queueCycles/cycle-1", true],
    ["programmer-1", "trucks/truck-other", true],
    ["programmer-1", "orders/order-1", true],
    ["programmer-1", "programmingBatches/batch-1", true],
    ["programmer-1", "dailyMetrics/20260910", true],
    ["programmer-1", "auditEvents/audit-1", false],
    ["overseer-1", "bypassRequests/bypass-1", true],
    ["overseer-1", "bypassAuthorizations/auth-1", true],
    ["overseer-1", "queueCycles/cycle-1", true],
    ["overseer-1", "auditEvents/audit-1", false],
    ["manager-1", "auditEvents/audit-1", true],
    ["manager-1", "queueCycles/cycle-1", true],
    ["manager-1", "dailyMetrics/20260910", true],
    ["auditor-1", "auditEvents/audit-1", true],
    ["auditor-1", "queueCycles/cycle-1", true],
    ["admin-1", "orders/order-1", true],
    ["admin-1", "auditEvents/audit-1", true],
    ["admin-1", "users/fleet-1", true],
    ["fleet-1", "trucks/truck-assigned", true],
    ["fleet-1", "queueCycles/cycle-1", true],
    ["fleet-1", "bypassRequests/bypass-1", true],
    ["fleet-1", "notifications/note-mine", true],
    ["fleet-1", "trucks/truck-other", false],
    ["fleet-1", "bypassRequests/bypass-other", false],
    ["fleet-1", "notifications/note-other", false],
    ["fleet-1", "orders/order-1", false],
    ["fleet-1", "auditEvents/audit-1", false],
    ["fleet-1", "users/manager-1", false]
  ];

  for (const [uid, path, allowed] of expectations) {
    const read = getDoc(doc(asUser(uid), `${sitePath}/${path}`));
    if (allowed) await assertSucceeds(read);
    else await assertFails(read);
  }
});

test("unauthenticated clients cannot read operational data", async () => {
  const anonymous = testEnvironment.unauthenticatedContext().firestore();

  await assertFails(getDoc(doc(anonymous, `${sitePath}/dailyMetrics/20260910`)));
});

test("clients cannot directly write consequential operational records", async () => {
  const management = asUser("manager-1");
  const protectedPaths = [
    "queueCycles/cycle-1",
    "programmingBatches/batch-1",
    "orders/order-1",
    "auditEvents/audit-1",
    "dailyMetrics/20260910"
  ];

  await Promise.all(
    protectedPaths.map((path) =>
      assertFails(setDoc(doc(management, `${sitePath}/${path}`), { tampered: true }))
    )
  );
});
