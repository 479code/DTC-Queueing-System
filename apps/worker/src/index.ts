import {
  db,
  deliverNotificationForRecord,
  expireAvailabilityRequests,
  requeueStrandedReplacements,
  closeFinishedAvailabilityBatches,
  expireInsuranceRecords,
  refreshAllDailyMetrics
} from "@refinery/functions";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

const pollIntervalMs = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 30_000);
const leaseMs = 5 * 60 * 1000;

function lagosClock(now = new Date()): { day: string; minuteOfDay: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Lagos",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(now).map((part) => [part.type, part.value])
  );
  return {
    day: `${parts.year}${parts.month}${parts.day}`,
    minuteOfDay: Number(parts.hour) * 60 + Number(parts.minute)
  };
}

async function runOncePerDay(name: string, dueMinute: number, task: () => Promise<void>): Promise<void> {
  const clock = lagosClock();
  if (clock.minuteOfDay < dueMinute) return;
  const jobRef = db.collection("systemJobs").doc(`${name}_${clock.day}`);
  const claimed = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(jobRef);
    const existing = snapshot.data();
    if (existing?.status === "COMPLETED") return false;
    const claimedAt = existing?.claimedAt;
    const activeLease = existing?.status === "RUNNING" && claimedAt instanceof Timestamp && claimedAt.toMillis() > Date.now() - leaseMs;
    if (activeLease) return false;
    transaction.set(jobRef, {
      name,
      day: clock.day,
      status: "RUNNING",
      claimedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return true;
  });
  if (!claimed) return;

  try {
    await task();
    await jobRef.set({ status: "COMPLETED", completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  } catch (error) {
    await jobRef.set({
      status: "FAILED",
      lastError: error instanceof Error ? error.message : "Unknown worker failure.",
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    throw error;
  }
}

async function deliverPendingNotifications(): Promise<void> {
  const pending = await db.collectionGroup("notifications")
    .where("deliveryStatus", "in", ["PENDING", "SENDING"])
    .limit(100)
    .get();
  for (const notification of pending.docs) {
    const siteId = notification.ref.parent.parent?.id;
    if (!siteId) continue;
    try {
      await deliverNotificationForRecord(siteId, notification.id);
    } catch (error) {
      console.error("Notification delivery failed", { siteId, notificationId: notification.id, error });
    }
  }
}

let running = false;
async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await deliverPendingNotifications();
    await expireAvailabilityRequests();
    await requeueStrandedReplacements();
    await closeFinishedAvailabilityBatches();
    await runOncePerDay("insurance-expiry", 15, expireInsuranceRecords);
    await runOncePerDay("daily-metrics", 23 * 60 + 55, refreshAllDailyMetrics);
  } finally {
    running = false;
  }
}

void tick().catch((error) => console.error("Worker startup run failed", error));
setInterval(() => void tick().catch((error) => console.error("Worker run failed", error)), pollIntervalMs);
