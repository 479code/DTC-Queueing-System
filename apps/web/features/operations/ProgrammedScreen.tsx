"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, Search, Truck } from "lucide-react";
import { subscribeToProgrammedTrucks, type ProgrammedTruckView } from "./api";
import { StatusBadge } from "./ui";

export function ProgrammedScreen({ siteId }: { siteId: string }) {
  const [records, setRecords] = useState<ProgrammedTruckView[]>([]);
  const [queryText, setQueryText] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [message, setMessage] = useState("");

  useEffect(() => subscribeToProgrammedTrucks(siteId, (data) => { setRecords(data); setMessage(""); }, setMessage), [siteId]);

  const visible = useMemo(() => records
    .filter((record) => filter === "ALL" || record.status === filter)
    .filter((record) => `${record.registrationNumber} ${record.driverName} ${record.atcNo} ${record.salesOrderNo} ${record.customerName}`.toLowerCase().includes(queryText.toLowerCase())),
    [filter, queryText, records]);
  const programmedCount = records.filter((record) => record.status === "PROGRAMMED").length;
  const dispatchedCount = records.filter((record) => record.status === "DISPATCHED").length;
  const today = records.filter((record) => new Date(record.programmedAtMillis).toDateString() === new Date().toDateString()).length;

  return <>
    <header className="queueCommandHeader"><div><p className="eyebrow">Programming record</p><h1>Programmed trucks</h1><p>Every truck that has left the queue with an imported order and ATC, and whether the refinery has confirmed dispatch.</p></div><span className="queueLiveIndicator"><i />Updates live</span></header>
    {message ? <p className="connectionMessage">Some programming records are temporarily unavailable.</p> : null}
    <section className="queueStatusStrip" aria-label="Programming summary">
      <div><ClipboardCheck size={18} /><span>Awaiting dispatch</span><strong>{programmedCount}</strong></div><i />
      <div><CheckCircle2 size={18} /><span>Dispatched</span><strong>{dispatchedCount}</strong></div><i />
      <div><Truck size={18} /><span>Programmed today</span><strong>{today}</strong></div><i />
      <div><ClipboardCheck size={18} /><span>Records shown</span><strong>{visible.length}</strong></div>
    </section>
    <section className="dataPanel queueRegisterPanel">
      <div className="queueRegisterHeading"><div><span>Programming register</span><h2>Most recently programmed first</h2><p>ATC numbers come from the imported order workbook. This register is read only.</p></div><span>Read only</span></div>
      <div className="tableToolbar queueToolbar">
        <label className="searchField"><Search size={16} /><span className="visuallyHidden">Search programmed trucks</span><input onChange={(event) => setQueryText(event.target.value)} placeholder="Search truck, ATC, order or customer" value={queryText} /></label>
        <select aria-label="Filter by dispatch state" onChange={(event) => setFilter(event.target.value)} value={filter}>
          <option value="ALL">All records</option><option value="PROGRAMMED">Awaiting dispatch</option><option value="DISPATCHED">Dispatched</option>
        </select>
        <span className="recordCount">{visible.length} records</span>
      </div>
      <div className="tableScroll"><table className="dataTable queueTable">
        <thead><tr><th>Truck</th><th>Driver</th><th>ATC no.</th><th>Sales order</th><th>Customer</th><th>Programmed</th><th>State</th></tr></thead>
        <tbody>{visible.map((record) => <tr key={record.id}>
          <td><strong>{record.registrationNumber}</strong><span>{record.programmingType === "BYPASS" ? "Approved bypass" : "FIFO"}</span></td>
          <td>{record.driverName}</td><td><strong>{record.atcNo}</strong></td><td>{record.salesOrderNo}</td><td>{record.customerName}</td>
          <td>{record.programmedAt}{record.dispatchConfirmedAt ? <span>Dispatched {record.dispatchConfirmedAt}</span> : null}</td>
          <td><StatusBadge value={record.status} /></td>
        </tr>)}</tbody>
      </table>{visible.length === 0 ? <p className="empty">No truck has been programmed yet.</p> : null}</div>
    </section>
  </>;
}
