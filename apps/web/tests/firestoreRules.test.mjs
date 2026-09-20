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
      ["users/programmer-1", { siteId, isActive: true, roles: ["programmingOfficer"] }],
      ["users/fleet-1", { siteId, isActive: true, roles: ["fleetOfficer"] }],
      ["trucks/truck-assigned", { registrationNumber: "ABC-123", assignedFleetOfficerId: "fleet-1" }],
      ["trucks/truck-other", { registrationNumber: "DEF-456", assignedFleetOfficerId: "fleet-2" }],
      ["queueCycles/cycle-1", { fleetOfficerId: "fleet-1", status: "QUEUED" }],
      ["programmingBatches/batch-1", { status: "CONFIRMED" }],
      ["orders/order-1", { atcNo: "0472438", status: "AVAILABLE" }],
      ["auditEvents/audit-1", { action: "PROGRAMMING_CONFIRMED" }],
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
