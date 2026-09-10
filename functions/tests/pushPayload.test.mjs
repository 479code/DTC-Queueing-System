import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPushData,
  chunkTokens,
  isInvalidRegistrationToken
} from "../lib/notifications/pushPayload.js";

test("chunkTokens keeps each FCM request within the 500 token limit", () => {
  const tokens = Array.from({ length: 1001 }, (_, index) => `token-${index}`);
  const chunks = chunkTokens(tokens);

  assert.deepEqual(chunks.map((chunk) => chunk.length), [500, 500, 1]);
  assert.deepEqual(chunks.flat(), tokens);
});

test("buildPushData includes only string routing fields", () => {
  assert.deepEqual(
    buildPushData("notification-1", {
      title: "Bypass approved",
      body: "A code is ready.",
      type: "BYPASS_APPROVED",
      truckId: "truck-1"
    }),
    {
      notificationId: "notification-1",
      type: "BYPASS_APPROVED",
      truckId: "truck-1"
    }
  );
});

test("only permanent registration errors deactivate a device", () => {
  assert.equal(
    isInvalidRegistrationToken("messaging/registration-token-not-registered"),
    true
  );
  assert.equal(isInvalidRegistrationToken("messaging/internal-error"), false);
});
