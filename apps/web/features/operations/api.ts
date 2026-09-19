import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe
} from "firebase/firestore";
import { auth, db, functions } from "../../firebase/client";
import { callOperationalApi } from "../../firebase/operations";

export type InsuranceStatus = "VALID" | "EXPIRING_SOON" | "EXPIRED" | "UNKNOWN";
export type TruckStatus = "ON_TRIP" | "QUEUED" | "AWAITING_AVAILABILITY" | "READY_FOR_PROGRAMMING" | "AWAITING_REPLACEMENT" | "INSURANCE_HOLD" | "PROGRAMMED" | "INACTIVE";

export type FleetOfficerOption = { id: string; name: string };

export type TruckView = {
  id: string;
  internalCode: string;
  registrationNumber: string;
  driverName: string;
  assignedFleetOfficerId: string;
  fleetOfficerName: string;
  currentStatus: TruckStatus;
  insuranceStatus: InsuranceStatus;
  insuranceExpiry: string;
  isActive: boolean;
  availabilityBatchId?: string;
  availabilityQueueCycleId?: string;
  availabilityExpiresAtMillis?: number;
};

export type QueueEntryView = {
  id: string;
  truckId: string;
  position: number;
  registrationNumber: string;
  driverName: string;
  fleetOfficerName: string;
  queueEnteredAt: string;
  queueEnteredAtMillis: number;
  insuranceStatus: InsuranceStatus;
};

export type ProgrammingItemView = {
  truckId: string;
  queueCycleId: string;
  batchOrder: number;
  selectionType: "FIFO" | "BYPASS";
  originalQueuePosition: number;
  queueEnteredAt: string;
  atcNo?: string;
  bypassAuthorizationId?: string;
};

export type ProgrammingPreview = {
  requestedSize: number;
  fifoCount: number;
  bypassCount: number;
  items: ProgrammingItemView[];
};

export type ProgrammingResult = {
  batchId: string;
  humanCode: string;
  confirmedSize: number;
  fifoCount: number;
  bypassCount: number;
  atcCount: number;
};

export type ValidatedBypassOption = {
  authorizationId: string;
  truckId: string;
  queueCycleId: string;
  registrationNumber: string;
  driverName: string;
  originalQueuePosition: number;
  expiresAt: string;
};

export const demoOfficers: FleetOfficerOption[] = [
  { id: "officer-a", name: "Officer A" },
  { id: "officer-b", name: "Officer B" },
  { id: "officer-c", name: "Officer C" }
];

export const demoTrucks: TruckView[] = [
  { id: "truck-fze-481", internalCode: "TRK-000184", registrationNumber: "FZE 481 DI", driverName: "Musa Abdullahi", assignedFleetOfficerId: "officer-a", fleetOfficerName: "Officer A", currentStatus: "QUEUED", insuranceStatus: "VALID", insuranceExpiry: "18 Dec 2026", isActive: true },
  { id: "truck-ktp-106", internalCode: "TRK-000207", registrationNumber: "KTP 106 XA", driverName: "Emeka Nwosu", assignedFleetOfficerId: "officer-b", fleetOfficerName: "Officer B", currentStatus: "QUEUED", insuranceStatus: "EXPIRING_SOON", insuranceExpiry: "24 Sep 2026", isActive: true },
  { id: "truck-abu-302", internalCode: "TRK-000221", registrationNumber: "ABU 302 LM", driverName: "Bello Garba", assignedFleetOfficerId: "officer-a", fleetOfficerName: "Officer A", currentStatus: "ON_TRIP", insuranceStatus: "VALID", insuranceExpiry: "08 Feb 2027", isActive: true },
  { id: "truck-kja-775", internalCode: "TRK-000236", registrationNumber: "KJA 775 QP", driverName: "Samuel Eze", assignedFleetOfficerId: "officer-c", fleetOfficerName: "Officer C", currentStatus: "PROGRAMMED", insuranceStatus: "VALID", insuranceExpiry: "19 Jan 2027", isActive: true },
  { id: "truck-lsr-718", internalCode: "TRK-000241", registrationNumber: "LSR 718 XX", driverName: "Tunde Balogun", assignedFleetOfficerId: "officer-b", fleetOfficerName: "Officer B", currentStatus: "INSURANCE_HOLD", insuranceStatus: "EXPIRED", insuranceExpiry: "04 Sep 2026", isActive: true },
  { id: "truck-fze-919", internalCode: "TRK-000249", registrationNumber: "FZE 919 DI", driverName: "Ibrahim Musa", assignedFleetOfficerId: "officer-a", fleetOfficerName: "Officer A", currentStatus: "QUEUED", insuranceStatus: "VALID", insuranceExpiry: "02 Mar 2027", isActive: true }
];

const queueSeed = [
  ["fze-481", "FZE 481 DI", "Musa Abdullahi", "Officer A"],
  ["ktp-106", "KTP 106 XA", "Emeka Nwosu", "Officer B"],
  ["lag-552", "LAG 552 HT", "Peter Okon", "Officer C"],
  ["rsh-883", "RSH 883 NV", "Yusuf Danjuma", "Officer A"],
  ["eky-404", "EKY 404 BR", "Chuka Obi", "Officer B"],
  ["abc-117", "ABC 117 LK", "Adewale James", "Officer C"],
  ["kano-66", "KAN 066 TT", "Usman Ali", "Officer A"],
  ["phc-725", "PHC 725 CE", "Victor Udo", "Officer B"],
  ["ben-313", "BEN 313 AS", "John Omoregie", "Officer C"],
  ["fze-919", "FZE 919 DI", "Ibrahim Musa", "Officer A"]
] as const;

export const demoQueue: QueueEntryView[] = queueSeed.map((entry, index) => {
  const queueEnteredAtMillis = Date.now() - (10 - index) * 52 * 60 * 1000;
  return {
    id: `cycle-${entry[0]}`,
    truckId: `truck-${entry[0]}`,
    position: index + 1,
    registrationNumber: entry[1],
    driverName: entry[2],
    fleetOfficerName: entry[3],
    queueEnteredAt: new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(queueEnteredAtMillis),
    queueEnteredAtMillis,
    insuranceStatus: index === 1 ? "EXPIRING_SOON" : "VALID"
  };
});

export const demoBypassOption: ValidatedBypassOption = {
  authorizationId: "AUTH-DEMO-919",
  truckId: "truck-fze-919",
  queueCycleId: "cycle-fze-919",
  registrationNumber: "FZE 919 DI",
  driverName: "Ibrahim Musa",
  originalQueuePosition: 10,
  expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
};

function formatTimestamp(value: unknown, includeTime = false): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: includeTime ? undefined : "numeric",
      hour: includeTime ? "2-digit" : undefined,
      minute: includeTime ? "2-digit" : undefined,
      hour12: false
    }).format(value.toDate());
  }
  return "Not recorded";
}

function timestampMillis(value: unknown): number {
  return typeof value === "object" &&
    value !== null &&
    "toMillis" in value &&
    typeof value.toMillis === "function"
    ? value.toMillis()
    : Date.now();
}

function mapTruck(document: QueryDocumentSnapshot<DocumentData>): TruckView {
  const data = document.data();
  const assignedFleetOfficerId = String(data.assignedFleetOfficerId ?? "");
  return {
    id: document.id,
    internalCode: String(data.internalCode ?? document.id),
    registrationNumber: String(data.registrationNumber ?? document.id),
    driverName: String(data.driverName ?? "Driver not recorded"),
    assignedFleetOfficerId,
    fleetOfficerName: String(data.assignedFleetOfficerName ?? assignedFleetOfficerId),
    currentStatus: String(data.currentStatus ?? "INACTIVE") as TruckStatus,
    insuranceStatus: String(data.latestInsuranceStatus ?? "UNKNOWN") as InsuranceStatus,
    insuranceExpiry: formatTimestamp(data.latestInsuranceExpiry),
    isActive: data.isActive === true,
    availabilityBatchId: typeof data.availabilityBatchId === "string" ? data.availabilityBatchId : undefined,
    availabilityQueueCycleId: typeof data.availabilityQueueCycleId === "string" ? data.availabilityQueueCycleId : undefined
  };
}

// The one-hour deadline lives on the queue cycle, so fetch it for trucks that are waiting to confirm.
async function withAvailabilityDeadlines(siteId: string, trucks: TruckView[]): Promise<TruckView[]> {
  return Promise.all(trucks.map(async (truck) => {
    if (!db || truck.currentStatus !== "AWAITING_AVAILABILITY" || !truck.availabilityQueueCycleId) return truck;
    try {
      const cycle = await getDoc(doc(db, "sites", siteId, "queueCycles", truck.availabilityQueueCycleId));
      return { ...truck, availabilityExpiresAtMillis: timestampMillis(cycle.data()?.availabilityExpiresAt) };
    } catch {
      return truck;
    }
  }));
}

export function subscribeToTrucks(
  siteId: string,
  onData: (trucks: TruckView[]) => void,
  onError: (message: string) => void
): Unsubscribe {
  if (!db) {
    onData(demoTrucks);
    return () => undefined;
  }

  return onSnapshot(
    query(collection(db, "sites", siteId, "trucks"), orderBy("internalCode", "asc")),
    (snapshot) => {
      onData(snapshot.docs.map(mapTruck));
    },
    (error) => onError(error.message)
  );
}

export function subscribeToAssignedTrucks(
  siteId: string,
  fleetOfficerId: string,
  onData: (trucks: TruckView[]) => void,
  onError: (message: string) => void
): Unsubscribe {
  if (!db) {
    onData(demoTrucks.filter((truck) => truck.assignedFleetOfficerId === "officer-a"));
    return () => undefined;
  }

  return onSnapshot(
    query(
      collection(db, "sites", siteId, "trucks"),
      where("assignedFleetOfficerId", "==", fleetOfficerId)
    ),
    (snapshot) => {
      void withAvailabilityDeadlines(siteId, snapshot.docs.map(mapTruck).sort((a, b) => a.registrationNumber.localeCompare(b.registrationNumber)))
        .then(onData)
        .catch((error: unknown) => onError(error instanceof Error ? error.message : "Unable to load assigned trucks."));
    },
    (error) => onError(error.message)
  );
}

export function subscribeToQueue(
  siteId: string,
  onData: (queue: QueueEntryView[]) => void,
  onError: (message: string) => void
): Unsubscribe {
  if (!db) {
    onData(demoQueue);
    return () => undefined;
  }

  const queueQuery = query(
    collection(db, "sites", siteId, "queueCycles"),
    where("status", "==", "QUEUED"),
    orderBy("queueEnteredAt", "asc")
  );

  return onSnapshot(
    queueQuery,
    (snapshot) => {
      void Promise.all(
        snapshot.docs.map(async (cycle, index) => {
          const data = cycle.data();
          const truckId = String(data.truckId);
          const truckSnapshot = await getDoc(doc(db!, "sites", siteId, "trucks", truckId));
          const truck = truckSnapshot.data() ?? {};
          return {
            id: cycle.id,
            truckId,
            position: index + 1,
            registrationNumber: String(truck.registrationNumber ?? truckId),
            driverName: String(truck.driverName ?? "Driver not recorded"),
            fleetOfficerName: String(
              truck.assignedFleetOfficerName ??
                data.fleetOfficerName ??
                data.fleetOfficerId ??
                "Not assigned"
            ),
            queueEnteredAt: formatTimestamp(data.queueEnteredAt, true),
            queueEnteredAtMillis: timestampMillis(data.queueEnteredAt),
            insuranceStatus: String(truck.latestInsuranceStatus ?? "UNKNOWN") as InsuranceStatus
          } satisfies QueueEntryView;
        })
      )
        .then(onData)
        .catch((error: unknown) => onError(error instanceof Error ? error.message : "Unable to load queue."));
    },
    (error) => onError(error.message)
  );
}

export function subscribeToAssignedQueue(
  siteId: string,
  fleetOfficerId: string,
  onData: (queue: QueueEntryView[]) => void,
  onError: (message: string) => void
): Unsubscribe {
  if (!db) {
    onData(demoQueue.filter((entry) => entry.fleetOfficerName === "Officer A"));
    return () => undefined;
  }

  return onSnapshot(
    query(collection(db, "sites", siteId, "queueCycles"), where("fleetOfficerId", "==", fleetOfficerId)),
    (snapshot) => {
      void Promise.all(
        snapshot.docs
          .filter((cycle) => cycle.data().status === "QUEUED")
          .map(async (cycle) => {
            const data = cycle.data();
            const truckId = String(data.truckId);
            const truckSnapshot = await getDoc(doc(db!, "sites", siteId, "trucks", truckId));
            const truck = truckSnapshot.data() ?? {};
            const position = await loadQueuePosition(siteId, cycle.id);
            return {
              id: cycle.id,
              truckId,
              position,
              registrationNumber: String(truck.registrationNumber ?? truckId),
              driverName: String(truck.driverName ?? "Driver not recorded"),
              fleetOfficerName: String(truck.assignedFleetOfficerName ?? data.fleetOfficerName ?? fleetOfficerId),
              queueEnteredAt: formatTimestamp(data.queueEnteredAt, true),
              queueEnteredAtMillis: timestampMillis(data.queueEnteredAt),
              insuranceStatus: String(truck.latestInsuranceStatus ?? "UNKNOWN") as InsuranceStatus
            } satisfies QueueEntryView;
          })
      )
        .then((entries) => onData(entries.sort((a, b) => a.position - b.position)))
        .catch((error: unknown) => onError(error instanceof Error ? error.message : "Unable to load your queue."));
    },
    (error) => onError(error.message)
  );
}

async function loadQueuePosition(siteId: string, queueCycleId: string): Promise<number> {
  if (!functions || !auth?.currentUser) {
    return demoQueue.find((entry) => entry.id === queueCycleId)?.position ?? 0;
  }

  return (await callOperationalApi<{ siteId: string; queueCycleId: string }, { position: number }>("getQueuePosition", { siteId, queueCycleId })).position;
}

export async function loadFleetOfficers(siteId: string): Promise<FleetOfficerOption[]> {
  if (!db) return demoOfficers;
  const snapshot = await getDocs(
    query(collection(db, "sites", siteId, "users"), where("roles", "array-contains", "fleetOfficer"))
  );
  return snapshot.docs
    .filter((item) => item.data().isActive === true)
    .map((item) => ({ id: item.id, name: String(item.data().name ?? item.id) }));
}

export async function loadValidatedBypasses(siteId: string): Promise<ValidatedBypassOption[]> {
  if (!functions || !auth?.currentUser) {
    return [demoBypassOption];
  }
  return callOperationalApi<{ siteId: string }, ValidatedBypassOption[]>("listValidatedBypasses", { siteId });
}

export async function saveTruck(input: {
  siteId: string;
  truckId?: string;
  registrationNumber: string;
  driverName: string;
  assignedFleetOfficerId: string;
  isActive: boolean;
}): Promise<{ truckId: string; created: boolean; internalCode: string }> {
  if (!functions || !auth?.currentUser) {
    const suffix = String(Date.now()).slice(-6);
    return {
      truckId: input.truckId ?? `demo-${Date.now()}`,
      created: !input.truckId,
      internalCode: `TRK-${suffix}`
    };
  }
  return callOperationalApi<typeof input, { truckId: string; created: boolean; internalCode: string }>("saveTruck", input);
}

export async function batchSaveTrucks(input: {
  siteId: string;
  trucks: Array<{
    registrationNumber: string;
    driverName: string;
    assignedFleetOfficerId: string;
  }>;
}): Promise<{
  createdCount: number;
  trucks: Array<{ truckId: string; internalCode: string; registrationNumber: string }>;
}> {
  if (!functions || !auth?.currentUser) {
    return {
      createdCount: input.trucks.length,
      trucks: input.trucks.map((truck, index) => ({
        truckId: `demo-${Date.now()}-${index}`,
        internalCode: `TRK-${String(Date.now() + index).slice(-6)}`,
        registrationNumber: truck.registrationNumber.toUpperCase()
      }))
    };
  }
  return callOperationalApi<typeof input, {
    createdCount: number;
    trucks: Array<{ truckId: string; internalCode: string; registrationNumber: string }>;
  }>("batchSaveTrucks", input);
}

export async function updateInsurance(input: {
  siteId: string;
  truckId: string;
  policyNumber: string;
  provider: string;
  effectiveDate: string;
  expiryDate: string;
}): Promise<{ status: InsuranceStatus; queueReentered: boolean }> {
  if (!functions || !auth?.currentUser) {
    const days = Math.ceil((Date.parse(input.expiryDate) - Date.now()) / 86400000);
    return { status: days <= 0 ? "EXPIRED" : days <= 30 ? "EXPIRING_SOON" : "VALID", queueReentered: days > 0 };
  }
  return callOperationalApi<typeof input, { status: InsuranceStatus; queueReentered: boolean }>("updateInsurance", input);
}

export async function previewProgramming(input: {
  siteId: string;
  requestedSize: number;
  includeBypassAuthorizationIds?: string[];
}): Promise<ProgrammingPreview> {
  if (!functions || !auth?.currentUser) {
    const includeBypass = (input.includeBypassAuthorizationIds?.length ?? 0) > 0;
    const fifoCount = input.requestedSize - (includeBypass ? 1 : 0);
    if (input.requestedSize < 1 || input.requestedSize > demoQueue.length) {
      throw new Error(`Choose between 1 and ${demoQueue.length} trucks.`);
    }
    const fifo = demoQueue.slice(0, fifoCount).map((entry, index) => ({
      truckId: entry.truckId,
      queueCycleId: entry.id,
      batchOrder: index + 1,
      selectionType: "FIFO" as const,
      originalQueuePosition: entry.position,
      queueEnteredAt: new Date(entry.queueEnteredAtMillis).toISOString()
    }));
    const bypass = includeBypass
      ? [{
          truckId: demoBypassOption.truckId,
          queueCycleId: `cycle-${demoBypassOption.truckId}`,
          batchOrder: input.requestedSize,
          selectionType: "BYPASS" as const,
          originalQueuePosition: demoBypassOption.originalQueuePosition,
          queueEnteredAt: new Date(demoQueue.at(-1)?.queueEnteredAtMillis ?? Date.now()).toISOString(),
          bypassAuthorizationId: demoBypassOption.authorizationId
        }]
      : [];
    return { requestedSize: input.requestedSize, fifoCount, bypassCount: bypass.length, items: [...fifo, ...bypass] };
  }
  return callOperationalApi<typeof input, ProgrammingPreview>("previewProgrammingBatch", input);
}

export async function confirmProgramming(input: {
  siteId: string;
  requestedSize: number;
  includeBypassAuthorizationIds?: string[];
  atcAssignments: Array<{ queueCycleId: string; atcNo: string }>;
}): Promise<ProgrammingResult> {
  if (!functions || !auth?.currentUser) {
    return {
      batchId: `demo-batch-${Date.now()}`,
      humanCode: `PB-20260909-${String(Date.now()).slice(-4)}`,
      confirmedSize: input.requestedSize,
      fifoCount: input.requestedSize - (input.includeBypassAuthorizationIds?.length ?? 0),
      bypassCount: input.includeBypassAuthorizationIds?.length ?? 0,
      atcCount: input.atcAssignments.length
    };
  }
  return callOperationalApi<typeof input, ProgrammingResult>("confirmProgrammingBatch", input);
}

export type ImportedOrderOption = {
  orderId: string;
  atcNo: string;
  salesOrderNo: string;
  customerName: string;
  dprpCustomerName?: string;
  receivingCustomerName?: string;
  volume?: number;
  expectedDeliveryDate?: string;
};

export type AvailabilityBatch = {
  batchId: string;
  humanCode: string;
  status: string;
  items: Array<{ queueCycleId: string; truckId: string; registrationNumber?: string; driverName?: string; batchOrder: number; availabilityStatus: string; expiresAt?: string }>;
};

// A batch lives on the server, so a programming officer who reloads or signs in
// again must be able to pick the open one back up.
export async function findOpenAvailabilityBatchId(siteId: string): Promise<string | null> {
  if (!db || !auth?.currentUser) return null;
  const snapshot = await getDocs(query(
    collection(db, "sites", siteId, "programmingBatches"),
    where("status", "==", "AWAITING_AVAILABILITY")
  ));
  const open = snapshot.docs
    .sort((left, right) => timestampMillis(right.data().createdAt) - timestampMillis(left.data().createdAt))[0];
  return open ? open.id : null;
}

export async function startAvailability(input: { siteId: string; requestedSize: number; includeBypassAuthorizationIds?: string[] }): Promise<{ batchId: string; humanCode: string; expiresAt: string; requestedSize: number }> {
  if (!functions || !auth?.currentUser) return { batchId: `demo-availability-${Date.now()}`, humanCode: "AV-DEMO", expiresAt: new Date(Date.now() + 3600000).toISOString(), requestedSize: input.requestedSize };
  return callOperationalApi<typeof input, { batchId: string; humanCode: string; expiresAt: string; requestedSize: number }>("startAvailabilityBatch", input);
}

export async function loadAvailabilityBatch(input: { siteId: string; batchId: string; requestedSize?: number }): Promise<AvailabilityBatch> {
  if (!functions || !auth?.currentUser) return { batchId: input.batchId, humanCode: "AV-DEMO", status: "AWAITING_AVAILABILITY", items: demoQueue.slice(0, input.requestedSize ?? 3).map((entry, index) => ({ queueCycleId: entry.id, truckId: entry.truckId, batchOrder: index + 1, availabilityStatus: "CONFIRMED" })) };
  return callOperationalApi<typeof input, AvailabilityBatch>("getAvailabilityBatch", input);
}

export async function loadAvailableOrders(siteId: string): Promise<ImportedOrderOption[]> {
  if (!functions || !auth?.currentUser) return demoQueue.slice(0, 10).map((entry, index) => ({ orderId: `demo-order-${index}`, atcNo: `04724${38 + index}`, salesOrderNo: `21000019${70 + index}`, customerName: "SUS Oil and Gas Ltd", dprpCustomerName: "SUS Oil and Gas Ltd", receivingCustomerName: `Customer ${index + 1}`, volume: 50000 }));
  return callOperationalApi<{ siteId: string }, ImportedOrderOption[]>("listAvailableOrders", { siteId });
}

export async function confirmProgrammingWithOrders(input: { siteId: string; batchId: string; orderAssignments: Array<{ queueCycleId: string; orderId: string }> }): Promise<{ batchId: string; humanCode: string; confirmedSize: number; atcCount: number }> {
  if (!functions || !auth?.currentUser) return { batchId: input.batchId, humanCode: "PB-DEMO", confirmedSize: input.orderAssignments.length, atcCount: input.orderAssignments.length };
  return callOperationalApi<typeof input, { batchId: string; humanCode: string; confirmedSize: number; atcCount: number }>("confirmProgrammingWithOrders", input);
}

export async function confirmAvailability(input: { siteId: string; batchId: string; queueCycleId: string }): Promise<{ queueCycleId: string; status: string }> {
  if (!functions || !auth?.currentUser) return { queueCycleId: input.queueCycleId, status: "READY_FOR_PROGRAMMING" };
  return callOperationalApi<typeof input, { queueCycleId: string; status: string }>("confirmTruckAvailability", input);
}
