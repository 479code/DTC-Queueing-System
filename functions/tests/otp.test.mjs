import assert from "node:assert/strict";
import test from "node:test";
import {
  generateBypassOtp,
  hashBypassOtp,
  verifyBypassOtp
} from "../lib/bypass/otp.js";

const binding = {
  siteId: "site-1",
  bypassRequestId: "request-1",
  truckId: "truck-1",
  queueCycleId: "cycle-1",
  requestedBy: "fleet-officer-1",
  approvedBy: "overseer-1",
  expiresAtMillis: 1_800_000_000_000
};
const pepper = "a-development-only-pepper-with-32-plus-characters";

test("generateBypassOtp returns a six-digit code", () => {
  for (let index = 0; index < 100; index += 1) {
    assert.match(generateBypassOtp(), /^\d{6}$/);
  }
});

test("a matching code and binding validates", () => {
  const otp = "482193";
  const hash = hashBypassOtp(otp, binding, pepper);

  assert.equal(verifyBypassOtp(otp, binding, pepper, hash), true);
  assert.equal(verifyBypassOtp("482194", binding, pepper, hash), false);
});

test("the hash is bound to the request context", () => {
  const otp = "482193";
  const hash = hashBypassOtp(otp, binding, pepper);
  const alteredBinding = {
    ...binding,
    truckId: "truck-2"
  };

  assert.equal(verifyBypassOtp(otp, alteredBinding, pepper, hash), false);
});

test("the hash cannot be verified with another pepper", () => {
  const otp = "482193";
  const hash = hashBypassOtp(otp, binding, pepper);

  assert.equal(
    verifyBypassOtp(
      otp,
      binding,
      "a-different-development-pepper-with-32-characters",
      hash
    ),
    false
  );
});
