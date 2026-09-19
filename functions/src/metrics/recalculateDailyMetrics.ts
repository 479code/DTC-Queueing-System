import { recalculateDailyMetricsInputSchema } from "@refinery/validation";
import type { UserRole } from "@refinery/types";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { validatedCall } from "../shared/callable.js";
import { requireAnyRole, requireAuth, requireSameSite } from "../shared/auth.js";
import { writeAuditEvent } from "../shared/audit.js";
import { db } from "../shared/firebase.js";
import { dailyMetricsRef, queueCyclesRef, trucksRef } from "../shared/paths.js";
import { averageMinutes, fifoCompliancePercent, longestMinutes } from "./summary.js";

type MetricsActor = {
  userId: string;
  roles: UserRole[];
};

type DateWindow = {
  id: string;
  displayDate: string;
  start: Date;
  end: Date;
};

function dateWindow(metricDate?: string): DateWindow {
  const input = metricDate
    ? { year: Number(metricDate.slice(0, 4)), month: Number(metricDate.slice(4, 6)), day: Number(metricDate.slice(6, 8)) }
    : (() => {
      const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Lagos",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      });
      const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
      return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
    })();
  const start = new Date(Date.UTC(input.year, input.month - 1, input.day) - 60 * 60 * 1000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    id: `${input.year}${String(input.month).padStart(2, "0")}${String(input.day).padStart(2, "0")}`,
    displayDate: `${input.year}-${String(input.month).padStart(2, "0")}-${String(input.day).padStart(2, "0")}`,
    start,
    end
  };
}

function toDate(value: unknown): Date | undefined {
  if (typeof value === "object" && value !== null && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate();
  }
  return undefined;
}

export async function recalculateSiteDailyMetrics(
  siteId: string,
  metricDate: string | undefined,
  actor: MetricsActor
) {
  const window = dateWindow(metricDate);
  const [truckSnapshot, cycleSnapshot, auditSnapshot] = await Promise.all([
    trucksRef(siteId).get(),
    queueCyclesRef(siteId).get(),
    db.collection(`sites/${siteId}/auditEvents`)
      .where("createdAt", ">=", Timestamp.fromDate(window.start))
      .where("createdAt", "<", Timestamp.fromDate(window.end))
      .get()
  ]);

  const trucks = truckSnapshot.docs.map((document) => document.data());
  const cycles = cycleSnapshot.docs.map((document) => document.data());
  const events = auditSnapshot.docs.map((document) => document.data());
  const countEvent = (eventType: string) => events.filter((event) => event.eventType === eventType).length;
  const programmingEvents = events.filter((event) => event.eventType === "TRUCK_PROGRAMMED");
  const fifoProgrammingCount = programmingEvents.filter((event) => event.metadata?.selectionType === "FIFO").length;
  const bypassProgrammingCount = programmingEvents.filter((event) => event.metadata?.selectionType === "BYPASS").length;
  const dispatchedToday = cycles.filter((cycle) => {
    const dispatchedAt = toDate(cycle.dispatchConfirmedAt);
    return dispatchedAt && dispatchedAt >= window.start && dispatchedAt < window.end;
  });
  const queueWaits = dispatchedToday
    .map((cycle) => {
      const queuedAt = toDate(cycle.queueEnteredAt);
      const dispatchedAt = toDate(cycle.dispatchConfirmedAt);
      return queuedAt && dispatchedAt ? Math.max(0, Math.round((dispatchedAt.getTime() - queuedAt.getTime()) / 60000)) : undefined;
    })
    .filter((value): value is number => value !== undefined);
  const currentQueueWaits = cycles
    .filter((cycle) => cycle.status === "QUEUED")
    .map((cycle) => {
      const queuedAt = toDate(cycle.queueEnteredAt);
      return queuedAt ? Math.max(0, Math.round((Date.now() - queuedAt.getTime()) / 60000)) : undefined;
    })
    .filter((value): value is number => value !== undefined);
  const metric = {
    id: window.id,
    siteId,
    date: window.displayDate,
    queuedCount: trucks.filter((truck) => truck.currentStatus === "QUEUED").length,
    programmedCount: trucks.filter((truck) => truck.currentStatus === "PROGRAMMED").length,
    dispatchedCount: countEvent("DISPATCH_CONFIRMED"),
    insuranceHoldCount: trucks.filter((truck) => truck.currentStatus === "INSURANCE_HOLD").length,
    bypassRequestedCount: countEvent("BYPASS_REQUESTED"),
    bypassApprovedCount: countEvent("BYPASS_APPROVED"),
    bypassUsedCount: countEvent("BYPASS_OTP_USED"),
    dispatchExceptionCount: countEvent("DISPATCH_MISMATCH"),
    fifoProgrammingCount,
    bypassProgrammingCount,
    fifoCompliancePercent: fifoCompliancePercent(fifoProgrammingCount, bypassProgrammingCount),
    averageQueueWaitMinutes: averageMinutes(queueWaits),
    longestCurrentWaitMinutes: longestMinutes(currentQueueWaits)
  };

  await db.runTransaction(async (transaction) => {
    const metricRef = dailyMetricsRef(siteId).doc(window.id);
    transaction.set(metricRef, { ...metric, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    writeAuditEvent(transaction, {
      siteId,
      eventType: "METRIC_RECALCULATED",
      actorUserId: actor.userId,
      actorRoles: actor.roles,
      relatedRecordPath: metricRef.path,
      metadata: { metricDate: window.displayDate, source: actor.userId.startsWith("system:") ? "scheduled" : "manual" }
    });
  });

  return metric;
}

export const recalculateDailyMetrics = validatedCall(
  recalculateDailyMetricsInputSchema,
  async (data, request) => {
    const context = requireAuth(request);
    requireSameSite(context, data.siteId);
    requireAnyRole(context, ["management", "administrator"]);
    return recalculateSiteDailyMetrics(data.siteId, data.date, { userId: context.uid, roles: context.roles });
  }
);

export async function refreshAllDailyMetrics(): Promise<void> {
  const siteSnapshot = await db.collection("sites").get();
  await Promise.all(siteSnapshot.docs.map((site) =>
    recalculateSiteDailyMetrics(site.id, undefined, { userId: "system:daily-metrics", roles: [] })
  ));
}

export const refreshDailyMetrics = onSchedule(
  { schedule: "every day 23:55", timeZone: "Africa/Lagos" },
  refreshAllDailyMetrics
);
