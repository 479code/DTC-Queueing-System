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

export type BypassRequestView = {
  id: string;
  siteId: string;
  truckId: string;
  queueCycleId: string;
  truckRegistration: string;
  driverName: string;
  requestedByName: string;
  queuePosition: number;
  trucksAhead: number;
  reasonCategory: string;
  explanation: string;
  requestedAt: string;
  status: "PENDING";
};

export type ApprovedBypass = {
  bypassRequestId: string;
  authorizationId: string;
  expiresAt: string;
  truckId: string;
};

export const demoBypassRequests: BypassRequestView[] = [
  {
    id: "BR-00481",
    siteId: "default-site",
    truckId: "truck-fze-919",
    queueCycleId: "cycle-fze-919",
    truckRegistration: "FZE 919 DI",
    driverName: "Ibrahim Musa",
    requestedByName: "Officer A",
    queuePosition: 37,
    trucksAhead: 36,
    reasonCategory: "OPERATIONAL_REQUIREMENT",
    explanation:
      "Destination-specific priority movement requested by operations.",
    requestedAt: "08 Sep 07:42",
    status: "PENDING"
  },
  {
    id: "BR-00482",
    siteId: "default-site",
    truckId: "truck-ksf-204",
    queueCycleId: "cycle-ksf-204",
    truckRegistration: "KSF 204 XY",
    driverName: "Chinedu Okafor",
    requestedByName: "Officer C",
    queuePosition: 22,
    trucksAhead: 21,
    reasonCategory: "CUSTOMER_REQUIREMENT",
    explanation:
      "Customer delivery window closes before the next standard loading cycle.",
    requestedAt: "08 Sep 08:16",
    status: "PENDING"
  },
  {
    id: "BR-00483",
    siteId: "default-site",
    truckId: "truck-lsr-718",
    queueCycleId: "cycle-lsr-718",
    truckRegistration: "LSR 718 XX",
    driverName: "Tunde Balogun",
    requestedByName: "Officer B",
    queuePosition: 14,
    trucksAhead: 13,
    reasonCategory: "EMERGENCY_MOVEMENT",
    explanation:
      "Emergency replenishment requested for a destination reporting critical stock.",
    requestedAt: "08 Sep 08:31",
    status: "PENDING"
  }
];

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
): Promise<BypassRequestView> {
  if (!db) {
    throw new Error("Firebase is not configured.");
  }

  const data = requestDoc.data();
  const truckId = String(data.truckId);
  const requestedBy = String(data.requestedBy);
  const truckSnap = await getDoc(doc(db, "sites", siteId, "trucks", truckId));
  const truck = truckSnap.data() ?? {};
  const queuePosition = Number(data.queuePositionAtRequest ?? 0);

  return {
    id: requestDoc.id,
    siteId,
    truckId,
    queueCycleId: String(data.queueCycleId),
    truckRegistration: String(truck.registrationNumber ?? truckId),
    driverName: String(truck.driverName ?? "Driver not recorded"),
    requestedByName: String(
      data.requestedByName ?? truck.assignedFleetOfficerName ?? requestedBy
    ),
    queuePosition,
    trucksAhead: Number(data.numberOfTrucksBypassed ?? queuePosition - 1),
    reasonCategory: formatReason(String(data.reasonCategory ?? "OTHER")),
    explanation: String(data.explanation ?? ""),
    requestedAt: formatTimestamp(data.requestedAt),
    status: "PENDING"
  };
}

export async function getFirebaseSession(): Promise<{
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
  onRequests: (requests: BypassRequestView[]) => void,
  onError: (message: string) => void
): Unsubscribe {
  if (!db) {
    onRequests(demoBypassRequests);
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

export async function approveBypassRequest(
  request: BypassRequestView
): Promise<ApprovedBypass> {
  if (!functions || !auth?.currentUser) {
    return {
      bypassRequestId: request.id,
      authorizationId: "AUTH-DEMO-481",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      truckId: request.truckId
    };
  }

  return callOperationalApi<{ siteId: string; bypassRequestId: string }, ApprovedBypass>("approveBypass", {
    siteId: request.siteId,
    bypassRequestId: request.id
  });
}

export async function rejectBypassRequest(
  request: BypassRequestView,
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
