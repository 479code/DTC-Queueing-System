"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Clock3, KeyRound, ListOrdered, ShieldCheck, X } from "lucide-react";
import {
  approveBypassRequest,
  demoBypassRequests,
  getFirebaseSession,
  rejectBypassRequest,
  subscribeToPendingBypasses,
  type ApprovedBypass,
  type BypassRequestView
} from "./api";

function formatReason(reason: string): string {
  return reason.includes("_")
    ? reason.toLowerCase().split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")
    : reason;
}

function secondsRemaining(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

export function BypassScreen() {
  const [requests, setRequests] = useState<BypassRequestView[]>(demoBypassRequests);
  const [selectedId, setSelectedId] = useState(demoBypassRequests[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<"approve" | "reject" | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [approved, setApproved] = useState<ApprovedBypass | null>(null);
  const [approvedRequest, setApprovedRequest] = useState<BypassRequestView | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let unsubscribe: () => void = () => undefined;
    let active = true;
    void getFirebaseSession().then((session) => {
      if (!active || !session || !session.roles.includes("overseer")) return;
      setLoading(true);
      unsubscribe = subscribeToPendingBypasses(
        session.siteId,
        (nextRequests) => {
          setRequests(nextRequests);
          setSelectedId((current) => nextRequests.some((item) => item.id === current) ? current : nextRequests[0]?.id ?? "");
          setLoading(false);
        },
        (error) => {
          setMessage(error);
          setLoading(false);
        }
      );
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!approved) return;
    const update = () => setRemaining(secondsRemaining(approved.expiresAt));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [approved]);

  const selected = useMemo(() => requests.find((item) => item.id === selectedId) ?? requests[0], [requests, selectedId]);
  const removeSelected = useCallback((requestId: string) => setRequests((current) => current.filter((item) => item.id !== requestId)), []);

  const handleApprove = async () => {
    if (!selected) return;
    setAction("approve");
    setMessage("");
    try {
      const result = await approveBypassRequest(selected);
      setApprovedRequest(selected);
      setApproved(result);
      removeSelected(selected.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Approval failed.");
    } finally {
      setAction(null);
    }
  };

  const handleReject = async () => {
    if (!selected || rejectionReason.trim().length < 5) {
      setMessage("Enter a clear rejection reason of at least five characters.");
      return;
    }
    setAction("reject");
    setMessage("");
    try {
      await rejectBypassRequest(selected, rejectionReason.trim());
      removeSelected(selected.id);
      setRejectionReason("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rejection failed.");
    } finally {
      setAction(null);
    }
  };

  const minutes = String(Math.floor(remaining / 60)).padStart(2, "0");
  const seconds = String(remaining % 60).padStart(2, "0");

  return (
    <>
      <header className="pageCommandHeader"><div><p className="eyebrow">Overseer decision desk</p><h1>Bypass approvals</h1><p>Review priority requests without weakening the canonical FIFO queue or the audit record behind it.</p></div><span className="bypassPendingCount"><Clock3 size={17} /><span><b>{requests.length}</b> pending review</span></span></header>
      {message ? <p className="message" role="status">{message}</p> : null}
      <section className="bypassGuardrail"><div><ShieldCheck size={20} /><div><span>Controlled exception process</span><strong>Approval issues a truck-specific, single-use OTP. It does not change FIFO until the fleet officer validates that code.</strong></div></div><div><ListOrdered size={16} /><span>Queue order remains protected</span></div></section>
      <div className="workspaceGrid bypassWorkbench" id="requests">
        <section className="requestList bypassRequestList" aria-label="Pending bypass requests">
          <div className="sectionHeading bypassListHeading"><div><span>Pending approval queue</span><h2>Requests waiting for a decision</h2><p>Review the oldest request first, then record approval or rejection.</p></div></div>
          {loading ? <p className="empty">Loading requests...</p> : null}
          {!loading && requests.length === 0 ? <p className="empty">No bypass requests are waiting for review.</p> : null}
          {requests.map((request) => (
            <button className={request.id === selected?.id ? "requestRow selected" : "requestRow"} key={request.id} onClick={() => { setSelectedId(request.id); setRejectionReason(""); setMessage(""); }} type="button">
              <span className="requestTruck">{request.truckRegistration}</span>
              <span className="requestMeta">Position #{request.queuePosition} | {request.requestedAt}</span>
              <span className="requestOfficer">{request.requestedByName}</span>
              <span className="rowStatus">Pending</span>
            </button>
          ))}
        </section>
        <section className="requestDetail bypassDetailPanel" aria-live="polite">
          {selected ? <>
            <div className="detailHeader"><div><p className="eyebrow">Bypass decision</p><h2>{selected.truckRegistration}</h2><p className="driver">Driver: {selected.driverName} · Request {selected.id}</p></div><span className="statusPill">Pending</span></div>
            <dl className="detailGrid">
              <div><dt>Current position</dt><dd className="position">#{selected.queuePosition}</dd><span>{selected.trucksAhead} trucks ahead</span></div>
              <div><dt>Requested by</dt><dd>{selected.requestedByName}</dd></div>
              <div><dt>Reason</dt><dd>{formatReason(selected.reasonCategory)}</dd></div>
              <div><dt>Requested</dt><dd>{selected.requestedAt}</dd></div>
            </dl>
            <div className="explanation"><span>Explanation</span><p>{selected.explanation}</p></div>
            <label className="rejectField"><span>Rejection reason</span><textarea onChange={(event) => setRejectionReason(event.target.value)} placeholder="Required only when rejecting" rows={3} value={rejectionReason} /></label>
            <div className="detailActions">
              <button className="secondaryButton danger" disabled={action !== null} onClick={handleReject} type="button"><X size={16} />{action === "reject" ? "Rejecting..." : "Reject"}</button>
              <button className="primaryButton" disabled={action !== null} onClick={handleApprove} type="button"><Check size={16} />{action === "approve" ? "Approving..." : "Approve"}</button>
            </div>
          </> : <p className="empty detailEmpty">Select a request when one arrives.</p>}
        </section>
      </div>
      {approved ? <div className="modalBackdrop" role="presentation"><section aria-labelledby="approval-title" aria-modal="true" className="otpDialog" role="dialog">
        <p className="eyebrow success">Bypass approved</p><h2 id="approval-title">{approvedRequest?.truckRegistration ?? approved.bypassRequestId}</h2>
        <div className="otpPanel"><span>Authorization sent</span><strong>{remaining > 0 ? `${minutes}:${seconds}` : "Expired"}</strong><p>{remaining > 0 ? "Time left for the officer to validate" : "The officer must request a new bypass"}</p></div>
        <p className="otpNote">The authorization code went straight to the assigned fleet officer. Nothing needs to be passed on by hand.</p>
        <button className="darkButton" onClick={() => { setApproved(null); setApprovedRequest(null); }} type="button">Back to approvals</button>
      </section></div> : null}
    </>
  );
}
