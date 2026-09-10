"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Copy,
  FileSpreadsheet,
  ListX,
  LoaderCircle,
  Shuffle,
  Upload
} from "lucide-react";
import {
  demoDispatchImport,
  subscribeToDispatchImports,
  subscribeToDispatchRecords,
  uploadAndReconcileDispatch,
  type DispatchImportView,
  type DispatchMatchStatus,
  type DispatchRecordView
} from "./api";
import { Dialog, StatusBadge } from "../operations/ui";

const tabs: Array<{ id: DispatchMatchStatus; label: string }> = [
  { id: "MATCHED", label: "Matched" },
  { id: "PROGRAMMED_NOT_DISPATCHED", label: "Not dispatched" },
  { id: "DISPATCHED_NOT_PROGRAMMED", label: "Not programmed" },
  { id: "TRUCK_MISMATCH", label: "Truck mismatch" },
  { id: "UNKNOWN_TRUCK", label: "Unknown truck" },
  { id: "DUPLICATE_ROW", label: "Duplicates" }
];

function countForStatus(item: DispatchImportView, status: DispatchMatchStatus): number {
  const field: Record<DispatchMatchStatus, keyof DispatchImportView> = {
    MATCHED: "matchedCount",
    PROGRAMMED_NOT_DISPATCHED: "programmedNotDispatchedCount",
    DISPATCHED_NOT_PROGRAMMED: "dispatchedNotProgrammedCount",
    TRUCK_MISMATCH: "truckMismatchCount",
    UNKNOWN_TRUCK: "unknownTruckCount",
    DUPLICATE_ROW: "duplicateRowCount"
  };
  return Number(item[field[status]] ?? 0);
}

function formatQuantity(value?: number): string {
  return value === undefined ? "Not in report" : new Intl.NumberFormat("en-NG").format(value);
}

export function DispatchScreen({ siteId, demoMode }: { siteId: string; demoMode: boolean }) {
  const [imports, setImports] = useState<DispatchImportView[]>(demoMode ? [demoDispatchImport] : []);
  const [selectedImportId, setSelectedImportId] = useState(demoMode ? demoDispatchImport.id : "");
  const [records, setRecords] = useState<DispatchRecordView[]>([]);
  const [activeStatus, setActiveStatus] = useState<DispatchMatchStatus>("MATCHED");
  const [showUpload, setShowUpload] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => subscribeToDispatchImports(
    siteId,
    demoMode,
    (nextImports) => {
      setImports(nextImports);
      setSelectedImportId((current) => nextImports.some((item) => item.id === current) ? current : nextImports[0]?.id ?? "");
    },
    setError
  ), [demoMode, siteId]);

  useEffect(() => {
    if (!selectedImportId) {
      setRecords([]);
      return;
    }
    return subscribeToDispatchRecords(siteId, selectedImportId, demoMode, setRecords, setError);
  }, [demoMode, selectedImportId, siteId]);

  const selectedImport = imports.find((item) => item.id === selectedImportId) ?? imports[0];
  const filteredRecords = useMemo(
    () => records.filter((record) => record.matchStatus === activeStatus),
    [activeStatus, records]
  );

  const handleUpload = async () => {
    if (!file) {
      setError("Choose an Excel .xlsx dispatch report.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await uploadAndReconcileDispatch(siteId, file, demoMode);
      setSelectedImportId(result.importId);
      setSuccess(`Dispatch report reconciled: ${result.summary.matchedCount} exact matches and ${result.summary.rowsProcessed - result.summary.matchedCount} imported exceptions.`);
      setShowUpload(false);
      setFile(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The dispatch report could not be reconciled.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="pageHeader">
        <div><h1>Dispatch reconciliation</h1><p>Compare refinery dispatch records with the trucks programmed in FIFO order.</p></div>
        <button className="primaryButton commandButton" onClick={() => { setShowUpload(true); setError(""); }} type="button"><Upload size={17} /> Upload report</button>
      </header>
      {error ? <p className="message" role="alert">{error}</p> : null}
      {success ? <p className="successMessage">{success}</p> : null}

      {selectedImport ? <>
        <section className="dispatchImportBar">
          <div className="dispatchFileIdentity"><FileSpreadsheet size={21} /><div><strong>{selectedImport.originalFileName}</strong><span>Imported {selectedImport.uploadedAt}</span></div></div>
          <StatusBadge value={selectedImport.status} />
          {imports.length > 1 ? <label className="dispatchImportPicker"><span>Report</span><select onChange={(event) => setSelectedImportId(event.target.value)} value={selectedImportId}>{imports.map((item) => <option key={item.id} value={item.id}>{item.originalFileName}</option>)}</select></label> : null}
        </section>

        <section className="dispatchMetrics" aria-label="Reconciliation summary">
          <button className={activeStatus === "MATCHED" ? "active" : undefined} onClick={() => setActiveStatus("MATCHED")} type="button"><CheckCircle2 /><span>Matched</span><strong>{selectedImport.matchedCount}</strong></button>
          <button className={activeStatus === "PROGRAMMED_NOT_DISPATCHED" ? "active" : undefined} onClick={() => setActiveStatus("PROGRAMMED_NOT_DISPATCHED")} type="button"><ListX /><span>Not dispatched</span><strong>{selectedImport.programmedNotDispatchedCount}</strong></button>
          <button className={`criticalMetric${activeStatus === "DISPATCHED_NOT_PROGRAMMED" ? " active" : ""}`} onClick={() => setActiveStatus("DISPATCHED_NOT_PROGRAMMED")} type="button"><AlertTriangle /><span>Not programmed</span><strong>{selectedImport.dispatchedNotProgrammedCount}</strong></button>
          <button className={activeStatus === "TRUCK_MISMATCH" ? "active" : undefined} onClick={() => setActiveStatus("TRUCK_MISMATCH")} type="button"><Shuffle /><span>Truck mismatch</span><strong>{selectedImport.truckMismatchCount}</strong></button>
          <button className={activeStatus === "UNKNOWN_TRUCK" ? "active" : undefined} onClick={() => setActiveStatus("UNKNOWN_TRUCK")} type="button"><CircleHelp /><span>Unknown truck</span><strong>{selectedImport.unknownTruckCount}</strong></button>
          <button className={activeStatus === "DUPLICATE_ROW" ? "active" : undefined} onClick={() => setActiveStatus("DUPLICATE_ROW")} type="button"><Copy /><span>Duplicates</span><strong>{selectedImport.duplicateRowCount}</strong></button>
        </section>

        <section className="dataPanel dispatchResults">
          <div className="tableToolbar dispatchToolbar">
            <div><strong>{tabs.find((tab) => tab.id === activeStatus)?.label}</strong><span>{countForStatus(selectedImport, activeStatus)} records</span></div>
            <div className="dispatchTabs" role="tablist" aria-label="Reconciliation result">
              {tabs.map((tab) => <button aria-selected={activeStatus === tab.id} className={activeStatus === tab.id ? "active" : undefined} key={tab.id} onClick={() => setActiveStatus(tab.id)} role="tab" type="button">{tab.label}<span>{countForStatus(selectedImport, tab.id)}</span></button>)}
            </div>
          </div>
          <div className="tableScroll">
            <table className="dataTable dispatchTable">
              <thead><tr><th>Truck and driver</th><th>ATC number</th><th>Loading</th><th>Dispatch detail</th><th>Result</th></tr></thead>
              <tbody>{filteredRecords.map((record) => <tr key={record.id}><td><strong>{record.rawTruckPlate}</strong><span>{record.driverName}</span></td><td><strong>{record.atcNo}</strong><span>{record.sourceRowNumber ? `Spreadsheet row ${record.sourceRowNumber}` : "Programmed queue entry"}</span></td><td><strong>{record.loadingDate}</strong><span>{record.product} | {formatQuantity(record.loadedQuantity)} L</span></td><td><strong>{record.deliveryNo}</strong><span>{record.matchReason}</span></td><td><StatusBadge value={record.matchStatus} /></td></tr>)}</tbody>
            </table>
            {filteredRecords.length === 0 ? <p className="empty">No records in this result.</p> : null}
          </div>
        </section>
      </> : <section className="dispatchEmpty"><FileSpreadsheet size={30} /><h2>No dispatch report</h2><p>Upload the latest refinery dispatch spreadsheet to begin reconciliation.</p></section>}

      {showUpload ? <Dialog onClose={() => { if (!busy) { setShowUpload(false); setFile(null); } }} title="Upload dispatch report">
        <div className="dispatchUploadContext"><FileSpreadsheet size={20} /><div><strong>Excel workbook</strong><span>Maximum file size: 20 MB</span></div></div>
        <label className="fileDrop"><Upload size={24} /><span>{file ? file.name : "Choose .xlsx report"}</span><small>{file ? `${(file.size / 1024).toFixed(1)} KB selected` : "Refinery dispatch workbook"}</small><input accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={(event) => setFile(event.target.files?.[0] ?? null)} type="file" /></label>
        <div className="dialogActions dispatchUploadActions"><button className="secondaryButton" disabled={busy} onClick={() => { setShowUpload(false); setFile(null); }} type="button">Cancel</button><button className="primaryButton commandButton" disabled={!file || busy} onClick={() => void handleUpload()} type="button">{busy ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />}{busy ? "Reconciling..." : "Upload and reconcile"}</button></div>
      </Dialog> : null}
    </>
  );
}
