import { Timestamp, type DocumentData, type QueryDocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import { bypassAuthorizationsRef, queueCyclesRef } from "../shared/paths.js";
import { failedPrecondition, notFound } from "../shared/errors.js";

export type SelectedProgrammingItem = {
  truckId: string;
  queueCycleId: string;
  batchOrder: number;
  selectionType: "FIFO" | "BYPASS";
  originalQueuePosition: number;
  queueEnteredAt: FirebaseFirestore.Timestamp;
  bypassRequestId?: string;
  bypassAuthorizationId?: string;
  numberOfTrucksBypassed?: number;
};

type QueueCycleDoc = {
  id: string;
  truckId: string;
  queueEnteredAt: FirebaseFirestore.Timestamp;
  data: DocumentData;
};

function ensureTimestamp(value: unknown, label: string): FirebaseFirestore.Timestamp {
  if (value instanceof Timestamp) {
    return value;
  }

  failedPrecondition(`${label} is missing or invalid.`);
}

function sortQueueDocs(docs: QueryDocumentSnapshot<DocumentData>[]): QueueCycleDoc[] {
  return docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        truckId: String(data.truckId),
        queueEnteredAt: ensureTimestamp(data.queueEnteredAt, "queueEnteredAt"),
        data
      };
    })
    .sort((a, b) => {
      const byTime = a.queueEnteredAt.toMillis() - b.queueEnteredAt.toMillis();
      return byTime === 0 ? a.id.localeCompare(b.id) : byTime;
    });
}

export async function selectProgrammingBatch(
  transaction: Transaction,
  input: {
    siteId: string;
    requestedSize: number;
    includeBypassAuthorizationIds?: string[];
    now?: FirebaseFirestore.Timestamp;
  }
): Promise<SelectedProgrammingItem[]> {
  const bypassAuthorizationIds = input.includeBypassAuthorizationIds ?? [];
  const uniqueBypassAuthorizationIds = Array.from(new Set(bypassAuthorizationIds));

  if (uniqueBypassAuthorizationIds.length !== bypassAuthorizationIds.length) {
    failedPrecondition("Duplicate bypass authorizations are not allowed in one batch.");
  }

  if (!Number.isInteger(input.requestedSize) || input.requestedSize < 1) {
    failedPrecondition("Batch size must be a positive whole number.");
  }

  if (uniqueBypassAuthorizationIds.length >= input.requestedSize) {
    failedPrecondition("Bypasses cannot fill the entire batch.");
  }

  const queueSnapshot = await transaction.get(
    queueCyclesRef(input.siteId)
      .where("status", "==", "QUEUED")
      .orderBy("queueEnteredAt", "asc")
  );
  const activeQueue = sortQueueDocs(queueSnapshot.docs);

  const bypassItems: SelectedProgrammingItem[] = [];
  const bypassCycleIds = new Set<string>();
  const now = input.now ?? Timestamp.now();

  for (const authorizationId of uniqueBypassAuthorizationIds) {
    const authorizationRef = bypassAuthorizationsRef(input.siteId).doc(authorizationId);
    const authorizationSnap = await transaction.get(authorizationRef);

    if (!authorizationSnap.exists) {
      notFound("Bypass authorization was not found.");
    }

    const authorization = authorizationSnap.data() ?? {};
    const expiresAt = ensureTimestamp(authorization.expiresAt, "bypass authorization expiry");

    if (authorization.status !== "VALIDATED") {
      failedPrecondition("Bypass authorization must be validated before programming.");
    }

    if (authorization.usedAt || expiresAt.toMillis() <= now.toMillis()) {
      failedPrecondition("Bypass authorization is expired or already used.");
    }

    const queueCycleId = String(authorization.queueCycleId);
    const truckId = String(authorization.truckId);
    const queueIndex = activeQueue.findIndex((cycle) => cycle.id === queueCycleId);

    if (queueIndex < 0) {
      failedPrecondition("Bypass truck is no longer in the active queue.");
    }

    const queueCycle = activeQueue[queueIndex];

    if (!queueCycle || queueCycle.truckId !== truckId) {
      failedPrecondition("Bypass authorization does not match the active truck cycle.");
    }

    const originalQueuePosition = queueIndex + 1;

    if (originalQueuePosition <= input.requestedSize) {
      failedPrecondition("Bypass is unnecessary for a truck already inside the requested FIFO batch.");
    }

    bypassCycleIds.add(queueCycleId);
    bypassItems.push({
      truckId,
      queueCycleId,
      batchOrder: 0,
      selectionType: "BYPASS",
      originalQueuePosition,
      queueEnteredAt: queueCycle.queueEnteredAt,
      bypassRequestId: String(authorization.bypassRequestId),
      bypassAuthorizationId: authorizationId,
      numberOfTrucksBypassed: originalQueuePosition - 1
    });
  }

  const fifoSlots = input.requestedSize - bypassItems.length;
  const fifoItems = activeQueue
    .filter((cycle) => !bypassCycleIds.has(cycle.id))
    .slice(0, fifoSlots)
    .map((cycle, index) => ({
      truckId: cycle.truckId,
      queueCycleId: cycle.id,
      batchOrder: index + 1,
      selectionType: "FIFO" as const,
      originalQueuePosition: activeQueue.findIndex((entry) => entry.id === cycle.id) + 1,
      queueEnteredAt: cycle.queueEnteredAt
    }));

  if (fifoItems.length + bypassItems.length !== input.requestedSize) {
    failedPrecondition("Not enough queued trucks are available for the requested batch.");
  }

  return [
    ...fifoItems,
    ...bypassItems.map((item, index) => ({
      ...item,
      batchOrder: fifoItems.length + index + 1
    }))
  ];
}
