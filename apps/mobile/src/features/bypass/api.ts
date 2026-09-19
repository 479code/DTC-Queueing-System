import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe
} from "firebase/firestore";
import { auth, db, functions } from "../../firebase/client";
import { callOperationalApi } from "../../firebase/operations";

export type BypassRequestSummary = {
  id: string;
  siteId: string;
  truckId: string;
  queueCycleId: string;
  registrationNumber: string;
  driverName: string;
  requestedByName: string;
  queuePosition: number;
  trucksAhead: number;
  reasonCategory: string;
  explanation: string;
  requestedAt: string;
};

export type ApprovedBypass = {
  bypassRequestId: string;
  authorizationId: string;
  otp: string;
  expiresAt: string;
  truckId: string;
};

export const demoRequest: BypassRequestSummary = {
  id: "BR-00481",
  siteId: "default-site",
  truckId: "truck-fze-919",
  queueCycleId: "cycle-fze-919",
  registrationNumber: "FZE 919 DI",
  driverName: "Ibrahim Musa",
  requestedByName: "Officer A",
  queuePosition: 37,
  trucksAhead: 36,
  reasonCategory: "Operational Requirement",
  explanation:
    "Destination-specific priority movement requested by operations.",
  requestedAt: "08 Sep 07:42"
};

function formatReason(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatTimestamp(value: unknown): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(value.toDate());
  }

  return "Pending";
}

async function hydrateRequest(
  siteId: string,
  requestDoc: QueryDocumentSnapshot<DocumentData>
): Promise<BypassRequestSummary> {
  if (!db) {
    throw new Error("Firebase is not configured.");
  }

  const data = requestDoc.data();
  const truckId = String(data.truckId);
  const requestedBy = String(data.requestedBy);
  const [truckSnap, userSnap] = await Promise.all([
    getDoc(doc(db, "sites", siteId, "trucks", truckId)),
    getDoc(doc(db, "sites", siteId, "users", requestedBy))
  ]);
  const truck = truckSnap.data() ?? {};
  const user = userSnap.data() ?? {};
  const queuePosition = Number(data.queuePositionAtRequest ?? 0);

  return {
    id: requestDoc.id,
    siteId,
    truckId,
    queueCycleId: String(data.queueCycleId),
    registrationNumber: String(truck.registrationNumber ?? truckId),
    driverName: String(truck.driverName ?? "Driver not recorded"),
    requestedByName: String(user.name ?? requestedBy),
    queuePosition,
    trucksAhead: Number(data.numberOfTrucksBypassed ?? queuePosition - 1),
    reasonCategory: formatReason(String(data.reasonCategory ?? "OTHER")),
    explanation: String(data.explanation ?? ""),
    requestedAt: formatTimestamp(data.requestedAt)
  };
}

export async function getSession(): Promise<{
  siteId: string;
  userId: string;
  roles: string[];
} | null> {
  const user = auth?.currentUser;

  if (!user) {
    return null;
  }

  const token = await user.getIdTokenResult(true);
  const siteId = token.claims.siteId;
  const roles = token.claims.roles;

  if (typeof siteId !== "string" || !Array.isArray(roles)) {
    return null;
  }

  return {
    siteId,
    userId: user.uid,
    roles: roles.filter((role): role is string => typeof role === "string")
  };
}

export function subscribeToPendingBypasses(
  siteId: string,
  onRequests: (requests: BypassRequestSummary[]) => void,
  onError: (message: string) => void
): Unsubscribe {
  if (!db) {
    onRequests([demoRequest]);
    return () => undefined;
  }

  const requestsQuery = query(
    collection(db, "sites", siteId, "bypassRequests"),
    where("status", "==", "PENDING"),
    orderBy("requestedAt", "desc")
  );

  return onSnapshot(
    requestsQuery,
    (snapshot) => {
      void Promise.all(
        snapshot.docs.map((requestDoc) => hydrateRequest(siteId, requestDoc))
      )
        .then(onRequests)
        .catch((error: unknown) => {
          onError(error instanceof Error ? error.message : "Unable to load requests.");
        });
    },
    (error) => onError(error.message)
  );
}

export async function requestBypass(input: {
  siteId: string;
  truckId: string;
  queueCycleId: string;
  reasonCategory: string;
  explanation: string;
}): Promise<{
  bypassRequestId: string;
  queuePositionAtRequest: number;
  numberOfTrucksBypassed: number;
  status: "PENDING";
}> {
  if (!functions || !auth?.currentUser) {
    return {
      bypassRequestId: "BR-DEMO-NEW",
      queuePositionAtRequest: 7,
      numberOfTrucksBypassed: 6,
      status: "PENDING"
    };
  }

  return callOperationalApi<typeof input, {
    bypassRequestId: string;
    queuePositionAtRequest: number;
    numberOfTrucksBypassed: number;
    status: "PENDING";
  }>("requestBypass", input);
}

export async function approveBypass(
  request: BypassRequestSummary
): Promise<ApprovedBypass> {
  if (!functions || !auth?.currentUser) {
    return {
      bypassRequestId: request.id,
      authorizationId: "AUTH-DEMO-481",
      otp: "482193",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      truckId: request.truckId
    };
  }

  return callOperationalApi<{ siteId: string; bypassRequestId: string }, ApprovedBypass>("approveBypass", {
    siteId: request.siteId,
    bypassRequestId: request.id
  });
}

export async function rejectBypass(
  request: BypassRequestSummary,
  rejectionReason: string
): Promise<void> {
  if (!functions || !auth?.currentUser) {
    return;
  }

  await callOperationalApi("rejectBypass", {
    siteId: request.siteId,
    bypassRequestId: request.id,
    rejectionReason
  });
}

export async function validateBypassOtp(input: {
  siteId: string;
  truckId: string;
  otp: string;
}): Promise<{
  authorizationId: string;
  status: "VALIDATED";
  expiresAt: string;
}> {
  if (!functions || !auth?.currentUser) {
    if (input.otp !== "482193") {
      throw new Error("Incorrect bypass code.");
    }

    return {
      authorizationId: "AUTH-DEMO-481",
      status: "VALIDATED",
      expiresAt: new Date(Date.now() + 8 * 60 * 1000).toISOString()
    };
  }

  return callOperationalApi<typeof input, {
    authorizationId: string;
    status: "VALIDATED";
    expiresAt: string;
  }>("validateBypassOtp", input);
}
