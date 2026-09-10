import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "../../firebase/client";

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
  dispatchImportId?: string;
  dispatchRecordId?: string;
  metadata: Record<string, unknown>;
};

export const demoDailyMetrics: DailyMetricsView = {
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
  { id: "audit-1", eventType: "DISPATCH_MISMATCH", createdAt: "10 Sep, 16:42", createdAtMillis: Date.parse("2026-09-10T16:42:00+01:00"), actorUserId: "Programming Officer", dispatchImportId: "dispatch-demo-20260910", dispatchRecordId: "demo-5", metadata: { matchStatus: "TRUCK_MISMATCH", matchReason: "ATC belongs to a different programmed truck." } },
  { id: "audit-2", eventType: "TRUCK_PROGRAMMED", createdAt: "10 Sep, 15:14", createdAtMillis: Date.parse("2026-09-10T15:14:00+01:00"), actorUserId: "Programming Officer", truckId: "truck-kja-775", programmingBatchId: "PB-20260910-0031", metadata: { selectionType: "FIFO", atcNo: "ATC-240910-041" } },
  { id: "audit-3", eventType: "BYPASS_OTP_USED", createdAt: "10 Sep, 14:57", createdAtMillis: Date.parse("2026-09-10T14:57:00+01:00"), actorUserId: "Programming Officer", truckId: "truck-fze-919", metadata: { selectionType: "BYPASS" } },
  { id: "audit-4", eventType: "INSURANCE_HOLD_APPLIED", createdAt: "10 Sep, 13:32", createdAtMillis: Date.parse("2026-09-10T13:32:00+01:00"), actorUserId: "system:insurance-expiry", truckId: "truck-lsr-718", metadata: { insuranceStatus: "EXPIRED" } },
  { id: "audit-5", eventType: "RETURN_REPORTED", createdAt: "10 Sep, 12:18", createdAtMillis: Date.parse("2026-09-10T12:18:00+01:00"), actorUserId: "Officer A", truckId: "truck-fze-481", queueCycleId: "cycle-fze-481", metadata: { status: "QUEUED" } }
];

export function metricIdForToday(): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}${parts.month}${parts.day}`;
}

function timestampMillis(value: unknown): number {
  return typeof value === "object" && value !== null && "toMillis" in value && typeof value.toMillis === "function"
    ? value.toMillis()
    : 0;
}

function formatTimestamp(value: unknown): string {
  if (typeof value !== "object" || value === null || !("toDate" in value) || typeof value.toDate !== "function") return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false
  }).format(value.toDate());
}

function mapMetrics(data: DocumentData, fallbackId: string): DailyMetricsView {
  return {
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
    dispatchImportId: typeof data.dispatchImportId === "string" ? data.dispatchImportId : undefined,
    dispatchRecordId: typeof data.dispatchRecordId === "string" ? data.dispatchRecordId : undefined,
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
  return onSnapshot(
    query(collection(db, "sites", siteId, "auditEvents"), orderBy("createdAt", "desc"), limit(150)),
    (snapshot) => onData(snapshot.docs.map(mapAuditEvent)),
    (error) => onError(error.message)
  );
}

export async function recalculateMetrics(siteId: string, demoMode: boolean): Promise<DailyMetricsView> {
  if (demoMode || !functions || !auth?.currentUser) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return demoDailyMetrics;
  }
  const callable = httpsCallable<{ siteId: string }, DailyMetricsView>(functions, "recalculateDailyMetrics");
  return (await callable({ siteId })).data;
}

export function downloadAuditCsv(events: AuditEventView[]): void {
  const lines = [
    ["Time", "Event", "Actor", "Truck", "Queue cycle", "Programming batch", "Dispatch import", "Details"],
    ...events.map((event) => [
      event.createdAt,
      event.eventType,
      event.actorUserId,
      event.truckId ?? "",
      event.queueCycleId ?? "",
      event.programmingBatchId ?? "",
      event.dispatchImportId ?? "",
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
