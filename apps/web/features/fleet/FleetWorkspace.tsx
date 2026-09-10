"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Clock3, KeyRound, ListOrdered, Truck } from "lucide-react";
import type { QueueEntryView, TruckView } from "../operations/api";
import { Dialog, StatusBadge } from "../operations/ui";
import { reportFleetReturn, requestFleetBypass, validateFleetBypassOtp } from "./api";

const bypassReasons = [
  ["OPERATIONAL_REQUIREMENT", "Operational requirement"],
  ["DESTINATION_SPECIFIC_REQUIREMENT", "Destination-specific requirement"],
  ["EMERGENCY_MOVEMENT", "Emergency movement"],
  ["CUSTOMER_REQUIREMENT", "Customer requirement"],
  ["MANAGEMENT_INSTRUCTION", "Management instruction"],
  ["OTHER", "Other"]
] as const;

type DialogName = "return" | "bypass" | "otp" | null;

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
  const [reason, setReason] = useState<(typeof bypassReasons)[number][0]>(bypassReasons[0][0]);
  const [explanation, setExplanation] = useState("");
  const [otp, setOtp] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  const myTrucks = useMemo(
    () => trucks.filter((truck) => demoMode ? truck.assignedFleetOfficerId === "officer-a" : truck.assignedFleetOfficerId === fleetOfficerId),
    [demoMode, fleetOfficerId, trucks]
  );
  const myQueue = useMemo(() => queue.filter((entry) => myTrucks.some((truck) => truck.id === entry.truckId)), [myTrucks, queue]);
  const bypassEligibleQueue = myQueue.filter((entry) => entry.position > 1);
  const returnableTrucks = myTrucks.filter((truck) => truck.currentStatus === "ON_TRIP");
  const selectedTruck = myTrucks.find((truck) => truck.id === selectedTruckId);
  const selectedQueue = selectedTruck ? myQueue.find((entry) => entry.truckId === selectedTruck.id) : undefined;
  const counts = {
    queued: myTrucks.filter((truck) => truck.currentStatus === "QUEUED").length,
    onTrip: returnableTrucks.length,
    programmed: myTrucks.filter((truck) => truck.currentStatus === "PROGRAMMED").length,
    hold: myTrucks.filter((truck) => truck.currentStatus === "INSURANCE_HOLD").length
  };

  const open = (next: Exclude<DialogName, null>, truckId = "") => {
    setDialog(next);
    setSelectedTruckId(truckId || (next === "return" ? returnableTrucks[0]?.id ?? "" : bypassEligibleQueue[0]?.truckId ?? ""));
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

  const submitBypass = async () => {
    if (!selectedTruck || !selectedQueue || explanation.trim().length < 10) {
      setMessage("Choose a queued truck and give a clear explanation of at least ten characters.");
      return;
    }
    setWorking(true);
    setMessage("");
    try {
      const result = await requestFleetBypass({ siteId, truckId: selectedTruck.id, queueCycleId: selectedQueue.id, reasonCategory: reason, explanation: explanation.trim() });
      setDialog(null);
      setMessage(`Bypass request submitted. ${result.numberOfTrucksBypassed} trucks are ahead.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to submit this bypass request.");
    } finally {
      setWorking(false);
    }
  };

  const validateOtp = async () => {
    if (!selectedTruck || !/^\d{6}$/.test(otp)) {
      setMessage("Choose the truck and enter the six-digit code.");
      return;
    }
    setWorking(true);
    setMessage("");
    try {
      await validateFleetBypassOtp({ siteId, truckId: selectedTruck.id, otp });
      setDialog(null);
      setMessage(`${selectedTruck.registrationNumber} bypass authorization is validated and ready for programming.`);
    } catch (error) {
      setMessage(error instanceof Error ? `Unable to validate this code. ${error.message}` : "Unable to validate this code.");
    } finally {
      setWorking(false);
    }
  };

  return <>
    <header className="pageHeader fleetHeader"><div><p className="eyebrow">Fleet officer workspace</p><h1>My Fleet</h1><p>Only the trucks assigned to you, with the actions you need to keep them moving.</p></div><div className="headerActions"><button className="secondaryButton commandButton" disabled={bypassEligibleQueue.length === 0} onClick={() => open("bypass")} type="button"><ListOrdered size={16} />Request bypass</button><button className="secondaryButton commandButton" onClick={() => open("otp")} type="button"><KeyRound size={16} />Enter OTP</button><button className="primaryButton commandButton" disabled={returnableTrucks.length === 0} onClick={() => open("return")} type="button"><Truck size={16} />Report return</button></div></header>
    {message ? <p className={message.includes("Unable") || message.includes("Choose") ? "message" : "successMessage"} role="status">{message}</p> : null}
    <section className="fleetMetrics" aria-label="My fleet status"><div><ListOrdered size={18} /><span>Queued</span><strong>{counts.queued}</strong></div><div><Truck size={18} /><span>On trip</span><strong>{counts.onTrip}</strong></div><div><CheckCircle2 size={18} /><span>Programmed</span><strong>{counts.programmed}</strong></div><div className={counts.hold ? "criticalMetric" : undefined}><CircleAlert size={18} /><span>Insurance hold</span><strong>{counts.hold}</strong></div></section>
    <div className="fleetGrid">
      <section className="dataPanel fleetQueuePanel"><div className="panelTitle"><div><h2>My queue positions</h2><p>Positions are calculated by the server from the live FIFO queue.</p></div></div>{myQueue.length ? <div className="fleetQueueList">{myQueue.map((entry) => <div className="fleetQueueRow" key={entry.id}><strong>#{entry.position}</strong><div><b>{entry.registrationNumber}</b><span>{entry.driverName} · {entry.queueEnteredAt}</span></div>{entry.position === 1 ? <span className="nextInLine">Next in line</span> : <button className="textButton" onClick={() => open("bypass", entry.truckId)} type="button">Request bypass</button>}</div>)}</div> : <p className="empty">None of your trucks are currently in the queue.</p>}</section>
      <section className="dataPanel fleetHelpPanel"><div className="panelTitle"><div><h2>Before programming</h2><p>Validated bypasses are visible to the programming officer.</p></div></div><div className="fleetHelpBody"><KeyRound size={20} /><div><strong>Enter an approved OTP</strong><p>The overseer gives the code after approval. It is single-use and linked to one truck.</p><button className="secondaryButton" onClick={() => open("otp")} type="button">Enter OTP</button></div></div></section>
    </div>
    <section className="dataPanel fleetTruckPanel"><div className="panelTitle"><div><h2>Assigned trucks</h2><p>{myTrucks.length} trucks assigned to your fleet.</p></div></div><div className="fleetTruckList">{myTrucks.map((truck) => { const queueEntry = myQueue.find((entry) => entry.truckId === truck.id); return <article className="fleetTruckRow" key={truck.id}><div><strong>{truck.registrationNumber}</strong><span>Driver: {truck.driverName}</span></div><StatusBadge value={truck.currentStatus} /><div className="fleetInsurance"><span>Insurance</span><b>{truck.insuranceExpiry}</b><StatusBadge value={truck.insuranceStatus} /></div><div className="fleetRowActions">{truck.currentStatus === "ON_TRIP" ? <button className="secondaryButton" onClick={() => open("return", truck.id)} type="button">Report return</button> : null}{queueEntry ? <><span className="fleetPosition"><Clock3 size={14} />#{queueEntry.position}</span>{queueEntry.position > 1 ? <button className="textButton" onClick={() => open("bypass", truck.id)} type="button">Bypass</button> : <span className="nextInLine">Next</span>}</> : null}</div></article>; })}</div></section>
    {dialog === "return" ? <Dialog onClose={() => setDialog(null)} title="Report truck return"><div className="policyContext"><strong>FIFO starts when the return is confirmed</strong><span>The server determines queue entry time and insurance eligibility.</span></div><label className="fleetField"><span>Truck</span><select onChange={(event) => setSelectedTruckId(event.target.value)} value={selectedTruckId}>{returnableTrucks.map((truck) => <option key={truck.id} value={truck.id}>{truck.registrationNumber} · {truck.driverName}</option>)}</select></label>{selectedTruck ? <p className="formNotice">Insurance: {selectedTruck.insuranceStatus.replaceAll("_", " ")}. {selectedTruck.insuranceStatus === "VALID" || selectedTruck.insuranceStatus === "EXPIRING_SOON" ? "This truck will enter the queue when confirmed." : "This truck will be placed on insurance hold."}</p> : null}<div className="dialogActions"><button className="secondaryButton" onClick={() => setDialog(null)} type="button">Cancel</button><button className="primaryButton" disabled={!selectedTruck || working} onClick={() => void reportReturn()} type="button">{working ? "Reporting..." : "Confirm return"}</button></div></Dialog> : null}
    {dialog === "bypass" ? <Dialog onClose={() => setDialog(null)} title="Request bypass"><label className="fleetField"><span>Queued truck</span><select onChange={(event) => setSelectedTruckId(event.target.value)} value={selectedTruckId}>{bypassEligibleQueue.map((entry) => <option key={entry.id} value={entry.truckId}>#{entry.position} · {entry.registrationNumber}</option>)}</select></label><label className="fleetField"><span>Reason</span><select onChange={(event) => setReason(event.target.value as typeof reason)} value={reason}>{bypassReasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="fleetField"><span>Explanation</span><textarea onChange={(event) => setExplanation(event.target.value)} placeholder="Why does this truck need priority movement?" rows={4} value={explanation} /></label><p className="formNotice">A bypass never changes FIFO automatically. An overseer must approve it, then you validate the issued OTP.</p><div className="dialogActions"><button className="secondaryButton" onClick={() => setDialog(null)} type="button">Cancel</button><button className="primaryButton" disabled={working} onClick={() => void submitBypass()} type="button">{working ? "Submitting..." : "Submit request"}</button></div></Dialog> : null}
    {dialog === "otp" ? <Dialog onClose={() => setDialog(null)} title="Enter bypass OTP"><label className="fleetField"><span>Queued truck</span><select onChange={(event) => setSelectedTruckId(event.target.value)} value={selectedTruckId}>{myQueue.map((entry) => <option key={entry.id} value={entry.truckId}>#{entry.position} · {entry.registrationNumber}</option>)}</select></label><label className="fleetField"><span>Six-digit authorization code</span><input inputMode="numeric" maxLength={6} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} placeholder="000000" value={otp} /></label><p className="formNotice">The system finds the approved bypass authorization for the selected truck. The code is single-use.</p><div className="dialogActions"><button className="secondaryButton" onClick={() => setDialog(null)} type="button">Cancel</button><button className="primaryButton" disabled={working} onClick={() => void validateOtp()} type="button">{working ? "Validating..." : "Validate OTP"}</button></div></Dialog> : null}
  </>;
}
