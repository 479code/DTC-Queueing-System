"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, ClipboardPaste, Eye, LoaderCircle, RefreshCw } from "lucide-react";
import {
  confirmProgramming,
  loadValidatedBypasses,
  previewProgramming,
  type ProgrammingPreview,
  type ProgrammingResult,
  type QueueEntryView,
  type ValidatedBypassOption
} from "./api";
import { StatusBadge } from "./ui";

export function ProgrammingScreen({ siteId, queue }: { siteId: string; queue: QueueEntryView[] }) {
  const [batchSize, setBatchSize] = useState(5);
  const [includeBypass, setIncludeBypass] = useState(false);
  const [bypassOptions, setBypassOptions] = useState<ValidatedBypassOption[]>([]);
  const [selectedAuthorizationId, setSelectedAuthorizationId] = useState("");
  const [preview, setPreview] = useState<ProgrammingPreview | null>(null);
  const [atcByCycle, setAtcByCycle] = useState<Record<string, string>>({});
  const [bulkAtcText, setBulkAtcText] = useState("");
  const [showBulkEntry, setShowBulkEntry] = useState(false);
  const [result, setResult] = useState<ProgrammingResult | null>(null);
  const [busy, setBusy] = useState<"preview" | "confirm" | null>(null);
  const [error, setError] = useState("");
  const queueByTruck = useMemo(() => new Map(queue.map((item) => [item.truckId, item])), [queue]);
  const selectedBypass = bypassOptions.find((option) => option.authorizationId === selectedAuthorizationId);
  const bypassEligible = Boolean(selectedBypass && batchSize < selectedBypass.originalQueuePosition);
  const enteredAtcCount = preview?.items.filter((item) => (atcByCycle[item.queueCycleId] ?? "").trim()).length ?? 0;
  const allAtcsEntered = Boolean(preview && enteredAtcCount === preview.items.length);

  const refreshBypasses = async () => {
    try {
      const options = await loadValidatedBypasses(siteId);
      setBypassOptions(options);
      setSelectedAuthorizationId((current) =>
        options.some((option) => option.authorizationId === current)
          ? current
          : options[0]?.authorizationId ?? ""
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load validated bypasses.");
    }
  };

  useEffect(() => {
    void refreshBypasses();
  }, [siteId]);

  const input = {
    siteId,
    requestedSize: batchSize,
    includeBypassAuthorizationIds: includeBypass && selectedBypass
      ? [selectedBypass.authorizationId]
      : undefined
  };

  const clearPreview = () => {
    setPreview(null);
    setAtcByCycle({});
    setBulkAtcText("");
    setShowBulkEntry(false);
  };

  const handlePreview = async () => {
    setBusy("preview");
    setError("");
    setResult(null);
    try {
      const nextPreview = await previewProgramming(input);
      setPreview(nextPreview);
      setAtcByCycle(Object.fromEntries(nextPreview.items.map((item) => [item.queueCycleId, ""])));
      setBulkAtcText("");
      setShowBulkEntry(false);
    } catch (caught) {
      clearPreview();
      setError(caught instanceof Error ? caught.message : "Unable to preview batch.");
    } finally {
      setBusy(null);
    }
  };

  const applyBulkAtcs = () => {
    if (!preview) return;
    const atcNumbers = bulkAtcText
      .split(/\r?\n/)
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean);
    if (atcNumbers.length !== preview.items.length) {
      setError(`Paste exactly ${preview.items.length} ATC numbers, one per line, in FIFO order.`);
      return;
    }
    setAtcByCycle(Object.fromEntries(
      preview.items.map((item, index) => [item.queueCycleId, atcNumbers[index] ?? ""])
    ));
    setBulkAtcText("");
    setShowBulkEntry(false);
    setError("");
  };

  const handleConfirm = async () => {
    if (!preview || !allAtcsEntered) {
      setError("Enter an ATC number for every truck before confirming programming.");
      return;
    }
    const atcAssignments = preview.items.map((item) => ({
      queueCycleId: item.queueCycleId,
      atcNo: atcByCycle[item.queueCycleId]!.trim().toUpperCase()
    }));
    setBusy("confirm");
    setError("");
    try {
      setResult(await confirmProgramming({ ...input, atcAssignments }));
      clearPreview();
      setIncludeBypass(false);
      await refreshBypasses();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to confirm batch.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <header className="pageHeader"><div><h1>Programming</h1><p>The system locks the next trucks in FIFO order for programming.</p></div></header>
      {error ? <p className="message" role="alert">{error}</p> : null}
      {result ? <section className="programmingSuccess"><CheckCircle2 size={24} /><div><span>Batch confirmed</span><h2>{result.humanCode}</h2><p>{result.confirmedSize} trucks programmed with {result.atcCount} ATC numbers: {result.fifoCount} FIFO, {result.bypassCount} bypass.</p></div><a className="secondaryButton" href="#queue">Return to queue</a></section> : null}
      <div className="programmingLayout">
        <section className="programmingControls">
          <div className="panelTitle"><div><h2>Build next batch</h2><p>Truck selection follows the live queue.</p></div></div>
          <label className="numberField"><span>Number of trucks</span><input max={Math.max(1, queue.length)} min={1} onChange={(event) => { const next = Number(event.target.value); setBatchSize(next); clearPreview(); if (selectedBypass && next >= selectedBypass.originalQueuePosition) setIncludeBypass(false); }} type="number" value={batchSize} /></label>
          <div className="bypassControl">
            <div className="bypassTitle"><div><span>Validated bypass</span>{selectedBypass ? <><strong>{selectedBypass.registrationNumber}</strong><small>{selectedBypass.driverName} | Current position #{selectedBypass.originalQueuePosition}</small></> : <strong>None available</strong>}</div><button aria-label="Refresh validated bypasses" className="iconButton" onClick={() => void refreshBypasses()} title="Refresh validated bypasses" type="button"><RefreshCw size={16} /></button></div>
            {bypassOptions.length > 1 ? <label className="numberField"><span>Authorization</span><select onChange={(event) => { setSelectedAuthorizationId(event.target.value); setIncludeBypass(false); clearPreview(); }} value={selectedAuthorizationId}>{bypassOptions.map((option) => <option key={option.authorizationId} value={option.authorizationId}>{option.registrationNumber} | Position #{option.originalQueuePosition}</option>)}</select></label> : null}
            <label className="checkboxField"><input checked={includeBypass} disabled={!bypassEligible} onChange={(event) => { setIncludeBypass(event.target.checked); clearPreview(); }} type="checkbox" /><span>Include in this batch</span></label>
            {!selectedBypass ? <p className="controlNote">No validated, unexpired bypass authorization is available.</p> : bypassEligible ? <p className="controlNote"><AlertTriangle size={15} /> Including this bypass replaces FIFO truck #{batchSize} for this batch only. That truck remains first in the queue afterward.</p> : <p className="controlNote">This truck is already inside the requested FIFO range, so bypass is unnecessary.</p>}
          </div>
          <button className="primaryButton commandButton wideButton" disabled={busy !== null || batchSize < 1 || batchSize > queue.length} onClick={handlePreview} type="button">{busy === "preview" ? <LoaderCircle className="spin" size={17} /> : <Eye size={17} />} Preview FIFO batch</button>
        </section>

        <section className="previewPanel programmingPreviewPanel">
          <div className="panelTitle"><div><h2>Programming list</h2><p>{preview ? `${preview.fifoCount} FIFO + ${preview.bypassCount} bypass` : "Preview the next trucks to enter their ATC numbers."}</p></div>{preview ? <span className="recordCount">{preview.items.length} trucks</span> : null}</div>
          {preview ? <>
            <div className="atcToolbar"><div><strong>ATC entry</strong><span>{enteredAtcCount} of {preview.items.length} entered</span></div><button className="secondaryButton commandButton" onClick={() => { setShowBulkEntry((current) => !current); setError(""); }} type="button"><ClipboardPaste size={16} /> Batch paste</button></div>
            {showBulkEntry ? <div className="bulkAtcEntry"><label><span>Paste ATC numbers in the same order as the trucks below</span><textarea onChange={(event) => setBulkAtcText(event.target.value)} placeholder={`One ATC number per line (${preview.items.length} lines)`} rows={Math.min(6, preview.items.length)} value={bulkAtcText} /></label><button className="primaryButton commandButton" disabled={!bulkAtcText.trim()} onClick={applyBulkAtcs} type="button"><Check size={16} /> Apply to list</button></div> : null}
            <div className="programmingRoster"><div aria-hidden="true" className="programmingRosterHeader"><span>Order</span><span>Truck and driver</span><span>Queue</span><span>Selection</span><span>ATC number</span></div>{preview.items.map((item) => {
              const queueItem = queueByTruck.get(item.truckId);
              const registrationNumber = queueItem?.registrationNumber ?? selectedBypass?.registrationNumber ?? item.truckId;
              const driverName = queueItem?.driverName ?? selectedBypass?.driverName ?? "Driver not recorded";
              const atcNo = atcByCycle[item.queueCycleId] ?? "";
              return <div className={item.selectionType === "BYPASS" ? "programmingRosterRow bypassRosterRow" : "programmingRosterRow"} key={`${item.queueCycleId}-${item.batchOrder}`}><div className="programmingOrder"><span>Batch</span><strong>#{item.batchOrder}</strong></div><div className="programmingTruck"><strong>{registrationNumber}</strong><span>{driverName}</span></div><div className="programmingQueuePosition"><span>Queue position</span><strong>#{item.originalQueuePosition}</strong></div><div><StatusBadge value={item.selectionType} /></div><label className="atcField"><span>ATC number</span><input autoComplete="off" maxLength={80} onChange={(event) => setAtcByCycle((current) => ({ ...current, [item.queueCycleId]: event.target.value.toUpperCase() }))} placeholder="Enter ATC number" value={atcNo} /></label></div>;
            })}</div>
            <div className="confirmBar"><p>{allAtcsEntered ? "Ready to confirm. FIFO order will be rechecked." : `${preview.items.length - enteredAtcCount} ATC ${preview.items.length - enteredAtcCount === 1 ? "number" : "numbers"} remaining.`}</p><button className="primaryButton commandButton" disabled={busy !== null || !allAtcsEntered} onClick={handleConfirm} type="button">{busy === "confirm" ? <LoaderCircle className="spin" size={16} /> : <CheckCircle2 size={16} />}{busy === "confirm" ? "Confirming..." : "Confirm programming"}</button></div>
          </> : <div className="emptyPreview"><Eye size={28} /><p>No programming list yet.</p></div>}
        </section>
      </div>
    </>
  );
}
