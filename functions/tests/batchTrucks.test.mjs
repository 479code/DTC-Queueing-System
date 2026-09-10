import assert from "node:assert/strict";
import test from "node:test";
import { batchSaveTrucksInputSchema } from "../../packages/validation/dist/index.js";

const validTruck = {
  registrationNumber: "FZE 481 DI",
  driverName: "Musa Abdullahi",
  assignedFleetOfficerId: "officer-a",
  isActive: true
};

test("batch truck input accepts a complete row", () => {
  const result = batchSaveTrucksInputSchema.safeParse({
    siteId: "default-site",
    trucks: [validTruck]
  });

  assert.equal(result.success, true);
});

test("batch truck input rejects more than 100 rows", () => {
  const result = batchSaveTrucksInputSchema.safeParse({
    siteId: "default-site",
    trucks: Array.from({ length: 101 }, (_, index) => ({
      ...validTruck,
      registrationNumber: `TRUCK ${index}`
    }))
  });

  assert.equal(result.success, false);
});

test("batch truck input requires a driver name", () => {
  const result = batchSaveTrucksInputSchema.safeParse({
    siteId: "default-site",
    trucks: [{ ...validTruck, driverName: "" }]
  });

  assert.equal(result.success, false);
});
