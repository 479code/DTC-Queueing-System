export const DEFAULT_SITE_ID = "default-site";

export const BYPASS_OTP_TTL_MINUTES = 10;

export const BYPASS_OTP_MAX_FAILED_ATTEMPTS = 5;

export const INSURANCE_WARNING_DAYS = [30, 14, 7, 1] as const;

export function normalizeRegistration(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function formatProgrammingBatchCode(date: Date, sequence: number): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const seq = String(sequence).padStart(4, "0");
  return `PB-${yyyy}${mm}${dd}-${seq}`;
}

export function assertPositiveBatchSize(value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("Batch size must be a positive whole number.");
  }
}

/**
 * One status order for every register in the app, so a list never interleaves
 * statuses and two screens never disagree about what comes first.
 * See /DESIGN.md section 2.
 */
export const STATUS_ORDER = [
  "AWAITING_AVAILABILITY",
  "READY_FOR_PROGRAMMING",
  "QUEUED",
  "PROGRAMMED",
  "DISPATCHED",
  "ON_TRIP",
  "INSURANCE_HOLD",
  "AWAITING_REPLACEMENT",
  "INACTIVE"
] as const;

const STATUS_LABELS: Record<string, string> = {
  AWAITING_AVAILABILITY: "Awaiting availability",
  READY_FOR_PROGRAMMING: "Ready for programming",
  QUEUED: "In the line",
  PROGRAMMED: "Programmed",
  DISPATCHED: "Dispatched",
  ON_TRIP: "On trip",
  INSURANCE_HOLD: "Insurance hold",
  AWAITING_REPLACEMENT: "Awaiting replacement",
  INACTIVE: "Inactive"
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status]
    ?? status.replaceAll("_", " ").toLowerCase().replace(/^./, (character) => character.toUpperCase());
}

export type StatusGroup<T> = { status: string; label: string; rows: T[] };

/**
 * Groups rows by status in the canonical order. Groups with no rows are left
 * out: their absence is the information. A status nobody listed still appears,
 * at the end, rather than being silently dropped.
 */
export function groupByStatus<T>(rows: readonly T[], statusOf: (row: T) => string): StatusGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    const status = statusOf(row);
    const bucket = buckets.get(status);
    if (bucket) bucket.push(row);
    else buckets.set(status, [row]);
  }

  const known: string[] = STATUS_ORDER.filter((status) => buckets.has(status));
  const unknown = [...buckets.keys()]
    .filter((status) => !STATUS_ORDER.includes(status as (typeof STATUS_ORDER)[number]))
    .sort();

  return [...known, ...unknown].map((status) => ({
    status,
    label: statusLabel(status),
    rows: buckets.get(status) ?? []
  }));
}
