import { collection, onSnapshot, orderBy, query, type DocumentData, type QueryDocumentSnapshot, type Unsubscribe } from "firebase/firestore";
import { sendPasswordResetEmail } from "firebase/auth";
import type { UserRole } from "@refinery/types";
import { auth, db } from "../../firebase/client";
import { callOperationalApi } from "../../firebase/operations";

export type StaffAccessView = { id: string; name: string; email: string; roles: UserRole[]; isActive: boolean; mfaRequired: boolean };
type StaffAccessInput = { name: string; email: string; roles: UserRole[]; isActive: boolean; mfaRequired: boolean };

function mapStaffUser(snapshot: QueryDocumentSnapshot<DocumentData>): StaffAccessView {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    name: String(data.name ?? "Staff member"),
    email: String(data.email ?? ""),
    roles: Array.isArray(data.roles) ? data.roles.filter((role): role is UserRole => typeof role === "string") : [],
    isActive: data.isActive === true,
    mfaRequired: data.mfaRequired === true
  };
}

export function subscribeToStaffAccess(siteId: string, onData: (users: StaffAccessView[]) => void, onError: (message: string) => void): Unsubscribe {
  if (!db) { onData([]); return () => undefined; }
  return onSnapshot(query(collection(db, "sites", siteId, "users"), orderBy("name", "asc")), (snapshot) => onData(snapshot.docs.map(mapStaffUser)), (error) => onError(error.message));
}

export async function provisionStaffAccess(siteId: string, input: Omit<StaffAccessInput, "isActive">): Promise<void> {
  await callOperationalApi("provisionUser", { siteId, ...input });
  if (!auth) throw new Error("Firebase Authentication is not configured.");
  await sendPasswordResetEmail(auth, input.email);
}

export async function saveStaffAccess(siteId: string, userId: string, input: StaffAccessInput): Promise<void> {
  await callOperationalApi("setUserAccess", { siteId, userId, ...input });
}

export async function resendSetupEmail(email: string): Promise<void> {
  if (!auth) throw new Error("Firebase Authentication is not configured.");
  await sendPasswordResetEmail(auth, email);
}
