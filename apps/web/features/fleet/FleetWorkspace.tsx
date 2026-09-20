"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Clock3, ListOrdered, Truck } from "lucide-react";
import { confirmAvailability, type QueueEntryView, type TruckView } from "../operations/api";
import { Dialog, StatusBadge } from "../operations/ui";
import { groupByStatus } from "../operations/grouping";
import { WorkList } from "../operations/WorkList";
import { serverNow, syncClockOffset } from "../../lib/time";
import { reportFleetReturn } from "./api";

export function FleetWorkspace({
  demoMode,
  fleetOfficerId,
  queue,
  siteId,
  trucks,
  onTrucksChange
}: {
  demoMode: boolean;
  fleetOfficerId: string;
  queue: QueueEntryView[];
  siteId: string;
  trucks: TruckView[];
  onTrucksChange: (trucks: TruckView[]) => void;
}) {
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [nowMillis, setNowMillis] = useState(() => serverNow());



  // Keep the one-hour availability countdown moving without reloading the page.
  useEffect(() => {
    void syncClockOffset().then(() => setNowMillis(serverNow()));
    const timer = window.setInterval(() => setNowMillis(serverNow()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const myTrucks = useMemo(
    () => trucks.filter((truck) => demoMode ? truck.assignedFleetOfficerId === "officer-a" : truck.assignedFleetOfficerId === fleetOfficerId),
    [demoMode, fleetOfficerId, trucks]
  );
  const myQueue = useMemo(() => queue.filter((entry) => myTrucks.some((truck) => truck.id === entry.truckId)), [myTrucks, queue]);
  const returnableTrucks = myTrucks.filter((truck) => truck.currentStatus === "ON_TRIP");
  const counts = {
    queued: myTrucks.filter((truck) => truck.currentStatus === "QUEUED").length,
    onTrip: returnableTrucks.length,
    programmed: myTrucks.filter((truck) => truck.currentStatus === "PROGRAMMED").length,
    hold: myTrucks.filter((truck) => truck.currentStatus === "INSURANCE_HOLD").length
  };
  const awaitingAvailability = myTrucks.filter((truck) => truck.currentStatus === "AWAITING_AVAILABILITY").length;
  const remainingLabel = (expiresAtMillis?: number) => {
    if (!expiresAtMillis) return null;
    const remaining = expiresAtMillis - nowMillis;
    if (remaining <= 0) return "Window closed";
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return `${minutes}:${String(seconds).padStart(2, "0")} left`;
  };
  const soonestDeadline = myTrucks
    .filter((truck) => truck.currentStatus === "AWAITING_AVAILABILITY" && truck.availabilityExpiresAtMillis)
    .map((truck) => truck.availabilityExpiresAtMillis!)
    .sort((left, right) => left - right)[0];
  const nextQueuedTruck = myQueue[0];
  // The register never interleaves statuses; see /DESIGN.md section 2.
  const truckGroups = useMemo(() => groupByStatus(myTrucks, (truck) => truck.currentStatus), [myTrucks]);

  const reportOneReturn = async (truck: TruckView) => {
    const result = await reportFleetReturn({ siteId, truckId: truck.id, insuranceStatus: truck.insuranceStatus });
    onTrucksChange(trucks.map((item) => item.id === truck.id ? { ...item, currentStatus: result.status } : item));
  };

  const confirmOneAvailability = async (truck: TruckView) => {
    if (!truck.availabilityBatchId || !truck.availabilityQueueCycleId) throw new Error("This truck is no longer awaiting confirmation.");
    await confirmAvailability({ siteId, batchId: truck.availabilityBatchId, queueCycleId: truck.availabilityQueueCycleId });
    onTrucksChange(trucks.map((item) => item.id === truck.id ? { ...item, currentStatus: "READY_FOR_PROGRAMMING" } : item));
  };

  const awaitingTrucks = myTrucks.filter((truck) => truck.currentStatus === "AWAITING_AVAILABILITY");

  const confirmTruckAvailability = async (truck: TruckView) => {
    if (!truck.availabilityBatchId || !truck.availabilityQueueCycleId) return;
    setWorking(true);
    setMessage("");
    try {
      await confirmAvailability({ siteId, batchId: truck.availabilityBatchId, queueCycleId: truck.availabilityQueueCycleId });
      onTrucksChange(trucks.map((item) => item.id === truck.id ? { ...item, currentStatus: "READY_FOR_PROGRAMMING" } : item));
      setMessage(`${truck.registrationNumber} is confirmed and ready for programming.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to confirm availability.");
    } finally {
      setWorking(false);
    }
  };

  return <>
    <header className="pageCommandHeader"><div><p className="eyebrow">Fleet officer workspace</p><h1>Keep your fleet moving</h1><p>Confirm availability, return completed trips, and manage approved priority movement for the trucks assigned to you.</p></div><div className="fleetAssignedCount"><Truck size={18} /><div><span>Assigned fleet</span><strong>{myTrucks.length} trucks</strong></div></div></header>
    {message ? <p className={message.includes("Unable") || message.includes("Choose") ? "message" : "successMessage"} role="status">{message}</p> : null}
    <section className="fleetMetrics fleetStatusStrip" aria-label="My fleet status"><div><ListOrdered size={18} /><span>In FIFO queue</span><strong>{counts.queued}</strong></div><i /><div><Truck size={18} /><span>On trip</span><strong>{counts.onTrip}</strong></div><i /><div><CheckCircle2 size={18} /><span>Programmed</span><strong>{counts.programmed}</strong></div><i /><div className={counts.hold ? "criticalMetric" : undefined}><CircleAlert size={18} /><span>Insurance hold</span><strong>{counts.hold}</strong></div></section>
    <section className="fleetActionBoard">
      <div className="fleetActionIntro"><span>Today&apos;s fleet desk</span><h2>{awaitingAvailability ? `${awaitingAvailability} driver${awaitingAvailability === 1 ? "" : "s"} awaiting confirmation` : nextQueuedTruck ? `${nextQueuedTruck.registrationNumber} is next in your queue` : "Your fleet is clear for now"}</h2><p>{awaitingAvailability ? `Confirm the drivers that are available before the one-hour response window closes.${soonestDeadline ? ` ${remainingLabel(soonestDeadline)}.` : ""}` : nextQueuedTruck ? `Position #${nextQueuedTruck.position} · ${nextQueuedTruck.driverName}` : "Returns, availability confirmations, and approved bypasses will appear here when action is needed."}</p></div>
      
    </section>
    {awaitingTrucks.length ? <section className="dataPanel workPanel">
      <div className="workPanelHead"><div><span>Waiting on you</span><h2>Confirm the drivers who are available</h2><p>Each truck has one hour. When it runs out the slot passes to the next truck in the line.</p></div></div>
      <WorkList
        actionLabel="Confirm availability"
        busyLabel="Confirming..."
        describeSuccess={(item) => `${item.title} is confirmed and ready for programming.`}
        emptyMessage="No truck is waiting on a confirmation."
        items={awaitingTrucks.map((truck) => ({
          id: truck.id,
          title: truck.registrationNumber,
          detail: `Driver: ${truck.driverName}`,
          note: <span className={(truck.availabilityExpiresAtMillis ?? 0) - nowMillis < 5 * 60000 ? "availabilityCountdown urgent" : "availabilityCountdown"}><Clock3 size={13} />{remainingLabel(truck.availabilityExpiresAtMillis) ?? "One-hour window"}</span>,
          truck
        }))}
        onAction={(item) => confirmOneAvailability(item.truck)}
      />
    </section> : null}

    {returnableTrucks.length ? <section className="dataPanel workPanel">
      <div className="workPanelHead"><div><span>Back at the refinery</span><h2>Report the trucks that have returned</h2><p>The server sets the queue-entry time and checks insurance. Each truck leaves this list as you report it.</p></div></div>
      <WorkList
        actionLabel="Report return"
        busyLabel="Reporting..."
        describeSuccess={(item) => `${item.title} has been reported.`}
        emptyMessage="No truck is waiting to be reported."
        items={returnableTrucks.map((truck) => ({
          id: truck.id,
          title: truck.registrationNumber,
          detail: `Driver: ${truck.driverName}`,
          note: <StatusBadge value={truck.insuranceStatus} />,
          truck
        }))}
        onAction={(item) => reportOneReturn(item.truck)}
      />
    </section> : null}

    <div className="fleetWorkbench">
      <section className="dataPanel fleetQueuePanel"><div className="fleetPanelHeading"><div><span>Live FIFO positions</span><h2>My trucks in the queue</h2><p>The server calculates position from the active queue. Priority movement still needs an approved OTP.</p></div><span className="fleetLiveState"><i />Live queue</span></div>{myQueue.length ? <div className="fleetQueueList">{myQueue.map((entry) => <div className={entry.position === 1 ? "fleetQueueRow fleetNextQueueRow" : "fleetQueueRow"} key={entry.id}><strong>#{entry.position}</strong><div><b>{entry.registrationNumber}</b><span>{entry.driverName} · returned {entry.queueEnteredAt}</span></div>{entry.position === 1 ? <span className="nextInLine">Next in line</span> : <span className="queuePositionNote">Position #{entry.position}</span>}</div>)}</div> : <p className="empty">None of your trucks are currently in the queue.</p>}</section>
    </div>
    <section className="dataPanel fleetTruckPanel fleetRegisterPanel"><div className="fleetRegisterHeading"><div><span>Assigned truck register</span><h2>Every truck under your care</h2><p>Availability, insurance, and queue movement are shown together so the next action stays clear.</p></div><span>{myTrucks.length} assigned</span></div><div className="fleetTruckList">{truckGroups.map((group) => <Fragment key={group.status}>
      {truckGroups.length > 1 ? <div className="fleetGroupHeading"><span>{group.label}</span><span className="groupCount">{group.rows.length}</span></div> : null}
      {group.rows.map((truck) => { const queueEntry = myQueue.find((entry) => entry.truckId === truck.id); return <article className="fleetTruckRow" key={truck.id}><div><strong>{truck.registrationNumber}</strong><span>Driver: {truck.driverName}</span></div><StatusBadge value={truck.currentStatus} /><div className="fleetInsurance"><span>Insurance</span><b>{truck.insuranceExpiry}</b><StatusBadge value={truck.insuranceStatus} /></div><div className="fleetRowActions">{truck.currentStatus === "AWAITING_AVAILABILITY" ? <><span className={(truck.availabilityExpiresAtMillis ?? 0) - nowMillis < 5 * 60000 ? "availabilityCountdown urgent" : "availabilityCountdown"}><Clock3 size={13} />{remainingLabel(truck.availabilityExpiresAtMillis) ?? "One-hour window"}</span><button className="primaryButton" disabled={working} onClick={() => void confirmTruckAvailability(truck)} type="button">Confirm availability</button></> : null}{queueEntry ? <><span className="fleetPosition"><Clock3 size={14} />Queue #{queueEntry.position}</span>{queueEntry.position > 1 ? <a className="textButton" href="#my-bypass">Bypass</a> : <span className="nextInLine">Next</span>}</> : null}</div></article>; })}
    </Fragment>)}</div></section>
  </>;
}
