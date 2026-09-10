import {
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot
} from "firebase-admin/firestore";

type QueuedCycle = {
  id: string;
  queueEnteredAt: FirebaseFirestore.Timestamp;
};

function requireQueueTimestamp(
  value: unknown
): FirebaseFirestore.Timestamp {
  if (!(value instanceof Timestamp)) {
    throw new Error("Queued cycle is missing a valid queueEnteredAt timestamp.");
  }

  return value;
}

export function calculateQueuePosition(
  docs: QueryDocumentSnapshot<DocumentData>[],
  queueCycleId: string
): number {
  const orderedCycles: QueuedCycle[] = docs
    .map((doc) => ({
      id: doc.id,
      queueEnteredAt: requireQueueTimestamp(doc.data().queueEnteredAt)
    }))
    .sort((a, b) => {
      const byTime = a.queueEnteredAt.toMillis() - b.queueEnteredAt.toMillis();
      return byTime === 0 ? a.id.localeCompare(b.id) : byTime;
    });
  const index = orderedCycles.findIndex((cycle) => cycle.id === queueCycleId);

  return index < 0 ? 0 : index + 1;
}
