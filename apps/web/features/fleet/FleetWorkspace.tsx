"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Clock3, ListOrdered, Truck } from "lucide-react";
import { confirmAvailability, type QueueEntryView, type TruckView } from "../operations/api";
import { Dialog, StatusBadge } from "../operations/ui";
import { reportFleetReturn } from "./api";

type DialogName = "return" | null;

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
  const [dialog, setDialog] = useState<DialogName>(null);
  const [selectedTruckId, setSelectedTruckId] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [nowMillis, setNowMillis] = useState(() => Date.now());



  // Keep the one-hour availability countdown moving without reloading the page.
  useEffect(() => {
    const timer = window.setInterval(() => setNowMillis(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const myTrucks = useMemo(
    () => trucks.filter((truck) => demoMode ? truck.assignedFleetOfficerId === "officer-a" : truck.assignedFleetOfficerId === fleetOfficerId),
    [demoMode, fleetOfficerId, trucks]
  );
  const myQueue = useMemo(() => queue.filter((entry) => myTrucks.some((truck) => truck.id === entry.truckId)), [myTrucks, queue]);
  const returnableTrucks = myTrucks.filter((truck) => truck.currentStatus === "ON_TRIP");
  const selectedTruck = myTrucks.find((truck) => truck.id === selectedTruckId);
  const selectedQueue = selectedTruck ? myQueue.find((entry) => entry.truckId === selectedTruck.id) : undefined;
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

  const open = (next: Exclude<DialogName, null>, truckId = "") => {
    setDialog(next);
    setSelectedTruckId(truckId || (returnableTrucks[0]?.id ?? ""));
    setMessage("");
  };

  const reportReturn = async () => {
    if (!selectedTruck) return;
    setWorking(true);
    setMessage("");
    try {
      const result = await reportFleetReturn({ siteId, truckId: selectedTruck.id, insuranceStatus: selectedTruck.insuranceStatus });
      onTrucksChange(trucks.map((truck) => truck.id === selectedTruck.id ? { ...truck, currentStatus: result.status } : truck));
      setDialog(null);
      setMessage(result.status === "QUEUED" ? `${selectedTruck.registrationNumber} has entered the FIFO queue.` : `${selectedTruck.registrationNumber} is on insurance hold.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to report this return.");
    } finally {
      setWorking(false);
    }
  };

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
    <header className="fleetCommandHeader"><div><p className="eyebrow">Fleet officer workspace</p><h1>Keep your fleet moving</h1><p>Confirm availability, return completed trips, and manage approved priority movement for the trucks assigned to you.</p></div><div className="fleetAssignedCount"><Truck size={18} /><div><span>Assigned fleet</span><strong>{myTrucks.length} trucks</strong></div></div></header>
    {message ? <p className={message.includes("Unable") || message.includes("Choose") ? "message" : "successMessage"} role="status">{message}</p> : null}
    <section className="fleetMetrics fleetStatusStrip" aria-label="My fleet status"><div><ListOrdered size={18} /><span>In FIFO queue</span><strong>{counts.queued}</strong></div><i /><div><Truck size={18} /><span>On trip</span><strong>{counts.onTrip}</strong></div><i /><div><CheckCircle2 size={18} /><span>Programmed</span><strong>{counts.programmed}</strong></div><i /><div className={counts.hold ? "criticalMetric" : undefined}><CircleAlert size={18} /><span>Insurance hold</span><strong>{counts.hold}</strong></div></section>
    <section className="fleetActionBoard">
      <div className="fleetActionIntro"><span>Today&apos;s fleet desk</span><h2>{awaitingAvailability ? `${awaitingAvailability} driver${awaitingAvailability === 1 ? "" : "s"} awaiting confirmation` : nextQueuedTruck ? `${nextQueuedTruck.registrationNumber} is next in your queue` : "Your fleet is clear for now"}</h2><p>{awaitingAvailability ? `Confirm the drivers that are available before the one-hour response window closes.${soonestDeadline ? ` ${remainingLabel(soonestDeadline)}.` : ""}` : nextQueuedTruck ? `Position #${nextQueuedTruck.position} · ${nextQueuedTruck.driverName}` : "Returns, availability confirmations, and approved bypasses will appear here when action is needed."}</p></div>
      <div className="fleetActionSet"><button className="primaryButton commandButton" disabled={returnableTrucks.length === 0} onClick={() => open("return")} type="button"><Truck size={16} />Report return</button></div>
    </section>
    <div className="fleetWorkbench">
      <section className="dataPanel fleetQueuePanel"><div className="fleetPanelHeading"><div><span>Live FIFO positions</span><h2>My trucks in the queue</h2><p>The server calculates position from the active queue. Priority movement still needs an approved OTP.</p></div><span className="fleetLiveState"><i />Live queue</span></div>{myQueue.length ? <div className="fleetQueueList">{myQueue.map((entry) => <div className={entry.position === 1 ? "fleetQueueRow fleetNextQueueRow" : "fleetQueueRow"} key={entry.id}><strong>#{entry.position}</strong><div><b>{entry.registrationNumber}</b><span>{entry.driverName} · returned {entry.queueEnteredAt}</span></div>{entry.position === 1 ? <span className="nextInLine">Next in line</span> : null}</div>)}</div> : <p className="empty">None of your trucks are currently in the queue.</p>}</section>
    </div>
    <section className="dataPanel fleetTruckPanel fleetRegisterPanel"><div className="fleetRegisterHeading"><div><span>Assigned truck register</span><h2>Every truck under your care</h2><p>Availability, insurance, and queue movement are shown together so the next action stays clear.</p></div><span>{myTrucks.length} assigned</span></div><div className="fleetTruckList">{myTrucks.map((truck) => { const queueEntry = myQueue.find((entry) => entry.truckId === truck.id); return <article className="fleetTruckRow" key={truck.id}><div><strong>{truck.registrationNumber}</strong><span>Driver: {truck.driverName}</span></div><StatusBadge value={truck.currentStatus} /><div className="fleetInsurance"><span>Insurance</span><b>{truck.insuranceExpiry}</b><StatusBadge value={truck.insuranceStatus} /></div><div className="fleetRowActions">{truck.currentStatus === "AWAITING_AVAILABILITY" ? <><span className={(truck.availabilityExpiresAtMillis ?? 0) - nowMillis < 5 * 60000 ? "availabilityCountdown urgent" : "availabilityCountdown"}><Clock3 size={13} />{remainingLabel(truck.availabilityExpiresAtMillis) ?? "One-hour window"}</span><button className="primaryButton" disabled={working} onClick={() => void confirmTruckAvailability(truck)} type="button">Confirm availability</button></> : null}{truck.currentStatus === "ON_TRIP" ? <button className="secondaryButton" onClick={() => open("return", truck.id)} type="button">Report return</button> : null}{queueEntry ? <><span className="fleetPosition"><Clock3 size={14} />Queue #{queueEntry.position}</span>{queueEntry.position > 1 ? <a className="textButton" href="#my-bypass">Bypass</a> : <span className="nextInLine">Next</span>}</> : null}</div></article>; })}</div></section>
    {dialog === "return" ? <Dialog onClose={() => setDialog(null)} title="Report truck return">{message ? <p className="message" role="alert">{message}</p> : null}<div className="policyContext"><strong>FIFO starts when the return is confirmed</strong><span>The server determines queue entry time and insurance eligibility.</span></div><label className="fleetField"><span>Truck</span><select onChange={(event) => setSelectedTruckId(event.target.value)} value={selectedTruckId}>{returnableTrucks.map((truck) => <option key={truck.id} value={truck.id}>{truck.registrationNumber} · {truck.driverName}</option>)}</select></label>{selectedTruck ? <p className="formNotice">Insurance: {selectedTruck.insuranceStatus.replaceAll("_", " ")}. {selectedTruck.insuranceStatus === "VALID" || selectedTruck.insuranceStatus === "EXPIRING_SOON" ? "This truck will enter the queue when confirmed." : "This truck will be placed on insurance hold."}</p> : null}<div className="dialogActions"><button className="secondaryButton" onClick={() => setDialog(null)} type="button">Cancel</button><button className="primaryButton" disabled={!selectedTruck || working} onClick={() => void reportReturn()} type="button">{working ? "Reporting..." : "Confirm return"}</button></div></Dialog> : null}
  </>;
}
