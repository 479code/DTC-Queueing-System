/**
 * Every time in this app is shown in refinery time, not the time of whatever
 * device happens to be looking. A laptop on the wrong timezone would otherwise
 * show queue-entry times that disagree with the audit trail.
 */
export const SITE_TIME_ZONE = "Africa/Lagos";
export const SITE_TIME_ZONE_LABEL = "WAT";

type TimestampLike = { toDate: () => Date } | Date | null | undefined;

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "object" && value !== null && "toDate" in value && typeof (value as { toDate: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

/** "20 Sept, 03:01" in refinery time. Date only when withTime is false. */
export function formatSiteTime(value: TimestampLike | unknown, withTime = true): string {
  const date = toDate(value);
  if (!date) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: withTime ? undefined : "numeric",
    hour: withTime ? "2-digit" : undefined,
    minute: withTime ? "2-digit" : undefined,
    hour12: false,
    timeZone: SITE_TIME_ZONE
  }).format(date);
}

/** "20 Sept 2026, 03:01" — for the audit trail and exports. */
export function formatSiteDateTime(value: TimestampLike | unknown): string {
  const date = toDate(value);
  if (!date) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: SITE_TIME_ZONE
  }).format(date);
}

/** The site's calendar day as yyyyMMdd, used for daily metric ids. */
export function siteDateKey(now = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: SITE_TIME_ZONE
    }).formatToParts(now).map((part) => [part.type, part.value])
  );
  return `${parts.year}${parts.month}${parts.day}`;
}

/** The site's calendar day for a moment, so "today" means today at the refinery. */
export function siteDayOf(millis: number): string {
  return siteDateKey(new Date(millis));
}

export function millisOf(value: TimestampLike | unknown): number {
  return toDate(value)?.getTime() ?? 0;
}

/**
 * A device with a wrong clock would show a wrong countdown, so we measure the
 * difference against the API's own clock once and apply it everywhere.
 */
let clockOffsetMs = 0;

export function serverNow(): number {
  return Date.now() + clockOffsetMs;
}

export async function syncClockOffset(): Promise<void> {
  const base = process.env.NEXT_PUBLIC_OPERATIONS_API_URL?.replace(/\/$/, "");
  if (!base) return;
  try {
    const response = await fetch(`${base}/health`, { cache: "no-store" });
    const serverDate = response.headers.get("date");
    if (serverDate) clockOffsetMs = new Date(serverDate).getTime() - Date.now();
  } catch {
    // An unreachable API is already reported elsewhere; keep the device clock.
  }
}
