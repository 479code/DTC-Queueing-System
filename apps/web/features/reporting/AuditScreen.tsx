"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileCheck2, Search, ShieldCheck } from "lucide-react";
import { AUDIT_PAGE_SIZE, downloadAuditCsv, loadOlderAuditEvents, subscribeToAuditEvents, type AuditEventView } from "./api";
import { formatSiteTime } from "../../lib/time";

function eventLabel(eventType: string): string {
  return eventType.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function recordReference(event: AuditEventView): string {
  return event.truckRegistration ?? event.programmingBatchId ?? event.truckId ?? event.queueCycleId ?? "System record";
}

const isoPattern = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/;

function readableValue(value: unknown): string {
  const text = String(value);
  if (!isoPattern.test(text)) return text;
  return formatSiteTime(new Date(text));
}

function detail(event: AuditEventView): string {
  const values = Object.entries(event.metadata).slice(0, 2).map(([key, value]) => `${key.replaceAll("_", " ")}: ${readableValue(value)}`);
  return values.join(" | ") || "No additional detail";
}

export function AuditScreen({ siteId, demoMode }: { siteId: string; demoMode: boolean }) {
  const [events, setEvents] = useState<AuditEventView[]>([]);
  const [older, setOlder] = useState<AuditEventView[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [reachedStart, setReachedStart] = useState(false);

  useEffect(() => subscribeToAuditEvents(siteId, demoMode, (data) => { setEvents(data); setLoaded(true); }, (message) => { setError(message); setLoaded(true); }), [demoMode, siteId]);

  // The live window holds the newest page; older pages are fetched on request.
  const all = useMemo(() => [...events, ...older], [events, older]);

  const loadOlder = async () => {
    const oldest = all.reduce((lowest, event) => (event.createdAtMillis && event.createdAtMillis < lowest ? event.createdAtMillis : lowest), Number.MAX_SAFE_INTEGER);
    if (oldest === Number.MAX_SAFE_INTEGER) return;
    setLoadingOlder(true);
    try {
      const page = await loadOlderAuditEvents(siteId, oldest);
      setOlder((current) => [...current, ...page]);
      if (page.length < AUDIT_PAGE_SIZE) setReachedStart(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load older events.");
    } finally {
      setLoadingOlder(false);
    }
  };
  const eventTypes = useMemo(() => [...new Set(all.map((event) => event.eventType))].sort(), [all]);
  const visibleEvents = useMemo(() => {
    const term = search.trim().toLowerCase();
    const fromMillis = from ? new Date(`${from}T00:00:00`).getTime() : 0;
    const toMillis = to ? new Date(`${to}T23:59:59`).getTime() : Number.MAX_SAFE_INTEGER;
    return all.filter((event) => {
      const matchesFilter = filter === "ALL" || event.eventType === filter;
      const withinRange = event.createdAtMillis >= fromMillis && event.createdAtMillis <= toMillis;
      const searchable = `${event.eventType} ${event.actorUserId} ${recordReference(event)} ${detail(event)}`.toLowerCase();
      return matchesFilter && withinRange && (!term || searchable.includes(term));
    });
  }, [all, filter, from, search, to]);

  return <>
    <header className="pageCommandHeader"><div><p className="eyebrow">Operational record</p><h1>Audit trail</h1><p>Immutable evidence of operational actions, system decisions, and the records they affected.</p></div><button className="secondaryButton commandButton" disabled={visibleEvents.length === 0} onClick={() => downloadAuditCsv(visibleEvents)} type="button"><Download size={16} /> Export CSV</button></header>
    {error ? <p className="message" role="alert">{error}</p> : null}
    <section className="auditStatusStrip" aria-label="Audit status"><div><FileCheck2 size={18} /><span>Recorded events</span><strong>{all.length}</strong></div><i /><div><ShieldCheck size={18} /><span>Record state</span><strong>Immutable</strong></div><i /><div><FileCheck2 size={18} /><span>Event types</span><strong>{eventTypes.length}</strong></div><i /><div><ShieldCheck size={18} /><span>Showing</span><strong>{visibleEvents.length} events</strong></div></section>
    <section className="dataPanel auditRegisterPanel"><div className="auditRegisterHeading"><div><span>Searchable record</span><h2>Operational events in time order</h2><p>Filter or export the records without changing what the system has captured.</p></div><span>Read only</span></div><div className="tableToolbar auditToolbar"><label className="searchField"><Search size={16} /><span className="visuallyHidden">Search audit log</span><input onChange={(event) => setSearch(event.target.value)} placeholder="Search event, actor, or record" value={search} /></label><select aria-label="Filter audit events" onChange={(event) => setFilter(event.target.value)} value={filter}><option value="ALL">All events</option>{eventTypes.map((eventType) => <option key={eventType} value={eventType}>{eventLabel(eventType)}</option>)}</select><label className="dateRangeField"><span className="visuallyHidden">From</span><input aria-label="From date" onChange={(event) => setFrom(event.target.value)} type="date" value={from} /></label><label className="dateRangeField"><span className="visuallyHidden">To</span><input aria-label="To date" onChange={(event) => setTo(event.target.value)} type="date" value={to} /></label>{from || to ? <button className="textButton" onClick={() => { setFrom(""); setTo(""); }} type="button">Clear dates</button> : null}<span className="recordCount">{visibleEvents.length} events</span></div><div className="tableScroll"><table className="dataTable auditTable"><colgroup><col className="colWhen" /><col className="colName" /><col className="colName" /><col className="colName" /><col className="colWide" /></colgroup><thead><tr><th data-col="when">Time</th><th>Event</th><th>Actor</th><th>Record</th><th>Detail</th></tr></thead><tbody>{visibleEvents.map((event) => <tr key={event.id}><td data-col="when">{event.createdAt}</td><td><strong>{eventLabel(event.eventType)}</strong></td><td>{event.actorName ?? event.actorUserId}</td><td>{recordReference(event)}</td><td>{detail(event)}</td></tr>)}</tbody></table>{visibleEvents.length === 0 ? <p className={loaded ? "empty" : "loadingLine"}>{loaded ? "No audit events match these filters." : "Loading the audit trail..."}</p> : null}
      <div className="auditPager">
        {reachedStart
          ? <span>You have reached the first recorded event.</span>
          : <button className="secondaryButton" disabled={loadingOlder} onClick={() => void loadOlder()} type="button">{loadingOlder ? "Loading..." : "Load older events"}</button>}
      </div></div></section>
  </>;
}
