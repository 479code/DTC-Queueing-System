import assert from "node:assert/strict";
import test from "node:test";
import { confirmProgrammingBatchInputSchema } from "@refinery/validation";

const baseInput = {
  siteId: "site-a",
  requestedSize: 2,
  atcAssignments: [
    { queueCycleId: "cycle-a", atcNo: "atc-1001" },
    { queueCycleId: "cycle-b", atcNo: "ATC-1002" }
  ]
};

test("programming confirmation requires an ATC assignment", () => {
  const result = confirmProgrammingBatchInputSchema.safeParse({
    siteId: "site-a",
    requestedSize: 1
  });

  assert.equal(result.success, false);
});

test("programming confirmation normalizes entered ATC numbers", () => {
  const result = confirmProgrammingBatchInputSchema.parse(baseInput);

  assert.equal(result.atcAssignments[0].atcNo, "ATC-1001");
  assert.equal(result.atcAssignments[1].atcNo, "ATC-1002");
});

test("programming confirmation rejects a blank ATC number", () => {
  const result = confirmProgrammingBatchInputSchema.safeParse({
    ...baseInput,
    atcAssignments: [{ queueCycleId: "cycle-a", atcNo: "   " }]
  });

  assert.equal(result.success, false);
});
