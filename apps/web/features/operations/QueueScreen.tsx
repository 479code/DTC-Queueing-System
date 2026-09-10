"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, Search } from "lucide-react";
import type { QueueEntryView } from "./api";
import { StatusBadge } from "./ui";

function waitTime(enteredAtMillis: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - enteredAtMillis) / 60000));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

export function QueueScreen({ queue }: { queue: QueueEntryView[] }) {
  const [queryText, setQueryText] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  const filtered = useMemo(() => queue.filter((item) => `${item.registrationNumber} ${item.driverName} ${item.fleetOfficerName}`.toLowerCase().includes(queryText.toLowerCase())), [queue, queryText]);

  return (
    <>
      <header className="pageHeader"><div><h1>Live Queue</h1><p>Canonical FIFO order. Search never changes programming priority.</p></div><span className="liveIndicator"><span /> Live</span></header>
      <section className="queueSummary"><div><span>Waiting trucks</span><strong>{queue.length}</strong></div><div><span>Next truck</span><strong>{queue[0]?.registrationNumber ?? "None"}</strong></div><div><span>Longest wait</span><strong>{queue[0] ? waitTime(queue[0].queueEnteredAtMillis, now) : "0m"}</strong></div></section>
      <section className="dataPanel">
        <div className="tableToolbar"><label className="searchField"><Search size={16} /><input aria-label="Search queue" onChange={(event) => setQueryText(event.target.value)} placeholder="Find truck, driver, or officer" value={queryText} /></label><span className="orderLock">Ordered by queue-entry time</span></div>
        <div className="tableScroll"><table className="dataTable queueTable">
          <thead><tr><th>Position</th><th>Truck</th><th>Driver</th><th>Fleet officer</th><th>Queue entry</th><th>Waiting</th><th>Insurance</th></tr></thead>
          <tbody>{filtered.map((entry) => <tr className={entry.position === 1 ? "nextRow" : undefined} key={entry.id}>
            <td><span className="positionCell">#{entry.position}</span>{entry.position === 1 ? <small>Next</small> : null}</td>
            <td><strong>{entry.registrationNumber}</strong></td><td>{entry.driverName}</td><td>{entry.fleetOfficerName}</td><td>{entry.queueEnteredAt}</td>
            <td><span className="waitCell"><Clock3 size={14} />{waitTime(entry.queueEnteredAtMillis, now)}</span></td><td><StatusBadge value={entry.insuranceStatus} /></td>
          </tr>)}</tbody>
        </table></div>
      </section>
    </>
  );
}
