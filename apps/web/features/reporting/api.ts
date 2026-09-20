import {
  collection,
  doc,
  getDocs,
  limit,
  startAfter,
  Timestamp,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe
} from "firebase/firestore";
import { auth, db, functions } from "../../firebase/client";

export const AUDIT_PAGE_SIZE = 100;
import { callOperationalApi } from "../../firebase/operations";
import { formatSiteTime, siteDateKey } from "../../lib/time";

export type DailyMetricsView = {
  id: string;
  date: string;
  queuedCount: number;
  programmedCount: number;
  dispatchedCount: number;
  insuranceHoldCount: number;
  bypassRequestedCount: number;
  bypassApprovedCount: number;
  bypassUsedCount: number;
  dispatchExceptionCount: number;
  fifoProgrammingCount: number;
  bypassProgrammingCount: number;
  fifoCompliancePercent: number;
  averageQueueWaitMinutes: number;
  longestCurrentWaitMinutes: number;
  /** When the summary was last calculated; blank if it never has been. */
  updatedAt: string;
};

export type AuditEventView = {
  id: string;
  eventType: string;
  createdAt: string;
  createdAtMillis: number;
  actorUserId: string;
  truckId?: string;
  queueCycleId?: string;
  programmingBatchId?: string;
  truckRegistration?: string;
  actorName?: string;
  metadata: Record<string, unknown>;
};

export const demoDailyMetrics: DailyMetricsView = {
  updatedAt: "10 Sept, 23:55",
  id: "20260910",
  date: "2026-09-10",
  queuedCount: 10,
  programmedCount: 4,
  dispatchedCount: 18,
  insuranceHoldCount: 1,
  bypassRequestedCount: 3,
  bypassApprovedCount: 2,
  bypassUsedCount: 1,
  dispatchExceptionCount: 5,
  fifoProgrammingCount: 17,
  bypassProgrammingCount: 1,
  fifoCompliancePercent: 94,
  averageQueueWaitMinutes: 362,
  longestCurrentWaitMinutes: 581
};

function emptyMetrics(id: string): DailyMetricsView {
  return {
    ...demoDailyMetrics,
    updatedAt: "",
    id,
    date: `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}`,
    queuedCount: 0,
    programmedCount: 0,
    dispatchedCount: 0,
    insuranceHoldCount: 0,
    bypassRequestedCount: 0,
    bypassApprovedCount: 0,
    bypassUsedCount: 0,
    dispatchExceptionCount: 0,
    fifoProgrammingCount: 0,
    bypassProgrammingCount: 0,
    fifoCompliancePercent: 100,
    averageQueueWaitMinutes: 0,
    longestCurrentWaitMinutes: 0
  };
}

export const demoAuditEvents: AuditEventView[] = [
  { id: "audit-2", eventType: "TRUCK_PROGRAMMED", createdAt: "10 Sep, 15:14", createdAtMillis: Date.parse("2026-09-10T15:14:00+01:00"), actorUserId: "Programming Officer", truckId: "truck-kja-775", programmingBatchId: "PB-20260910-0031", metadata: { selectionType: "FIFO", atcNo: "ATC-240910-041" } },
  { id: "audit-3", eventType: "BYPASS_OTP_USED", createdAt: "10 Sep, 14:57", createdAtMillis: Date.parse("2026-09-10T14:57:00+01:00"), actorUserId: "Programming Officer", truckId: "truck-fze-919", metadata: { selectionType: "BYPASS" } },
  { id: "audit-4", eventType: "INSURANCE_HOLD_APPLIED", createdAt: "10 Sep, 13:32", createdAtMillis: Date.parse("2026-09-10T13:32:00+01:00"), actorUserId: "system:insurance-expiry", truckId: "truck-lsr-718", metadata: { insuranceStatus: "EXPIRED" } },
  { id: "audit-5", eventType: "RETURN_REPORTED", createdAt: "10 Sep, 12:18", createdAtMillis: Date.parse("2026-09-10T12:18:00+01:00"), actorUserId: "Officer A", truckId: "truck-fze-481", queueCycleId: "cycle-fze-481", metadata: { status: "QUEUED" } }
];

export function metricIdForToday(): string {
  return siteDateKey();
}

function timestampMillis(value: unknown): number {
  return typeof value === "object" && value !== null && "toMillis" in value && typeof value.toMillis === "function"
    ? value.toMillis()
    : 0;
}

function formatTimestamp(value: unknown): string {
  return formatSiteTime(value);
}

function mapMetrics(data: DocumentData, fallbackId: string): DailyMetricsView {
  return {
    updatedAt: data.updatedAt ? formatSiteTime(data.updatedAt) : "",
    id: fallbackId,
    date: String(data.date ?? fallbackId),
    queuedCount: Number(data.queuedCount ?? 0),
    programmedCount: Number(data.programmedCount ?? 0),
    dispatchedCount: Number(data.dispatchedCount ?? 0),
    insuranceHoldCount: Number(data.insuranceHoldCount ?? 0),
    bypassRequestedCount: Number(data.bypassRequestedCount ?? 0),
    bypassApprovedCount: Number(data.bypassApprovedCount ?? 0),
    bypassUsedCount: Number(data.bypassUsedCount ?? 0),
    dispatchExceptionCount: Number(data.dispatchExceptionCount ?? 0),
    fifoProgrammingCount: Number(data.fifoProgrammingCount ?? 0),
    bypassProgrammingCount: Number(data.bypassProgrammingCount ?? 0),
    fifoCompliancePercent: Number(data.fifoCompliancePercent ?? 100),
    averageQueueWaitMinutes: Number(data.averageQueueWaitMinutes ?? 0),
    longestCurrentWaitMinutes: Number(data.longestCurrentWaitMinutes ?? 0)
  };
}

function mapAuditEvent(document: QueryDocumentSnapshot<DocumentData>): AuditEventView {
  const data = document.data();
  return {
    id: document.id,
    eventType: String(data.eventType ?? "UNRECORDED_EVENT"),
    createdAt: formatTimestamp(data.createdAt),
    createdAtMillis: timestampMillis(data.createdAt),
    actorUserId: String(data.actorUserId ?? "Not recorded"),
    truckId: typeof data.truckId === "string" ? data.truckId : undefined,
    queueCycleId: typeof data.queueCycleId === "string" ? data.queueCycleId : undefined,
    programmingBatchId: typeof data.programmingBatchId === "string" ? data.programmingBatchId : undefined,
    metadata: typeof data.metadata === "object" && data.metadata !== null ? data.metadata as Record<string, unknown> : {}
  };
}

export function subscribeToDailyMetrics(
  siteId: string,
  demoMode: boolean,
  onData: (metrics: DailyMetricsView) => void,
  onError: (message: string) => void
): Unsubscribe {
  if (demoMode || !db) {
    onData(demoDailyMetrics);
    return () => undefined;
  }
  const metricId = metricIdForToday();
  return onSnapshot(doc(db, "sites", siteId, "dailyMetrics", metricId), (snapshot) => {
    onData(snapshot.exists() ? mapMetrics(snapshot.data(), metricId) : emptyMetrics(metricId));
  }, (error) => onError(error.message));
}

export function subscribeToAuditEvents(
  siteId: string,
  demoMode: boolean,
  onData: (events: AuditEventView[]) => void,
  onError: (message: string) => void
): Unsubscribe {
  if (demoMode || !db) {
    onData(demoAuditEvents);
    return () => undefined;
  }
  // An audit log is evidence, so show registrations and names rather than record ids.
  const names = async (): Promise<{ trucks: Map<string, string>; people: Map<string, string> }> => {
    const [truckDocs, userDocs] = await Promise.all([
      getDocs(collection(db!, "sites", siteId, "trucks")).catch(() => null),
      getDocs(collection(db!, "sites", siteId, "users")).catch(() => null)
    ]);
    return {
      trucks: new Map(truckDocs?.docs.map((item) => [item.id, String(item.data().registrationNumber ?? item.id)]) ?? []),
      people: new Map(userDocs?.docs.map((item) => [item.id, String(item.data().name ?? item.id)]) ?? [])
    };
  };
  const lookups = names();
  return onSnapshot(
    query(collection(db, "sites", siteId, "auditEvents"), orderBy("createdAt", "desc"), limit(AUDIT_PAGE_SIZE)),
    (snapshot) => {
      void lookups.then(({ trucks, people }) => onData(snapshot.docs.map((document) => {
        const event = mapAuditEvent(document);
        return {
          ...event,
          truckRegistration: event.truckId ? trucks.get(event.truckId) : undefined,
          actorName: event.actorUserId === "system" ? "System" : people.get(event.actorUserId)
        };
      })));
    },
    (error) => onError(error.message)
  );
}

/**
 * Older events, a page at a time. The live subscription only carries the newest
 * page; an auditor asking "what happened last week" needs the rest.
 */
export async function loadOlderAuditEvents(
  siteId: string,
  before: number
): Promise<AuditEventView[]> {
  if (!db || !auth?.currentUser || !before) return [];
  const snapshot = await getDocs(query(
    collection(db, "sites", siteId, "auditEvents"),
    orderBy("createdAt", "desc"),
    startAfter(Timestamp.fromMillis(before)),
    limit(AUDIT_PAGE_SIZE)
  ));
  const [truckDocs, userDocs] = await Promise.all([
    getDocs(collection(db, "sites", siteId, "trucks")).catch(() => null),
    getDocs(collection(db, "sites", siteId, "users")).catch(() => null)
  ]);
  const trucks = new Map(truckDocs?.docs.map((item) => [item.id, String(item.data().registrationNumber ?? item.id)]) ?? []);
  const people = new Map(userDocs?.docs.map((item) => [item.id, String(item.data().name ?? item.id)]) ?? []);
  return snapshot.docs.map((document) => {
    const event = mapAuditEvent(document);
    return {
      ...event,
      truckRegistration: event.truckId ? trucks.get(event.truckId) : undefined,
      actorName: event.actorUserId === "system" ? "System" : people.get(event.actorUserId)
    };
  });
}

export async function recalculateMetrics(siteId: string, demoMode: boolean): Promise<DailyMetricsView> {
  if (demoMode || !functions || !auth?.currentUser) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return demoDailyMetrics;
  }
  return callOperationalApi<{ siteId: string }, DailyMetricsView>("recalculateDailyMetrics", { siteId });
}

export function downloadAuditCsv(events: AuditEventView[]): void {
  const lines = [
    ["Time", "Event", "Actor", "Truck", "Queue cycle", "Programming batch", "Dispatch import", "Details"],
    ...events.map((event) => [
      event.createdAt,
      event.eventType,
      event.actorName ?? event.actorUserId,
      event.truckId ?? "",
      event.queueCycleId ?? "",
      event.programmingBatchId ?? "",
      event.truckRegistration ?? "",
      JSON.stringify(event.metadata)
    ])
  ];
  const escape = (value: string) => `"${value.replaceAll("\"", "\"\"")}"`;
  const blob = new Blob([lines.map((line) => line.map((value) => escape(String(value))).join(",")).join("\r\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `audit-log-${metricIdForToday()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
