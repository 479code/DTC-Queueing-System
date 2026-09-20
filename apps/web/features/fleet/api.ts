import { collection, onSnapshot, query, where, type Unsubscribe } from "firebase/firestore";
import { auth, db, functions } from "../../firebase/client";
import { callOperationalApi } from "../../firebase/operations";
import type { InsuranceStatus, TruckStatus } from "../operations/api";

export async function reportFleetReturn(input: { siteId: string; truckId: string; insuranceStatus: InsuranceStatus }): Promise<{
  cycleId: string;
  status: Extract<TruckStatus, "QUEUED" | "INSURANCE_HOLD">;
}> {
  if (!functions || !auth?.currentUser) {
    return {
      cycleId: `cycle-demo-${input.truckId}`,
      status: input.insuranceStatus === "VALID" || input.insuranceStatus === "EXPIRING_SOON" ? "QUEUED" : "INSURANCE_HOLD"
    };
  }

  return callOperationalApi<{ siteId: string; truckId: string }, { cycleId: string; status: Extract<TruckStatus, "QUEUED" | "INSURANCE_HOLD"> }>("reportTruckReturn", { siteId: input.siteId, truckId: input.truckId });
}

export async function requestFleetBypass(input: {
  siteId: string;
  truckId: string;
  queueCycleId: string;
  reasonCategory: string;
  explanation: string;
}): Promise<{ bypassRequestId: string; queuePositionAtRequest: number; numberOfTrucksBypassed: number }> {
  if (!functions || !auth?.currentUser) {
    return { bypassRequestId: "BR-DEMO-NEW", queuePositionAtRequest: 7, numberOfTrucksBypassed: 6 };
  }

  return callOperationalApi<typeof input, { bypassRequestId: string; queuePositionAtRequest: number; numberOfTrucksBypassed: number }>("requestBypass", input);
}

export type MyBypassRequest = {
  id: string;
  truckId: string;
  status: string;
  reasonCategory: string;
  requestedAt: string;
  requestedAtMillis: number;
  rejectionReason?: string;
};

function requestTime(value: unknown): { text: string; millis: number } {
  if (typeof value === "object" && value !== null && "toDate" in value && typeof value.toDate === "function") {
    const date = (value as { toDate: () => Date }).toDate();
    return {
      text: new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date),
      millis: date.getTime()
    };
  }
  return { text: "Not recorded", millis: 0 };
}

// A fleet officer must be able to see what happened to a request they made,
// including why an overseer rejected it.
export function subscribeToMyBypassRequests(
  siteId: string,
  userId: string,
  onData: (requests: MyBypassRequest[]) => void
): Unsubscribe {
  if (!db || !userId) {
    onData([]);
    return () => undefined;
  }
  return onSnapshot(
    query(collection(db, "sites", siteId, "bypassRequests"), where("fleetOfficerId", "==", userId)),
    (snapshot) => onData(snapshot.docs.map((item) => {
      const data = item.data();
      const when = requestTime(data.requestedAt);
      return {
        id: item.id,
        truckId: String(data.truckId ?? ""),
        status: String(data.status ?? "PENDING"),
        reasonCategory: String(data.reasonCategory ?? ""),
        requestedAt: when.text,
        requestedAtMillis: when.millis,
        rejectionReason: typeof data.rejectionReason === "string" ? data.rejectionReason : undefined
      };
    }).sort((left, right) => right.requestedAtMillis - left.requestedAtMillis).slice(0, 8)),
    () => onData([])
  );
}

export type IssuedBypassCode = {
  id: string;
  truckId: string;
  otp: string;
  title: string;
  body: string;
};

// The approved code is delivered to the assigned officer's own notification,
// which only they can read, so no one has to relay it by hand.
export function subscribeToIssuedBypassCodes(
  siteId: string,
  userId: string,
  onData: (codes: IssuedBypassCode[]) => void
): Unsubscribe {
  if (!db || !userId) {
    onData([]);
    return () => undefined;
  }
  return onSnapshot(
    query(collection(db, "sites", siteId, "notifications"), where("userId", "==", userId), where("type", "==", "BYPASS_APPROVED")),
    (snapshot) => onData(snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() } as Record<string, unknown> & { id: string }))
      .filter((item) => typeof item.otp === "string" && item.otp)
      .map((item) => ({
        id: item.id,
        truckId: String(item.truckId ?? ""),
        otp: String(item.otp),
        title: String(item.title ?? "Bypass approved"),
        body: String(item.body ?? "")
      }))),
    () => onData([])
  );
}

export async function validateFleetBypassOtp(input: {
  siteId: string;
  truckId: string;
  otp: string;
}): Promise<{ authorizationId: string; status: "VALIDATED"; expiresAt: string }> {
  if (!functions || !auth?.currentUser) {
    if (input.otp !== "482193") throw new Error("Incorrect bypass code. Use the code provided by the approving overseer.");
    return { authorizationId: "AUTH-DEMO-919", status: "VALIDATED", expiresAt: new Date(Date.now() + 600000).toISOString() };
  }

  return callOperationalApi<typeof input, { authorizationId: string; status: "VALIDATED"; expiresAt: string }>("validateBypassOtp", input);
}
