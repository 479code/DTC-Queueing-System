import assert from "node:assert/strict";
import test from "node:test";
import { evaluateInsuranceStatus } from "../lib/insurance/status.js";

const day = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 8, 9);

test("insurance with more than 30 days remaining is valid", () => {
  assert.equal(evaluateInsuranceStatus(now - day, now + 31 * day, now), "VALID");
});

test("insurance inside the 30 day window is expiring soon", () => {
  assert.equal(
    evaluateInsuranceStatus(now - day, now + 14 * day, now),
    "EXPIRING_SOON"
  );
});

test("expired and not-yet-effective insurance is ineligible", () => {
  assert.equal(evaluateInsuranceStatus(now - 10 * day, now, now), "EXPIRED");
  assert.equal(
    evaluateInsuranceStatus(now + day, now + 30 * day, now),
    "EXPIRED"
  );
});

test("expiry must follow effective date", () => {
  assert.throws(() => evaluateInsuranceStatus(now, now, now));
});
