"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Mail, Pencil, Plus, Search, ShieldCheck, UserRoundCheck, UsersRound } from "lucide-react";
import { USER_ROLES, type UserRole } from "@refinery/types";
import { Dialog, StatusBadge } from "../operations/ui";
import { provisionStaffAccess, resendSetupEmail, saveStaffAccess, subscribeToStaffAccess, type StaffAccessView } from "./api";

type Props = { siteId: string; currentUserId: string };
type FormState = { name: string; email: string; roles: UserRole[]; isActive: boolean };
const emptyForm: FormState = { name: "", email: "", roles: ["fleetOfficer"], isActive: true };
const roleLabel = (role: UserRole) => role.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase());

export function StaffAccessScreen({ siteId, currentUserId }: Props) {
  const [staff, setStaff] = useState<StaffAccessView[]>([]);
  const [queryText, setQueryText] = useState("");
  const [editing, setEditing] = useState<StaffAccessView | null | undefined>(undefined);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => subscribeToStaffAccess(siteId, setStaff, (error) => setMessage(`Unable to load staff access: ${error}`)), [siteId]);
  const visibleStaff = useMemo(() => staff.filter((user) => `${user.name} ${user.email} ${user.roles.join(" ")}`.toLowerCase().includes(queryText.toLowerCase())), [queryText, staff]);
  const openCreate = () => { setForm(emptyForm); setMessage(""); setEditing(null); };
  const openEdit = (user: StaffAccessView) => { setForm({ name: user.name, email: user.email, roles: user.roles, isActive: user.isActive }); setMessage(""); setEditing(user); };
  const toggleRole = (role: UserRole) => setForm((current) => ({ ...current, roles: current.roles.includes(role) ? current.roles.filter((item) => item !== role) : [...current.roles, role] }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (form.roles.length === 0) { setMessage("Choose at least one role."); return; }
    setSaving(true); setMessage("");
    try {
      if (editing) {
        await saveStaffAccess(siteId, editing.id, form);
        setMessage("Staff access updated. The staff member must sign in again to receive the new role.");
      } else {
        await provisionStaffAccess(siteId, { name: form.name, email: form.email, roles: form.roles });
        setMessage("Staff account created and a password-setup email has been sent.");
      }
      setEditing(undefined);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save staff access."); }
    finally { setSaving(false); }
  };

  const resend = async (user: StaffAccessView) => {
    setSaving(true); setMessage("");
    try { await resendSetupEmail(user.email); setMessage(`Password-setup email sent to ${user.name}.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Unable to send the password-setup email."); }
    finally { setSaving(false); }
  };

  return <>
    <header className="pageCommandHeader"><div><p className="eyebrow">Administrator workspace</p><h1>Staff access</h1><p>Provision staff sign-ins, assign operational responsibilities, and deactivate access when a role changes.</p></div><div className="headerActions"><button className="primaryButton commandButton" onClick={openCreate} type="button"><Plus size={17} /> Add staff account</button></div></header>
    {message ? <p className={message.startsWith("Unable") || message.startsWith("Choose") ? "message" : "successMessage"} role="status">{message}</p> : null}
    <section className="truckStatusStrip" aria-label="Staff access summary"><div><UsersRound size={18} /><span>Staff accounts</span><strong>{staff.length}</strong></div><i /><div><UserRoundCheck size={18} /><span>Active access</span><strong>{staff.filter((user) => user.isActive).length}</strong></div><i /><div><ShieldCheck size={18} /><span>Administrators</span><strong>{staff.filter((user) => user.roles.includes("administrator")).length}</strong></div></section>
    <section className="dataPanel truckRegisterPanel"><div className="truckRegisterHeading"><div><span>Access register</span><h2>People with refinery system access</h2><p>Creating an account sends the staff member a password-setup email. Administrators never need to share a password.</p></div><span>{visibleStaff.length} shown</span></div><div className="tableToolbar truckToolbar"><label className="searchField"><Search size={16} /><input aria-label="Search staff" onChange={(event) => setQueryText(event.target.value)} placeholder="Search staff or role" value={queryText} /></label><span className="recordCount">{visibleStaff.length} staff</span></div><div className="tableScroll"><table className="dataTable staffAccessTable"><colgroup><col className="colSubject" /><col className="colWide" /><col className="colStatus" /><col className="colActions" /></colgroup><thead><tr><th>Staff member</th><th>Responsibilities</th><th data-col="status">Access</th><th><span className="visuallyHidden">Actions</span></th></tr></thead><tbody>{visibleStaff.map((user) => <tr key={user.id}><td><strong>{user.name}</strong><span>{user.email}</span></td><td><div className="roleList">{user.roles.map((role) => <span key={role}>{roleLabel(role)}</span>)}</div></td><td data-col="status"><StatusBadge value={user.isActive ? "ACTIVE" : "INACTIVE"} /></td><td data-col="actions"><div className="staffActions"><button aria-label={`Send password setup to ${user.name}`} className="iconButton" disabled={saving} onClick={() => void resend(user)} title="Send password setup email" type="button"><Mail size={16} /></button><button aria-label={`Edit ${user.name}`} className="iconButton" onClick={() => openEdit(user)} title="Edit staff access" type="button"><Pencil size={16} /></button></div></td></tr>)}</tbody></table></div></section>
    {editing !== undefined ? <Dialog onClose={() => setEditing(undefined)} title={editing ? "Edit staff access" : "Add staff account"} size="wide"><form className="formGrid" onSubmit={submit}><label><span>Full name</span><input onChange={(event) => setForm({ ...form, name: event.target.value })} required value={form.name} /></label><label><span>Work email</span><input disabled={Boolean(editing)} onChange={(event) => setForm({ ...form, email: event.target.value })} required type="email" value={form.email} /></label><fieldset className="roleField fullField"><legend>Responsibilities</legend><div>{USER_ROLES.map((role) => <label className="checkboxField" key={role}><input checked={form.roles.includes(role)} onChange={() => toggleRole(role)} type="checkbox" /><span>{roleLabel(role)}</span></label>)}</div></fieldset>{editing ? <label className="checkboxField"><input checked={form.isActive} disabled={editing.id === currentUserId} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} type="checkbox" /><span>{editing.id === currentUserId ? "Your administrator access cannot be deactivated here" : "Active access"}</span></label> : null}<div className="dialogActions fullField"><button className="secondaryButton" onClick={() => setEditing(undefined)} type="button">Cancel</button><button className="primaryButton" disabled={saving} type="submit">{saving ? "Saving..." : editing ? "Save access" : "Create account"}</button></div></form></Dialog> : null}
  </>;
}
