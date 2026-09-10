import assert from "node:assert/strict";
import test from "node:test";
import { averageMinutes, fifoCompliancePercent, longestMinutes } from "../lib/metrics/summary.js";

test("FIFO compliance treats no programming as fully compliant", () => {
  assert.equal(fifoCompliancePercent(0, 0), 100);
  assert.equal(fifoCompliancePercent(17, 1), 94);
});

test("queue wait summaries round averages and handle empty data", () => {
  assert.equal(averageMinutes([60, 61, 62]), 61);
  assert.equal(averageMinutes([]), 0);
  assert.equal(longestMinutes([60, 61, 62]), 62);
  assert.equal(longestMinutes([]), 0);
});
