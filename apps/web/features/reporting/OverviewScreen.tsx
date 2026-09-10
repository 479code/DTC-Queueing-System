"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, FileWarning, ListOrdered, LoaderCircle, RefreshCw, ShieldAlert, Truck } from "lucide-react";
import type { QueueEntryView, TruckView } from "../operations/api";
import { StatusBadge } from "../operations/ui";
import { recalculateMetrics, subscribeToAuditEvents, subscribeToDailyMetrics, type AuditEventView, type DailyMetricsView } from "./api";

function formatMinutes(value: number): string {
  if (value <= 0) return "0 min";
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes} min`;
}

function eventLabel(eventType: string): string {
  return eventType.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export function OverviewScreen({
  siteId,
  demoMode,
  queue,
  trucks,
  canRecalculate
}: {
  siteId: string;
  demoMode: boolean;
  queue: QueueEntryView[];
  trucks: TruckView[];
  canRecalculate: boolean;
}) {
  const [metrics, setMetrics] = useState<DailyMetricsView | null>(null);
  const [events, setEvents] = useState<AuditEventView[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => subscribeToDailyMetrics(siteId, demoMode, setMetrics, setError), [demoMode, siteId]);
  useEffect(() => subscribeToAuditEvents(siteId, demoMode, setEvents, setError), [demoMode, siteId]);

  const attentionTrucks = useMemo(
    () => trucks.filter((truck) => truck.insuranceStatus === "EXPIRED" || truck.insuranceStatus === "EXPIRING_SOON").slice(0, 4),
    [trucks]
  );
  const exceptions = useMemo(
    () => events.filter((event) => ["DISPATCH_MISMATCH", "INSURANCE_HOLD_APPLIED", "BYPASS_REJECTED"].includes(event.eventType)).slice(0, 5),
    [events]
  );
  const refresh = async () => {
    setBusy(true);
    setError("");
    try {
      setMetrics(await recalculateMetrics(siteId, demoMode));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to refresh daily metrics.");
    } finally {
      setBusy(false);
    }
  };

  const display = metrics;
  return <>
    <header className="pageHeader"><div><h1>Operations overview</h1><p>Today&apos;s queue, dispatch, FIFO, and insurance position.</p></div>{canRecalculate ? <button className="secondaryButton commandButton" disabled={busy} onClick={() => void refresh()} type="button">{busy ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}Refresh metrics</button> : null}</header>
    {error ? <p className="message" role="alert">{error}</p> : null}
    {display ? <>
      <section className="overviewMetrics" aria-label="Daily operational metrics">
        <div><ListOrdered /><span>Queued</span><strong>{display.queuedCount}</strong><small>{display.longestCurrentWaitMinutes ? `Longest wait ${formatMinutes(display.longestCurrentWaitMinutes)}` : "No active wait"}</small></div>
        <div><Truck /><span>Programmed</span><strong>{display.programmedCount}</strong><small>{display.fifoProgrammingCount} FIFO today</small></div>
        <div><CheckCircle2 /><span>Dispatched today</span><strong>{display.dispatchedCount}</strong><small>Average wait {formatMinutes(display.averageQueueWaitMinutes)}</small></div>
        <div><ShieldAlert /><span>Insurance holds</span><strong>{display.insuranceHoldCount}</strong><small>Requires fleet attention</small></div>
        <div><Clock3 /><span>FIFO compliance</span><strong>{display.fifoCompliancePercent}%</strong><small>{display.bypassProgrammingCount} approved bypasses</small></div>
        <div className={display.dispatchExceptionCount > 0 ? "criticalMetric" : undefined}><FileWarning /><span>Dispatch exceptions</span><strong>{display.dispatchExceptionCount}</strong><small>{display.bypassRequestedCount} bypass requests today</small></div>
      </section>

      <div className="overviewGrid">
        <section className="dataPanel overviewPanel"><div className="panelTitle"><div><h2>Next in FIFO</h2><p>Canonical queue order.</p></div><a className="textButton" href="#queue">View queue</a></div><div className="overviewQueue">{queue.slice(0, 5).map((item) => <div key={item.id}><strong>#{item.position}</strong><span><b>{item.registrationNumber}</b><small>{item.driverName} | {item.fleetOfficerName}</small></span><em>{item.queueEnteredAt}</em></div>)}{queue.length === 0 ? <p className="empty">No trucks are currently queued.</p> : null}</div></section>
        <section className="dataPanel overviewPanel"><div className="panelTitle"><div><h2>Recent exceptions</h2><p>Requires attention or review.</p></div><a className="textButton" href="#audit">Audit log</a></div><div className="overviewEvents">{exceptions.map((event) => <div key={event.id}><AlertTriangle size={16} /><span><b>{eventLabel(event.eventType)}</b><small>{event.actorUserId} | {event.createdAt}</small></span></div>)}{exceptions.length === 0 ? <p className="empty">No recent exceptions.</p> : null}</div></section>
        <section className="dataPanel overviewPanel overviewWide"><div className="panelTitle"><div><h2>Insurance attention</h2><p>Expiring or expired fleet insurance.</p></div><a className="textButton" href="#insurance">Insurance</a></div><div className="overviewInsurance">{attentionTrucks.map((truck) => <div key={truck.id}><span><b>{truck.registrationNumber}</b><small>{truck.driverName} | Expires {truck.insuranceExpiry}</small></span><StatusBadge value={truck.insuranceStatus} /></div>)}{attentionTrucks.length === 0 ? <p className="empty">No insurance attention items.</p> : null}</div></section>
      </div>
    </> : null}
  </>;
}
