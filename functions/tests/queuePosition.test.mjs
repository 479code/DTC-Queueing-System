import assert from "node:assert/strict";
import test from "node:test";
import { Timestamp } from "firebase-admin/firestore";
import { calculateQueuePosition } from "../lib/bypass/queuePosition.js";

function queueDoc(id, millis) {
  return {
    id,
    data: () => ({
      queueEnteredAt: Timestamp.fromMillis(millis)
    })
  };
}

test("queue position follows entry time", () => {
  const docs = [
    queueDoc("cycle-c", 3_000),
    queueDoc("cycle-a", 1_000),
    queueDoc("cycle-b", 2_000)
  ];

  assert.equal(calculateQueuePosition(docs, "cycle-a"), 1);
  assert.equal(calculateQueuePosition(docs, "cycle-b"), 2);
  assert.equal(calculateQueuePosition(docs, "cycle-c"), 3);
});

test("equal timestamps use cycle id as the deterministic tie-breaker", () => {
  const docs = [
    queueDoc("cycle-b", 1_000),
    queueDoc("cycle-a", 1_000)
  ];

  assert.equal(calculateQueuePosition(docs, "cycle-a"), 1);
  assert.equal(calculateQueuePosition(docs, "cycle-b"), 2);
});

test("a cycle outside the active queue has no position", () => {
  assert.equal(calculateQueuePosition([], "missing-cycle"), 0);
});
