"use client";

import { useEffect, useMemo, useState } from "react";
import { KeyRound, ListOrdered, ShieldCheck } from "lucide-react";
import type { QueueEntryView, TruckView } from "../operations/api";
import { Dialog, StatusBadge } from "../operations/ui";
import {
  requestFleetBypass, subscribeToIssuedBypassCodes, subscribeToMyBypassRequests, validateFleetBypassOtp,
  type IssuedBypassCode, type MyBypassRequest
} from "./api";

const bypassReasons = [
  ["OPERATIONAL_REQUIREMENT", "Operational requirement"],
  ["DESTINATION_SPECIFIC_REQUIREMENT", "Destination-specific requirement"],
  ["EMERGENCY_MOVEMENT", "Emergency movement"],
  ["CUSTOMER_REQUIREMENT", "Customer requirement"],
  ["MANAGEMENT_INSTRUCTION", "Management instruction"],
  ["OTHER", "Other"]
] as const;

export function BypassWorkspace({
  fleetOfficerId,
  queue,
  siteId,
  trucks
}: {
  fleetOfficerId: string;
  queue: QueueEntryView[];
  siteId: string;
  trucks: TruckView[];
}) {
  const [requests, setRequests] = useState<MyBypassRequest[]>([]);
  const [issuedCodes, setIssuedCodes] = useState<IssuedBypassCode[]>([]);
  const [dialog, setDialog] = useState<"request" | "validate" | null>(null);
  const [selectedTruckId, setSelectedTruckId] = useState("");
  const [reason, setReason] = useState<(typeof bypassReasons)[number][0]>(bypassReasons[0][0]);
  const [explanation, setExplanation] = useState("");
  const [otp, setOtp] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => subscribeToMyBypassRequests(siteId, fleetOfficerId, setRequests), [fleetOfficerId, siteId]);
  useEffect(() => subscribeToIssuedBypassCodes(siteId, fleetOfficerId, setIssuedCodes), [fleetOfficerId, siteId]);

  const myTrucks = useMemo(() => trucks.filter((truck) => truck.assignedFleetOfficerId === fleetOfficerId), [fleetOfficerId, trucks]);
  const myQueue = useMemo(() => queue.filter((entry) => myTrucks.some((truck) => truck.id === entry.truckId)), [myTrucks, queue]);
  const eligible = myQueue.filter((entry) => entry.position > 1);
  const selectedQueue = myQueue.find((entry) => entry.truckId === selectedTruckId);
  const registration = (truckId: string) => myTrucks.find((truck) => truck.id === truckId)?.registrationNumber ?? "Truck";
  const pending = requests.filter((item) => item.status === "PENDING").length;

  const openRequest = () => {
    setDialog("request");
    setSelectedTruckId(eligible[0]?.truckId ?? "");
    setExplanation("");
    setMessage("");
  };

  const openValidate = (code: IssuedBypassCode) => {
    setDialog("validate");
    setSelectedTruckId(code.truckId);
    setOtp(code.otp);
    setMessage("");
  };

  const submitRequest = async () => {
    if (!selectedTruckId || !selectedQueue || explanation.trim().length < 10) {
      setMessage("Choose a queued truck and give a clear explanation of at least ten characters.");
      return;
    }
    setWorking(true); setMessage("");
    try {
      const result = await requestFleetBypass({ siteId, truckId: selectedTruckId, queueCycleId: selectedQueue.id, reasonCategory: reason, explanation: explanation.trim() });
      setDialog(null);
      setMessage(`Request submitted for ${registration(selectedTruckId)}. ${result.numberOfTrucksBypassed} trucks are ahead. An overseer must approve it.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to submit this bypass request.");
    } finally { setWorking(false); }
  };

  const validate = async () => {
    if (!selectedTruckId || !/^\d{6}$/.test(otp)) {
      setMessage("Choose the truck and enter the six-digit code.");
      return;
    }
    setWorking(true); setMessage("");
    try {
      await validateFleetBypassOtp({ siteId, truckId: selectedTruckId, otp });
      setDialog(null);
      setMessage(`${registration(selectedTruckId)} is validated and ready for programming.`);
    } catch (error) {
      setMessage(error instanceof Error ? `Unable to validate this code. ${error.message}` : "Unable to validate this code.");
    } finally { setWorking(false); }
  };

  return <>
    <header className="pageCommandHeader">
      <div><p className="eyebrow">Priority movement</p><h1>My bypass requests</h1><p>Ask for priority only when a trip genuinely needs it. An overseer decides, and an approved code arrives here ready to use.</p></div>
      <button className="primaryButton commandButton" disabled={eligible.length === 0} onClick={openRequest} type="button"><ListOrdered size={16} />Request bypass</button>
    </header>
    {message ? <p className={message.startsWith("Unable") || message.startsWith("Choose") ? "message" : "successMessage"} role="status">{message}</p> : null}

    <section className="fleetMetrics fleetStatusStrip" aria-label="Bypass summary">
      <div><ListOrdered size={18} /><span>Awaiting a decision</span><strong>{pending}</strong></div><i />
      <div><KeyRound size={18} /><span>Codes ready to use</span><strong>{issuedCodes.length}</strong></div><i />
      <div><ShieldCheck size={18} /><span>Trucks that can request</span><strong>{eligible.length}</strong></div>
    </section>

    {issuedCodes.length ? <section className="fleetAuthorizationPanel">
      <div><span>Approved</span><h2>Your authorization is ready.</h2><p>The code was sent to you directly. Validate it before programming; it can only be used once.</p></div>
      <div className="issuedCodeList">{issuedCodes.map((code) => <div className="issuedCode" key={code.id}>
        <span>Approved code for {registration(code.truckId)}</span><strong>{code.otp}</strong>
        <button className="fleetOtpButton" onClick={() => openValidate(code)} type="button"><KeyRound size={16} />Validate this code</button>
      </div>)}</div>
    </section> : null}

    <section className="dataPanel fleetRegisterPanel">
      <div className="fleetRegisterHeading"><div><span>Request history</span><h2>What happened to each request</h2><p>Every decision is recorded, including the reason an overseer gave for a rejection.</p></div><span>{requests.length} shown</span></div>
      {requests.length ? <div className="fleetTruckList">{requests.map((item) => <article className="fleetTruckRow bypassHistoryRow" key={item.id}>
        <div><strong>{registration(item.truckId)}</strong><span>Requested {item.requestedAt}</span></div>
        <StatusBadge value={item.status} />
        <div className="bypassOutcome">{item.rejectionReason ? <><span>Overseer&apos;s reason</span><b>{item.rejectionReason}</b></> : <span>{item.status === "PENDING" ? "Waiting for an overseer" : item.status === "APPROVED" ? "Validate the code above" : item.status === "USED" ? "Used in a programming batch" : "No further action"}</span>}</div>
      </article>)}</div> : <p className="empty">You have not requested a bypass yet.</p>}
    </section>

    {dialog === "request" ? <Dialog onClose={() => setDialog(null)} title="Request bypass">
      {message ? <p className="message" role="alert">{message}</p> : null}
      <label className="fleetField"><span>Queued truck</span><select onChange={(event) => setSelectedTruckId(event.target.value)} value={selectedTruckId}>{eligible.map((entry) => <option key={entry.id} value={entry.truckId}>#{entry.position} · {entry.registrationNumber}</option>)}</select></label>
      <label className="fleetField"><span>Reason</span><select onChange={(event) => setReason(event.target.value as typeof reason)} value={reason}>{bypassReasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="fleetField"><span>Explanation</span><textarea onChange={(event) => setExplanation(event.target.value)} placeholder="Why does this truck need priority movement?" rows={4} value={explanation} /></label>
      <p className="formNotice">A bypass never changes FIFO automatically. An overseer must approve it, and the code comes straight back to you.</p>
      <div className="dialogActions"><button className="secondaryButton" onClick={() => setDialog(null)} type="button">Cancel</button><button className="primaryButton" disabled={working} onClick={() => void submitRequest()} type="button">{working ? "Submitting..." : "Submit request"}</button></div>
    </Dialog> : null}

    {dialog === "validate" ? <Dialog onClose={() => setDialog(null)} title="Validate bypass code">
      {message ? <p className="message" role="alert">{message}</p> : null}
      <label className="fleetField"><span>Truck</span><select onChange={(event) => setSelectedTruckId(event.target.value)} value={selectedTruckId}>{myQueue.map((entry) => <option key={entry.id} value={entry.truckId}>#{entry.position} · {entry.registrationNumber}</option>)}</select></label>
      <label className="fleetField"><span>Authorization code</span><input inputMode="numeric" maxLength={6} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} value={otp} /></label>
      <p className="formNotice">The code is single-use and tied to this truck. Validating it makes the truck eligible for the next programming batch.</p>
      <div className="dialogActions"><button className="secondaryButton" onClick={() => setDialog(null)} type="button">Cancel</button><button className="primaryButton" disabled={working} onClick={() => void validate()} type="button">{working ? "Validating..." : "Validate"}</button></div>
    </Dialog> : null}
  </>;
}
