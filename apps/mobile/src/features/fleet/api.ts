import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { auth, db, functions } from "../../firebase/client";
import { callOperationalApi } from "../../firebase/operations";
import { getSession } from "../bypass/api";

export type MobileTruck = {
  id: string;
  registrationNumber: string;
  driverName: string;
  currentStatus: "ON_TRIP" | "QUEUED" | "AWAITING_AVAILABILITY" | "READY_FOR_PROGRAMMING" | "AWAITING_REPLACEMENT" | "PROGRAMMED" | "INSURANCE_HOLD" | "INACTIVE";
  insuranceStatus: "VALID" | "EXPIRING_SOON" | "EXPIRED" | "UNKNOWN";
  insuranceExpiry: string;
  availabilityBatchId?: string;
  availabilityQueueCycleId?: string;
};

export type MobileQueueEntry = {
  id: string;
  truckId: string;
  registrationNumber: string;
  driverName: string;
  position: number;
  queueEnteredAt: string;
};

export type FleetHome = {
  siteId: string;
  roles: string[];
  trucks: MobileTruck[];
  queue: MobileQueueEntry[];
};

export const demoFleetHome: FleetHome = {
  siteId: "default-site",
  roles: ["fleetOfficer"],
  trucks: [
    { id: "truck-fze-481", registrationNumber: "FZE 481 DI", driverName: "Musa Abdullahi", currentStatus: "QUEUED", insuranceStatus: "VALID", insuranceExpiry: "18 Dec 2026" },
    { id: "truck-abu-302", registrationNumber: "ABU 302 LM", driverName: "Bello Garba", currentStatus: "ON_TRIP", insuranceStatus: "VALID", insuranceExpiry: "08 Feb 2027" },
    { id: "truck-fze-919", registrationNumber: "FZE 919 DI", driverName: "Ibrahim Musa", currentStatus: "QUEUED", insuranceStatus: "VALID", insuranceExpiry: "02 Mar 2027" },
    { id: "truck-rsh-883", registrationNumber: "RSH 883 NV", driverName: "Yusuf Danjuma", currentStatus: "PROGRAMMED", insuranceStatus: "VALID", insuranceExpiry: "06 Nov 2026" }
  ],
  queue: [
    { id: "cycle-fze-481", truckId: "truck-fze-481", registrationNumber: "FZE 481 DI", driverName: "Musa Abdullahi", position: 1, queueEnteredAt: "08 Sep 06:54" },
    { id: "cycle-fze-919", truckId: "truck-fze-919", registrationNumber: "FZE 919 DI", driverName: "Ibrahim Musa", position: 10, queueEnteredAt: "08 Sep 14:42" }
  ]
};

function formatTimestamp(value: unknown): string {
  if (typeof value === "object" && value !== null && "toDate" in value && typeof value.toDate === "function") {
    return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(value.toDate());
  }
  return "Not recorded";
}

async function getQueuePosition(siteId: string, queueCycleId: string): Promise<number> {
  if (!functions || !auth?.currentUser) return demoFleetHome.queue.find((entry) => entry.id === queueCycleId)?.position ?? 0;
  return (await callOperationalApi<{ siteId: string; queueCycleId: string }, { position: number }>("getQueuePosition", { siteId, queueCycleId })).position;
}

export async function loadFleetHome(): Promise<FleetHome> {
  const session = await getSession();
  const firestore = db;
  if (!session || !firestore) return demoFleetHome;

  const [truckSnapshot, cycleSnapshot] = await Promise.all([
    getDocs(query(collection(firestore, "sites", session.siteId, "trucks"), where("assignedFleetOfficerId", "==", session.userId))),
    getDocs(query(collection(firestore, "sites", session.siteId, "queueCycles"), where("fleetOfficerId", "==", session.userId)))
  ]);
  const trucks = truckSnapshot.docs.map((item) => {
    const data = item.data();
    return {
      id: item.id,
      registrationNumber: String(data.registrationNumber ?? item.id),
      driverName: String(data.driverName ?? "Driver not recorded"),
      currentStatus: String(data.currentStatus ?? "INACTIVE") as MobileTruck["currentStatus"],
      insuranceStatus: String(data.latestInsuranceStatus ?? "UNKNOWN") as MobileTruck["insuranceStatus"],
      insuranceExpiry: formatTimestamp(data.latestInsuranceExpiry),
      availabilityBatchId: typeof data.availabilityBatchId === "string" ? data.availabilityBatchId : undefined,
      availabilityQueueCycleId: typeof data.availabilityQueueCycleId === "string" ? data.availabilityQueueCycleId : undefined
    };
  });
  const queue = await Promise.all(cycleSnapshot.docs.filter((cycle) => cycle.data().status === "QUEUED").map(async (cycle) => {
    const data = cycle.data();
    const truckId = String(data.truckId);
    const truck = (await getDoc(doc(firestore, "sites", session.siteId, "trucks", truckId))).data() ?? {};
    return {
      id: cycle.id,
      truckId,
      registrationNumber: String(truck.registrationNumber ?? truckId),
      driverName: String(truck.driverName ?? "Driver not recorded"),
      position: await getQueuePosition(session.siteId, cycle.id),
      queueEnteredAt: formatTimestamp(data.queueEnteredAt)
    };
  }));

  return { siteId: session.siteId, roles: session.roles, trucks, queue: queue.sort((a, b) => a.position - b.position) };
}

export async function reportMobileReturn(siteId: string, truck: MobileTruck): Promise<"QUEUED" | "INSURANCE_HOLD"> {
  if (!functions || !auth?.currentUser) return truck.insuranceStatus === "VALID" || truck.insuranceStatus === "EXPIRING_SOON" ? "QUEUED" : "INSURANCE_HOLD";
  return (await callOperationalApi<{ siteId: string; truckId: string }, { status: "QUEUED" | "INSURANCE_HOLD" }>("reportTruckReturn", { siteId, truckId: truck.id })).status;
}

export async function confirmMobileAvailability(siteId: string, truck: MobileTruck): Promise<void> {
  if (!truck.availabilityBatchId || !truck.availabilityQueueCycleId) throw new Error("This truck has no open availability request.");
  if (!functions || !auth?.currentUser) return;
  await callOperationalApi<{ siteId: string; batchId: string; queueCycleId: string }, { status: string }>("confirmTruckAvailability", {
    siteId,
    batchId: truck.availabilityBatchId,
    queueCycleId: truck.availabilityQueueCycleId
  });
}
