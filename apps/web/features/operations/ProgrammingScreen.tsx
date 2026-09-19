"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Clock3, Eye, Layers3, ListOrdered, LoaderCircle, RefreshCw, Send, ShieldCheck } from "lucide-react";
import {
  confirmProgrammingWithOrders, loadAvailabilityBatch, loadAvailableOrders, loadValidatedBypasses,
  previewProgramming, startAvailability, type AvailabilityBatch, type ImportedOrderOption,
  type ProgrammingPreview, type QueueEntryView, type ValidatedBypassOption
} from "./api";
import { StatusBadge } from "./ui";

export function ProgrammingScreen({ siteId, queue }: { siteId: string; queue: QueueEntryView[] }) {
  const [batchSize, setBatchSize] = useState(5);
  const [includeBypass, setIncludeBypass] = useState(false);
  const [bypasses, setBypasses] = useState<ValidatedBypassOption[]>([]);
  const [selectedBypassId, setSelectedBypassId] = useState("");
  const [preview, setPreview] = useState<ProgrammingPreview | null>(null);
  const [activeBatch, setActiveBatch] = useState<AvailabilityBatch | null>(null);
  const [orders, setOrders] = useState<ImportedOrderOption[]>([]);
  const [orderByCycle, setOrderByCycle] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ humanCode: string; confirmedSize: number; atcCount: number } | null>(null);
  const [busy, setBusy] = useState<"preview" | "request" | "refresh" | "program" | null>(null);
  const [error, setError] = useState("");
  const queueByTruck = useMemo(() => new Map(queue.map((item) => [item.truckId, item])), [queue]);
  const selectedBypass = bypasses.find((item) => item.authorizationId === selectedBypassId);
  const confirmed = activeBatch?.items.filter((item) => item.availabilityStatus === "CONFIRMED") ?? [];
  const allOrdersSelected = confirmed.length > 0 && confirmed.every((item) => orderByCycle[item.queueCycleId]);
  const activeStep = activeBatch ? (confirmed.length === activeBatch.items.length ? 2 : 1) : 0;

  const refreshBypasses = async () => {
    const options = await loadValidatedBypasses(siteId);
    setBypasses(options);
    setSelectedBypassId((current) => options.some((item) => item.authorizationId === current) ? current : options[0]?.authorizationId ?? "");
  };
  useEffect(() => { void refreshBypasses().catch(() => undefined); }, [siteId]);
  const input = { siteId, requestedSize: batchSize, includeBypassAuthorizationIds: includeBypass && selectedBypass ? [selectedBypass.authorizationId] : undefined };

  const previewBatch = async () => {
    setBusy("preview"); setError(""); setResult(null); setActiveBatch(null); setOrderByCycle({});
    try { setPreview(await previewProgramming(input)); } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to preview the next batch."); }
    finally { setBusy(null); }
  };
  const requestAvailability = async () => {
    if (!preview) return;
    setBusy("request"); setError("");
    try {
      const started = await startAvailability(input);
      const [batch, availableOrders] = await Promise.all([loadAvailabilityBatch({ siteId, batchId: started.batchId, requestedSize: started.requestedSize }), loadAvailableOrders(siteId)]);
      setActiveBatch(batch); setOrders(availableOrders); setPreview(null); setIncludeBypass(false);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to request availability."); }
    finally { setBusy(null); }
  };
  const refreshAvailability = async () => {
    if (!activeBatch) return;
    setBusy("refresh"); setError("");
    try {
      const [batch, availableOrders] = await Promise.all([loadAvailabilityBatch({ siteId, batchId: activeBatch.batchId }), loadAvailableOrders(siteId)]);
      setActiveBatch(batch); setOrders(availableOrders);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to refresh availability."); }
    finally { setBusy(null); }
  };
  const programConfirmed = async () => {
    if (!activeBatch || !allOrdersSelected) return;
    setBusy("program"); setError("");
    try {
      const response = await confirmProgrammingWithOrders({ siteId, batchId: activeBatch.batchId, orderAssignments: confirmed.map((item) => ({ queueCycleId: item.queueCycleId, orderId: orderByCycle[item.queueCycleId]! })) });
      setResult(response); setActiveBatch(null); setOrders([]); setOrderByCycle({});
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to confirm programming."); }
    finally { setBusy(null); }
  };

  return <>
    <header className="programmingHeader"><div><p className="eyebrow success">FIFO programming</p><h1>Build the next programming run</h1><p>Suggested trucks stay in their canonical queue order through availability and ATC assignment.</p></div><div className="programmingQueueCount"><ListOrdered size={17} /><div><span>Active FIFO queue</span><strong>{queue.length} trucks</strong></div></div></header>
    <ol className="programmingSteps" aria-label="Programming progress"><li className={activeStep === 0 ? "active" : activeStep > 0 ? "complete" : undefined}><span>01</span><div><strong>Build batch</strong><small>Select the next FIFO trucks</small></div></li><li className={activeStep === 1 ? "active" : activeStep > 1 ? "complete" : undefined}><span>02</span><div><strong>Confirm availability</strong><small>One-hour response window</small></div></li><li className={activeStep === 2 ? "active" : undefined}><span>03</span><div><strong>Assign orders &amp; ATCs</strong><small>Program confirmed trucks</small></div></li></ol>
    {error ? <p className="message" role="alert">{error}</p> : null}
    {result ? <section className="programmingSuccess"><CheckCircle2 size={24} /><div><span>Programming confirmed</span><h2>{result.humanCode}</h2><p>{result.confirmedSize} confirmed trucks programmed with {result.atcCount} imported ATC numbers.</p></div><a className="secondaryButton" href="#queue">Return to queue</a></section> : null}
    <div className="programmingLayout programmingWorkbench">
      <section className="programmingControls"><div className="programmingSetupHeading"><span>Batch setup</span><h2>Choose a programming size</h2><p>The queue determines the trucks. This only sets how many are considered.</p></div>
        <label className="numberField programmingBatchSize"><span>Trucks in this run</span><div><input max={Math.max(1, queue.length)} min={1} onChange={(event) => { setBatchSize(Number(event.target.value)); setPreview(null); }} type="number" value={batchSize} /><span>of {queue.length} in queue</span></div></label>
        <div className="bypassControl programmingBypass"><div className="bypassTitle"><div><span>Validated bypass</span><strong>{selectedBypass ? selectedBypass.registrationNumber : "None available"}</strong><small>{selectedBypass ? "Available to include in this run" : "No approved bypass is currently available"}</small></div><button aria-label="Refresh validated bypasses" className="iconButton" onClick={() => void refreshBypasses()} title="Refresh validated bypasses" type="button"><RefreshCw size={16} /></button></div><label className="checkboxField"><input checked={includeBypass} disabled={!selectedBypass} onChange={(event) => { setIncludeBypass(event.target.checked); setPreview(null); }} type="checkbox" /><span>Include approved bypass</span></label></div>
        <div className="programmingSetupFooter"><span><ShieldCheck size={15} /> FIFO eligibility and insurance are checked automatically.</span><button className="primaryButton commandButton wideButton" disabled={busy !== null || batchSize < 1 || batchSize > queue.length} onClick={() => void previewBatch()} type="button">{busy === "preview" ? <LoaderCircle className="spin" size={17} /> : <Eye size={17} />}Preview FIFO batch</button></div>
      </section>
      <section className="previewPanel programmingPreviewPanel"><div className="programmingPanelHeading"><div><span>{activeBatch ? "Availability window" : preview ? "FIFO batch preview" : "Next in line"}</span><h2>{activeBatch ? `${confirmed.length} of ${activeBatch.items.length} drivers confirmed` : preview ? `${preview.items.length} FIFO trucks selected` : "The queue is ready when you are"}</h2><p>{activeBatch ? "Confirmed trucks can now receive imported orders and ATCs." : preview ? "Review the suggested order before requesting availability." : "Start with a batch size to see the next eligible trucks."}</p></div>{activeBatch ? <button className="iconButton" disabled={busy !== null} onClick={() => void refreshAvailability()} title="Refresh availability" type="button">{busy === "refresh" ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}</button> : <span className="programmingPanelStatus"><span /> Live queue</span>}</div>
        {preview ? <><div className="programmingRoster availabilityRoster"><div aria-hidden="true" className="programmingRosterHeader"><span>Order</span><span>Truck and driver</span><span>Queue</span><span>Selection</span></div>{preview.items.map((item) => { const truck = queueByTruck.get(item.truckId); return <div className="programmingRosterRow" key={item.queueCycleId}><div className="programmingOrder"><span>Batch</span><strong>#{item.batchOrder}</strong></div><div className="programmingTruck"><strong>{truck?.registrationNumber ?? item.truckId}</strong><span>{truck?.driverName ?? "Driver not recorded"}</span></div><div className="programmingQueuePosition"><span>Queue position</span><strong>#{item.originalQueuePosition}</strong></div><div><StatusBadge value={item.selectionType} /></div></div>; })}</div><div className="confirmBar"><p>Availability confirmation will be requested for every truck for one hour.</p><button className="primaryButton commandButton" disabled={busy !== null} onClick={() => void requestAvailability()} type="button">{busy === "request" ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}Request availability</button></div></> : null}
        {activeBatch ? <><div className="availabilitySummary"><Clock3 size={18} /><p>{confirmed.length} of {activeBatch.items.length} trucks have confirmed. Expired trucks are replaced by the next eligible FIFO truck, then return to the back of the queue.</p></div><div className="programmingRoster availabilityRoster"><div aria-hidden="true" className="programmingRosterHeader"><span>Order</span><span>Truck</span><span>Availability</span><span>Imported order and ATC</span></div>{activeBatch.items.map((item) => { const truck = queueByTruck.get(item.truckId); const eligible = item.availabilityStatus === "CONFIRMED"; return <div className="programmingRosterRow" key={`${item.queueCycleId}-${item.batchOrder}`}><div className="programmingOrder"><span>Batch</span><strong>#{item.batchOrder}</strong></div><div className="programmingTruck"><strong>{truck?.registrationNumber ?? item.truckId}</strong><span>{truck?.driverName ?? "Driver not recorded"}</span></div><div><StatusBadge value={item.availabilityStatus} /></div><label className="atcField"><span>Order and ATC</span><select disabled={!eligible || busy !== null} onChange={(event) => setOrderByCycle((current) => ({ ...current, [item.queueCycleId]: event.target.value }))} value={orderByCycle[item.queueCycleId] ?? ""}><option value="">Select imported order</option>{orders.map((order) => <option disabled={Object.entries(orderByCycle).some(([cycle, orderId]) => cycle !== item.queueCycleId && orderId === order.orderId)} key={order.orderId} value={order.orderId}>{order.atcNo} · SO {order.salesOrderNo} · {order.dprpCustomerName ?? order.customerName}</option>)}</select></label></div>; })}</div><div className="confirmBar"><p>{allOrdersSelected ? "Ready to program confirmed trucks in FIFO order." : "Choose an imported order and ATC for each confirmed truck."}</p><button className="primaryButton commandButton" disabled={busy !== null || !allOrdersSelected} onClick={() => void programConfirmed()} type="button">{busy === "program" ? <LoaderCircle className="spin" size={16} /> : <CheckCircle2 size={16} />}Confirm programming</button></div></> : null}
        {!preview && !activeBatch ? <div className="emptyPreview programmingEmpty"><span><Layers3 size={23} /></span><h3>No batch selected</h3><p>Choose the number of trucks for the next FIFO run.</p><ArrowRight size={17} /></div> : null}
      </section>
    </div>
  </>;
}
