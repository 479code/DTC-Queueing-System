"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, FileWarning, ListOrdered, LoaderCircle, RefreshCw, ShieldAlert, Truck } from "lucide-react";
import type { QueueEntryView, TruckView } from "../operations/api";
import { StatusBadge } from "../operations/ui";
import { recalculateMetrics, subscribeToAuditEvents, subscribeToDailyMetrics, type AuditEventView, type DailyMetricsView } from "./api";
import { subscribeToProgrammedTrucks, type ProgrammedTruckView } from "../operations/api";
import { serverNow } from "../../lib/time";

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
  canRecalculate,
  canViewAuditEvents
}: {
  siteId: string;
  demoMode: boolean;
  queue: QueueEntryView[];
  trucks: TruckView[];
  canRecalculate: boolean;
  canViewAuditEvents: boolean;
}) {
  const [metrics, setMetrics] = useState<DailyMetricsView | null>(null);
  const [events, setEvents] = useState<AuditEventView[]>([]);
  const [programmed, setProgrammed] = useState<ProgrammedTruckView[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => subscribeToDailyMetrics(siteId, demoMode, setMetrics, setError), [demoMode, siteId]);
  // Only management, auditors and administrators may read audit events.
  useEffect(() => {
    if (!canViewAuditEvents) return;
    return subscribeToAuditEvents(siteId, demoMode, setEvents, setError);
  }, [canViewAuditEvents, demoMode, siteId]);

  // Counts a person can check against another page are read from the same live
  // data those pages use, so the Overview can never disagree with them. Only
  // figures that need a whole day's aggregation come from the daily summary.
  useEffect(() => {
    if (demoMode) return;
    return subscribeToProgrammedTrucks(siteId, setProgrammed, () => setProgrammed([]));
  }, [demoMode, siteId]);

  const live = useMemo(() => {
    const today = new Date(serverNow()).toDateString();
    const programmedToday = programmed.filter((record) => new Date(record.programmedAtMillis).toDateString() === today);
    const longestWaitMinutes = queue.reduce((longest, entry) => {
      const waited = Math.floor((serverNow() - entry.queueEnteredAtMillis) / 60000);
      return waited > longest ? waited : longest;
    }, 0);
    return {
      queuedCount: queue.length,
      longestWaitMinutes,
      awaitingAvailability: trucks.filter((truck) => truck.currentStatus === "AWAITING_AVAILABILITY").length,
      insuranceHoldCount: trucks.filter((truck) => truck.currentStatus === "INSURANCE_HOLD").length,
      programmedCount: programmedToday.length,
      dispatchedCount: programmedToday.filter((record) => record.status === "DISPATCHED").length,
      awaitingDispatch: programmed.filter((record) => record.status === "PROGRAMMED").length
    };
  }, [programmed, queue, trucks]);

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
    <header className="pageCommandHeader"><div><p className="eyebrow">Operations command</p><h1>Today&apos;s refinery flow</h1><p>Monitor the live FIFO queue, programming progress, and the exceptions that need a decision.</p></div>{canRecalculate ? <button className="secondaryButton commandButton" disabled={busy} onClick={() => void refresh()} type="button">{busy ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}Refresh metrics</button> : null}</header>
    {error ? <p className="message" role="alert">{error}</p> : null}
    {display ? <>
      <section className="overviewPulse"><div><span>Live queue focus</span><h2>{queue[0] ? `${queue[0].registrationNumber} is next in the FIFO queue` : "No trucks are currently waiting"}</h2><p>{queue[0] ? `Position #${queue[0].position} · ${queue[0].driverName} · ${queue[0].fleetOfficerName}` : "New returns will appear here once their queue entry is confirmed."}</p></div><div className="overviewPulseStats"><span><b>{display.queuedCount}</b> waiting</span><span><b>{formatMinutes(display.longestCurrentWaitMinutes)}</b> longest wait</span></div><a className="overviewPulseAction" href="#queue">Open live queue</a></section>
      <section className="overviewMetrics overviewStatusGrid" aria-label="Daily operational metrics">
        <div><ListOrdered /><span>In the line</span><strong>{demoMode ? display.queuedCount : live.queuedCount}</strong><small>{(demoMode ? display.longestCurrentWaitMinutes : live.longestWaitMinutes) ? `Longest wait ${formatMinutes(demoMode ? display.longestCurrentWaitMinutes : live.longestWaitMinutes)}` : "No active wait"}</small></div>
        <div><Truck /><span>Programmed today</span><strong>{demoMode ? display.programmedCount : live.programmedCount}</strong><small>{demoMode ? `${display.fifoProgrammingCount} FIFO today` : `${live.awaitingDispatch} waiting to load`}</small></div>
        <div><CheckCircle2 /><span>Dispatched today</span><strong>{demoMode ? display.dispatchedCount : live.dispatchedCount}</strong><small>{live.awaitingAvailability ? `${live.awaitingAvailability} awaiting confirmation` : "All confirmations answered"}</small></div>
        <div className={(demoMode ? display.insuranceHoldCount : live.insuranceHoldCount) > 0 ? "criticalMetric" : undefined}><ShieldAlert /><span>Insurance holds</span><strong>{demoMode ? display.insuranceHoldCount : live.insuranceHoldCount}</strong><small>Blocked from the queue</small></div>
        <div><Clock3 /><span>FIFO compliance</span><strong>{display.fifoCompliancePercent}%</strong><small>{display.updatedAt ? `${display.bypassProgrammingCount} bypasses · as of ${display.updatedAt}` : "Not calculated yet today"}</small></div>
        <div><FileWarning /><span>Bypass requests</span><strong>{display.bypassRequestedCount}</strong><small>{display.updatedAt ? `${display.bypassApprovedCount} approved · as of ${display.updatedAt}` : "Not calculated yet today"}</small></div>
      </section>

      <div className="overviewGrid">
        <section className="dataPanel overviewPanel overviewQueuePanel"><div className="overviewPanelHeading"><div><span>Canonical order</span><h2>Next in FIFO</h2><p>The queue is shown exactly as it will be considered for programming.</p></div><a className="textButton" href="#queue">View queue</a></div><div className="overviewQueue">{queue.slice(0, 5).map((item) => <div key={item.id}><strong>#{item.position}</strong><span><b>{item.registrationNumber}</b><small>{item.driverName} | {item.fleetOfficerName}</small></span><em>{item.queueEnteredAt}</em></div>)}{queue.length === 0 ? <p className="empty">No trucks are currently queued.</p> : null}</div></section>
        {canViewAuditEvents ? <section className="dataPanel overviewPanel overviewExceptionsPanel"><div className="overviewPanelHeading"><div><span>Needs review</span><h2>Recent exceptions</h2><p>Items requiring attention or a recorded decision.</p></div><a className="textButton" href="#audit">Audit log</a></div><div className="overviewEvents">{exceptions.map((event) => <div key={event.id}><AlertTriangle size={16} /><span><b>{eventLabel(event.eventType)}</b><small>{event.actorUserId} | {event.createdAt}</small></span></div>)}{exceptions.length === 0 ? <p className="empty">No recent exceptions.</p> : null}</div></section> : null}
        <section className="dataPanel overviewPanel overviewWide overviewInsurancePanel"><div className="overviewPanelHeading"><div><span>Fleet eligibility</span><h2>Insurance attention</h2><p>Expiring or expired fleet insurance that could affect queue eligibility.</p></div><a className="textButton" href="#insurance">Insurance</a></div><div className="overviewInsurance">{attentionTrucks.map((truck) => <div key={truck.id}><span><b>{truck.registrationNumber}</b><small>{truck.driverName} | Expires {truck.insuranceExpiry}</small></span><StatusBadge value={truck.insuranceStatus} /></div>)}{attentionTrucks.length === 0 ? <p className="empty">No insurance attention items.</p> : null}</div></section>
      </div>
    </> : null}
  </>;
}
