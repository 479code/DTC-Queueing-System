"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { Download, FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";
import { batchSaveTrucks, type FleetOfficerOption, type TruckView } from "./api";
import { parseBatchTruckCsv, type BatchTruckRow } from "./batchCsv";
import { Dialog } from "./ui";

type Props = {
  siteId: string;
  officers: FleetOfficerOption[];
  demoMode: boolean;
  onClose: () => void;
  onComplete: (createdCount: number, demoTrucks: TruckView[]) => void;
};

export function BatchTruckDialog({
  siteId,
  officers,
  demoMode,
  onClose,
  onComplete
}: Props) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<BatchTruckRow[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const invalidCount = useMemo(
    () => rows.filter((row) => row.errors.length > 0).length,
    [rows]
  );

  const downloadTemplate = () => {
    const blob = new Blob(
      ["Registration number,Driver name,Fleet officer\r\n"],
      { type: "text/csv;charset=utf-8" }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "truck-batch-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setFileName(file.name);
    try {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        throw new Error("Choose a CSV file created from the batch template.");
      }
      setRows(parseBatchTruckCsv(await file.text(), officers));
    } catch (caught) {
      setRows([]);
      setError(caught instanceof Error ? caught.message : "Unable to read this CSV file.");
    }
  };

  const submit = async () => {
    if (rows.length === 0 || invalidCount > 0) return;
    setSaving(true);
    setError("");
    try {
      const result = await batchSaveTrucks({
        siteId,
        trucks: rows.map((row) => ({
          registrationNumber: row.registrationNumber,
          driverName: row.driverName,
          assignedFleetOfficerId: row.assignedFleetOfficerId
        }))
      });
      const demoTrucks = demoMode
        ? rows.map((row, index) => ({
            id: result.trucks[index]!.truckId,
            internalCode: result.trucks[index]!.internalCode,
            registrationNumber: result.trucks[index]!.registrationNumber,
            driverName: row.driverName,
            assignedFleetOfficerId: row.assignedFleetOfficerId,
            fleetOfficerName: row.fleetOfficerName,
            currentStatus: "ON_TRIP" as const,
            insuranceStatus: "UNKNOWN" as const,
            insuranceExpiry: "Not recorded",
            isActive: true
          }))
        : [];
      onComplete(result.createdCount, demoTrucks);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to add this truck batch.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog onClose={onClose} size="wide" title="Batch add trucks">
      <div className="batchIntro">
        <div><h3>Upload truck list</h3><p>Use the template so fleet-officer names can be matched correctly.</p></div>
        <button className="secondaryButton commandButton" onClick={downloadTemplate} type="button"><Download size={16} /> Download template</button>
      </div>
      <label className="fileDrop">
        <FileSpreadsheet size={24} />
        <span>{fileName || "Choose a completed CSV file"}</span>
        <small>Maximum 100 trucks per batch</small>
        <input accept=".csv,text/csv" onChange={readFile} type="file" />
      </label>
      {error ? <p className="message batchMessage" role="alert">{error}</p> : null}
      {rows.length > 0 ? (
        <div className="batchPreview">
          <div className="batchSummary"><strong>{rows.length} trucks</strong><span className={invalidCount ? "invalidSummary" : "validSummary"}>{invalidCount ? `${invalidCount} rows need attention` : "Ready to add"}</span></div>
          <div className="tableScroll"><table className="dataTable batchTable"><thead><tr><th>Row</th><th>Registration</th><th>Driver</th><th>Fleet officer</th><th>Validation</th></tr></thead><tbody>{rows.map((row) => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td><strong>{row.registrationNumber || "Missing"}</strong></td><td>{row.driverName || "Missing"}</td><td>{row.fleetOfficerName || "Missing"}</td><td><span className={row.errors.length ? "rowError" : "rowValid"}>{row.errors.join("; ") || "Valid"}</span></td></tr>)}</tbody></table></div>
        </div>
      ) : null}
      <div className="dialogActions batchActions"><button className="secondaryButton" onClick={onClose} type="button">Cancel</button><button className="primaryButton commandButton" disabled={saving || rows.length === 0 || invalidCount > 0} onClick={() => void submit()} type="button">{saving ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />}{saving ? "Adding trucks..." : `Add ${rows.length || ""} trucks`}</button></div>
    </Dialog>
  );
}
