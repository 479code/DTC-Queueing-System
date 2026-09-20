"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, Search, Truck } from "lucide-react";
import { confirmTruckDispatch, subscribeToProgrammedTrucks, type ProgrammedTruckView } from "./api";
import { StatusBadge } from "./ui";
import { GroupRow, groupByStatus } from "./grouping";
import { WorkList } from "./WorkList";

export function ProgrammedScreen({ siteId, canConfirmDispatch }: { siteId: string; canConfirmDispatch: boolean }) {
  const [records, setRecords] = useState<ProgrammedTruckView[]>([]);
  const [queryText, setQueryText] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState("");
  const [notice, setNotice] = useState("");

  const confirmDispatch = async (record: ProgrammedTruckView) => {
    setConfirming(record.id); setNotice("");
    try {
      await confirmTruckDispatch({ siteId, queueCycleId: record.id });
      setNotice(`${record.registrationNumber} recorded as dispatched on ATC ${record.atcNo}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to record the dispatch.");
    } finally {
      setConfirming("");
    }
  };

  useEffect(() => subscribeToProgrammedTrucks(siteId, (data) => { setRecords(data); setMessage(""); }, setMessage), [siteId]);

  const visible = useMemo(() => records
    .filter((record) => filter === "ALL" || record.status === filter)
    .filter((record) => `${record.registrationNumber} ${record.driverName} ${record.atcNo} ${record.salesOrderNo} ${record.customerName}`.toLowerCase().includes(queryText.toLowerCase())),
    [filter, queryText, records]);
  const groups = useMemo(() => groupByStatus(visible, (record) => record.status), [visible]);
  const showGroups = filter === "ALL" && groups.length > 1;
  const programmedCount = records.filter((record) => record.status === "PROGRAMMED").length;
  const dispatchedCount = records.filter((record) => record.status === "DISPATCHED").length;
  const awaitingDispatch = useMemo(() => records.filter((record) => record.status === "PROGRAMMED"), [records]);
  const today = records.filter((record) => new Date(record.programmedAtMillis).toDateString() === new Date().toDateString()).length;

  return <>
    <header className="pageCommandHeader"><div><p className="eyebrow">Programming record</p><h1>Programmed trucks</h1><p>Every truck that has left the queue with an imported order and ATC, and whether the refinery has confirmed dispatch.</p></div><span className="queueLiveIndicator"><i />Updates live</span></header>
    {message ? <p className="connectionMessage">Some programming records are temporarily unavailable.</p> : null}
    {notice ? <p className={notice.startsWith("Unable") ? "message" : "successMessage"} role="status">{notice}</p> : null}
    <section className="queueStatusStrip" aria-label="Programming summary">
      <div><ClipboardCheck size={18} /><span>Awaiting dispatch</span><strong>{programmedCount}</strong></div><i />
      <div><CheckCircle2 size={18} /><span>Dispatched</span><strong>{dispatchedCount}</strong></div><i />
      <div><Truck size={18} /><span>Programmed today</span><strong>{today}</strong></div><i />
      <div><ClipboardCheck size={18} /><span>Records shown</span><strong>{visible.length}</strong></div>
    </section>
    {canConfirmDispatch && awaitingDispatch.length ? <section className="dataPanel workPanel">
      <div className="workPanelHead"><div><span>Loaded and gone</span><h2>Confirm the trucks that have left</h2><p>Confirming records the dispatch and releases the truck, so its fleet officer can report the next return.</p></div></div>
      <WorkList
        actionLabel="Confirm dispatch"
        busyLabel="Recording..."
        describeSuccess={(item) => `${item.title} is recorded as dispatched.`}
        emptyMessage="Every programmed truck has been confirmed."
        items={awaitingDispatch.map((record) => ({
          id: record.id,
          title: record.registrationNumber,
          detail: `${record.driverName} · ATC ${record.atcNo}`,
          note: <span className="workCustomer">{record.customerName}</span>,
          record
        }))}
        onAction={async (item) => { await confirmTruckDispatch({ siteId, queueCycleId: item.record.id }); }}
      />
    </section> : null}

    <section className="dataPanel queueRegisterPanel">
      <div className="queueRegisterHeading"><div><span>Programming register</span><h2>Most recently programmed first</h2><p>ATC numbers come from the imported order workbook. Confirming dispatch records that the truck has loaded and left.</p></div><span>{canConfirmDispatch ? "Dispatch confirmation" : "Read only"}</span></div>
      <div className="tableToolbar queueToolbar">
        <label className="searchField"><Search size={16} /><span className="visuallyHidden">Search programmed trucks</span><input onChange={(event) => setQueryText(event.target.value)} placeholder="Search truck, ATC, order or customer" value={queryText} /></label>
        <select aria-label="Filter by dispatch state" onChange={(event) => setFilter(event.target.value)} value={filter}>
          <option value="ALL">All records</option><option value="PROGRAMMED">Awaiting dispatch</option><option value="DISPATCHED">Dispatched</option>
        </select>
        <span className="recordCount">{visible.length} records</span>
      </div>
      <div className="tableScroll"><table className="dataTable queueTable">
        <colgroup><col className="colSubject" /><col className="colName" /><col className="colNum" /><col className="colNum" /><col className="colWide" /><col className="colWhen" /><col className="colStatus" />{canConfirmDispatch ? <col className="colActions" /> : null}</colgroup>
        <thead><tr><th>Truck</th><th>Driver</th><th data-col="num">ATC no.</th><th data-col="num">Sales order</th><th>Customer</th><th data-col="when">Programmed</th><th data-col="status">State</th>{canConfirmDispatch ? <th data-col="actions"><span className="visuallyHidden">Dispatch</span></th> : null}</tr></thead>
        <tbody>{groups.map((group) => <Fragment key={group.status}>
          {showGroups ? <GroupRow columns={canConfirmDispatch ? 8 : 7} count={group.rows.length} label={group.label} /> : null}
          {group.rows.map((record) => <tr key={record.id}>
          <td><strong>{record.registrationNumber}</strong><span>{record.programmingType === "BYPASS" ? "Approved bypass" : "FIFO"}</span></td>
          <td>{record.driverName}</td><td data-col="num"><strong>{record.atcNo}</strong></td><td data-col="num">{record.salesOrderNo}</td><td>{record.customerName}</td>
          <td data-col="when">{record.programmedAt}{record.dispatchConfirmedAt ? <span>Dispatched {record.dispatchConfirmedAt}</span> : null}</td>
          <td data-col="status"><StatusBadge value={record.status} /></td>
          {canConfirmDispatch ? <td data-col="actions">{record.status === "PROGRAMMED" ? <button className="primaryButton" disabled={confirming !== ""} onClick={() => void confirmDispatch(record)} type="button">{confirming === record.id ? "Recording..." : "Confirm dispatch"}</button> : null}</td> : null}
        </tr>)}
        </Fragment>)}</tbody>
      </table>{visible.length === 0 ? <p className="empty">No truck has been programmed yet.</p> : null}</div>
    </section>
  </>;
}
