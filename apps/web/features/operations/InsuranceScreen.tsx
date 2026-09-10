"use client";

import { useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, CalendarClock, ShieldCheck } from "lucide-react";
import { updateInsurance, type TruckView } from "./api";
import { Dialog, StatusBadge } from "./ui";

type Props = {
  siteId: string;
  trucks: TruckView[];
  demoMode: boolean;
  onTrucksChange: (trucks: TruckView[]) => void;
};

export function InsuranceScreen({ siteId, trucks, demoMode, onTrucksChange }: Props) {
  const [selected, setSelected] = useState<TruckView | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ policyNumber: "", provider: "", effectiveDate: "", expiryDate: "" });

  const attention = useMemo(() => trucks.filter((truck) => ["EXPIRED", "EXPIRING_SOON", "UNKNOWN"].includes(truck.insuranceStatus)), [trucks]);
  const expired = trucks.filter((truck) => truck.insuranceStatus === "EXPIRED").length;
  const expiring = trucks.filter((truck) => truck.insuranceStatus === "EXPIRING_SOON").length;

  const openRenewal = (truck: TruckView) => {
    setSelected(truck);
    setMessage("");
    setForm({ policyNumber: "", provider: "", effectiveDate: new Date().toISOString().slice(0, 10), expiryDate: "" });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setMessage("");
    try {
      const result = await updateInsurance({ siteId, truckId: selected.id, ...form });
      if (demoMode) {
        onTrucksChange(trucks.map((truck) => truck.id === selected.id ? {
          ...truck,
          insuranceStatus: result.status,
          insuranceExpiry: new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(form.expiryDate)),
          currentStatus: result.queueReentered && truck.currentStatus === "INSURANCE_HOLD" ? "QUEUED" : truck.currentStatus
        } : truck));
      }
      setSelected(null);
      setMessage(result.queueReentered ? "Insurance restored. The truck re-entered the queue with a new timestamp." : "Insurance record added.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update insurance.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <header className="pageHeader"><div><h1>Insurance</h1><p>Eligibility controls for every truck entering or remaining in the queue.</p></div></header>
      {message ? <p className="successMessage" role="status">{message}</p> : null}
      <div className="metricStrip">
        <div><ShieldCheck size={18} /><span>Valid</span><strong>{trucks.filter((truck) => truck.insuranceStatus === "VALID").length}</strong></div>
        <div><CalendarClock size={18} /><span>Expiring soon</span><strong>{expiring}</strong></div>
        <div className="criticalMetric"><AlertTriangle size={18} /><span>Expired</span><strong>{expired}</strong></div>
      </div>
      <section className="dataPanel">
        <div className="panelTitle"><div><h2>Insurance attention</h2><p>Renewals create a new historical record; previous policies remain unchanged.</p></div><span className="recordCount">{attention.length} require attention</span></div>
        <div className="tableScroll">
          <table className="dataTable">
            <thead><tr><th>Truck</th><th>Driver</th><th>Fleet officer</th><th>Expiry</th><th>Insurance</th><th>Queue state</th><th><span className="visuallyHidden">Action</span></th></tr></thead>
            <tbody>{trucks.map((truck) => (
              <tr key={truck.id}>
                <td><strong>{truck.registrationNumber}</strong><span>{truck.internalCode}</span></td>
                <td>{truck.driverName}</td><td>{truck.fleetOfficerName}</td><td>{truck.insuranceExpiry}</td>
                <td><StatusBadge value={truck.insuranceStatus} /></td><td><StatusBadge value={truck.currentStatus} /></td>
                <td><button className="textButton" onClick={() => openRenewal(truck)} type="button">Update</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
      {selected ? (
        <Dialog onClose={() => setSelected(null)} title={`Update insurance: ${selected.registrationNumber}`}>
          <div className="policyContext"><strong>{selected.driverName}</strong><span>Current status: {selected.insuranceStatus.replaceAll("_", " ")}</span></div>
          <form className="formGrid" onSubmit={submit}>
            <label><span>Policy number</span><input onChange={(event) => setForm({ ...form, policyNumber: event.target.value })} required value={form.policyNumber} /></label>
            <label><span>Provider</span><input onChange={(event) => setForm({ ...form, provider: event.target.value })} required value={form.provider} /></label>
            <label><span>Effective date</span><input onChange={(event) => setForm({ ...form, effectiveDate: event.target.value })} required type="date" value={form.effectiveDate} /></label>
            <label><span>Expiry date</span><input onChange={(event) => setForm({ ...form, expiryDate: event.target.value })} required type="date" value={form.expiryDate} /></label>
            <p className="formNotice fullField"><AlertTriangle size={16} /> Restoring valid insurance to a held truck gives it a new queue-entry timestamp.</p>
            <div className="dialogActions fullField"><button className="secondaryButton" onClick={() => setSelected(null)} type="button">Cancel</button><button className="primaryButton" disabled={saving} type="submit">{saving ? "Updating..." : "Add insurance record"}</button></div>
          </form>
        </Dialog>
      ) : null}
    </>
  );
}
