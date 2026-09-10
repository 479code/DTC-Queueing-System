"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { FilePlus2, Pencil, Plus, Search } from "lucide-react";
import {
  saveTruck,
  type FleetOfficerOption,
  type TruckView
} from "./api";
import { Dialog, StatusBadge } from "./ui";
import { BatchTruckDialog } from "./BatchTruckDialog";

type Props = {
  siteId: string;
  trucks: TruckView[];
  officers: FleetOfficerOption[];
  demoMode: boolean;
  onTrucksChange: (trucks: TruckView[]) => void;
};

const emptyForm = {
  registrationNumber: "",
  driverName: "",
  assignedFleetOfficerId: "",
  isActive: true
};

export function TrucksScreen({
  siteId,
  trucks,
  officers,
  demoMode,
  onTrucksChange
}: Props) {
  const [queryText, setQueryText] = useState("");
  const [status, setStatus] = useState("ALL");
  const [editing, setEditing] = useState<TruckView | null | undefined>(undefined);
  const [batchOpen, setBatchOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!form.assignedFleetOfficerId && officers[0]) {
      setForm((current) => ({
        ...current,
        assignedFleetOfficerId: officers[0]!.id
      }));
    }
  }, [form.assignedFleetOfficerId, officers]);

  const filtered = useMemo(
    () =>
      trucks.filter((truck) => {
        const matchesText = `${truck.registrationNumber} ${truck.driverName} ${truck.internalCode}`
          .toLowerCase()
          .includes(queryText.toLowerCase());
        return matchesText && (status === "ALL" || truck.currentStatus === status);
      }),
    [queryText, status, trucks]
  );

  const openForm = (truck?: TruckView) => {
    setEditing(truck ?? null);
    setMessage("");
    setForm(
      truck
        ? {
            registrationNumber: truck.registrationNumber,
            driverName: truck.driverName,
            assignedFleetOfficerId: truck.assignedFleetOfficerId,
            isActive: truck.isActive
          }
        : {
            ...emptyForm,
            assignedFleetOfficerId: officers[0]?.id ?? ""
          }
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const result = await saveTruck({ siteId, truckId: editing?.id, ...form });
      if (demoMode) {
        const officer = officers.find(
          (item) => item.id === form.assignedFleetOfficerId
        );
        const updated: TruckView = {
          id: result.truckId,
          ...form,
          internalCode: editing?.internalCode ?? result.internalCode,
          registrationNumber: form.registrationNumber.toUpperCase(),
          fleetOfficerName: officer?.name ?? form.assignedFleetOfficerId,
          currentStatus: editing?.currentStatus ?? "ON_TRIP",
          insuranceStatus: editing?.insuranceStatus ?? "UNKNOWN",
          insuranceExpiry: editing?.insuranceExpiry ?? "Not recorded"
        };
        onTrucksChange(
          editing
            ? trucks.map((item) => (item.id === editing.id ? updated : item))
            : [...trucks, updated]
        );
      }
      setEditing(undefined);
      setMessage(result.created ? "Truck added to the registry." : "Truck details updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save truck.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <header className="pageHeader">
        <div>
          <h1>Trucks</h1>
          <p>Truck identity, driver, assignment, and operating status.</p>
        </div>
        <div className="headerActions">
          <button className="secondaryButton commandButton" onClick={() => { setMessage(""); setBatchOpen(true); }} type="button"><FilePlus2 size={17} /> Batch add</button>
          <button className="primaryButton commandButton" onClick={() => openForm()} type="button"><Plus size={17} /> Add truck</button>
        </div>
      </header>

      {message ? <p className="successMessage" role="status">{message}</p> : null}

      <section className="dataPanel">
        <div className="tableToolbar">
          <label className="searchField">
            <Search size={16} />
            <input aria-label="Search trucks" onChange={(event) => setQueryText(event.target.value)} placeholder="Search truck, driver, or code" value={queryText} />
          </label>
          <select aria-label="Filter by status" onChange={(event) => setStatus(event.target.value)} value={status}>
            <option value="ALL">All statuses</option>
            <option value="ON_TRIP">On trip</option>
            <option value="QUEUED">Queued</option>
            <option value="PROGRAMMED">Programmed</option>
            <option value="INSURANCE_HOLD">Insurance hold</option>
          </select>
          <span className="recordCount">{filtered.length} trucks</span>
        </div>
        <div className="tableScroll">
          <table className="dataTable">
            <thead><tr><th>Truck</th><th>Driver</th><th>Fleet officer</th><th>Status</th><th>Insurance</th><th><span className="visuallyHidden">Actions</span></th></tr></thead>
            <tbody>
              {filtered.map((truck) => (
                <tr key={truck.id}>
                  <td><strong>{truck.registrationNumber}</strong><span>{truck.internalCode}</span></td>
                  <td>{truck.driverName}</td>
                  <td>{truck.fleetOfficerName}</td>
                  <td><StatusBadge value={truck.currentStatus} /></td>
                  <td><StatusBadge value={truck.insuranceStatus} /><span>{truck.insuranceExpiry}</span></td>
                  <td><button aria-label={`Edit ${truck.registrationNumber}`} className="iconButton" onClick={() => openForm(truck)} title="Edit truck" type="button"><Pencil size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editing !== undefined ? (
        <Dialog onClose={() => setEditing(undefined)} title={editing ? "Edit truck" : "Add truck"}>
          <form className="formGrid" onSubmit={submit}>
            <label className="fullField"><span>Registration number</span><input onChange={(event) => setForm({ ...form, registrationNumber: event.target.value })} required value={form.registrationNumber} /></label>
            <label className="fullField"><span>Driver name</span><input onChange={(event) => setForm({ ...form, driverName: event.target.value })} required value={form.driverName} /></label>
            <label className="fullField"><span>Fleet officer</span><select onChange={(event) => setForm({ ...form, assignedFleetOfficerId: event.target.value })} required value={form.assignedFleetOfficerId}>{officers.map((officer) => <option key={officer.id} value={officer.id}>{officer.name}</option>)}</select></label>
            <label className="checkboxField fullField"><input checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} type="checkbox" /><span>Active truck</span></label>
            <div className="dialogActions fullField"><button className="secondaryButton" onClick={() => setEditing(undefined)} type="button">Cancel</button><button className="primaryButton" disabled={saving} type="submit">{saving ? "Saving..." : "Save truck"}</button></div>
          </form>
        </Dialog>
      ) : null}

      {batchOpen ? (
        <BatchTruckDialog
          demoMode={demoMode}
          officers={officers}
          onClose={() => setBatchOpen(false)}
          onComplete={(createdCount, demoTrucks) => {
            if (demoMode) onTrucksChange([...trucks, ...demoTrucks]);
            setBatchOpen(false);
            setMessage(`${createdCount} trucks added to the registry.`);
          }}
          siteId={siteId}
        />
      ) : null}
    </>
  );
}
