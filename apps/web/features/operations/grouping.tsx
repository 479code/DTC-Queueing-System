import type { ReactNode } from "react";

/**
 * One status order for the whole app, so a register never interleaves
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

const STATUS_LABEL: Record<string, string> = {
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
  return STATUS_LABEL[status] ?? status.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

export type StatusGroup<T> = { status: string; label: string; rows: T[] };

/**
 * Groups rows by status in the canonical order. Groups with no rows are left
 * out: their absence is the information. Rows with an unlisted status are kept
 * in a trailing group rather than silently dropped.
 */
export function groupByStatus<T>(rows: T[], statusOf: (row: T) => string): StatusGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    const status = statusOf(row);
    const bucket = buckets.get(status);
    if (bucket) bucket.push(row);
    else buckets.set(status, [row]);
  }

  const known = STATUS_ORDER.filter((status) => buckets.has(status)).map((status) => status as string);
  const unknown = [...buckets.keys()].filter((status) => !STATUS_ORDER.includes(status as (typeof STATUS_ORDER)[number])).sort();

  return [...known, ...unknown].map((status) => ({
    status,
    label: statusLabel(status),
    rows: buckets.get(status) ?? []
  }));
}

/** A sticky header row that names a group and counts it. */
export function GroupRow({ label, count, columns }: { label: string; count: number; columns: number }): ReactNode {
  return (
    <tr className="groupRow">
      <th colSpan={columns} scope="colgroup">
        <span>{label}</span>
        <span className="groupCount">{count}</span>
      </th>
    </tr>
  );
}
