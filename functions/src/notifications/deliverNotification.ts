import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { db, messaging } from "../shared/firebase.js";
import { notificationsRef, userDevicesRef } from "../shared/paths.js";
import {
  buildPushData,
  chunkTokens,
  isInvalidRegistrationToken,
  type PushNotificationSource
} from "./pushPayload.js";

type RegisteredDevice = {
  id: string;
  fcmToken: string;
};

export const deliverNotification = onDocumentCreated(
  {
    document: "sites/{siteId}/notifications/{notificationId}",
    retry: true
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const { siteId, notificationId } = event.params;
    const claimResult = await db.runTransaction(async (transaction) => {
      const latestSnapshot = await transaction.get(snapshot.ref);
      const latest = latestSnapshot.data() as
        | (PushNotificationSource & {
            userId?: string;
            deliveryStatus?: string;
            deliveryClaimedAt?: Timestamp;
          })
        | undefined;

      if (!latest) return null;
      if (["SENT", "PARTIAL", "FAILED", "NO_DEVICES"].includes(
        latest.deliveryStatus ?? ""
      )) {
        return null;
      }

      const leaseIsFresh =
        latest.deliveryStatus === "SENDING" &&
        latest.deliveryClaimedAt instanceof Timestamp &&
        latest.deliveryClaimedAt.toMillis() > Date.now() - 5 * 60 * 1000;
      if (leaseIsFresh) return "BUSY" as const;

      transaction.update(snapshot.ref, {
        deliveryStatus: "SENDING",
        deliveryClaimedAt: FieldValue.serverTimestamp()
      });
      return latest;
    });

    if (claimResult === "BUSY") {
      throw new Error("Notification delivery is already in progress.");
    }
    if (!claimResult) return;
    const source = claimResult;

    if (!source.userId || !source.title || !source.body) {
      await snapshot.ref.update({
        deliveryStatus: "FAILED",
        deliveryAttemptedAt: FieldValue.serverTimestamp(),
        deliverySuccessCount: 0,
        deliveryFailureCount: 0,
        deliveryError: "Notification is missing userId, title, or body.",
        deliveryClaimedAt: FieldValue.delete()
      });
      return;
    }

    const deviceSnapshot = await userDevicesRef(siteId, source.userId)
      .where("isActive", "==", true)
      .get();
    const devices: RegisteredDevice[] = deviceSnapshot.docs.flatMap((document) => {
      const token = document.data().fcmToken;
      return typeof token === "string" && token.length > 0
        ? [{ id: document.id, fcmToken: token }]
        : [];
    });

    if (devices.length === 0) {
      await snapshot.ref.update({
        deliveryStatus: "NO_DEVICES",
        deliveryAttemptedAt: FieldValue.serverTimestamp(),
        deliverySuccessCount: 0,
        deliveryFailureCount: 0,
        deliveryClaimedAt: FieldValue.delete()
      });
      return;
    }

    let successCount = 0;
    let failureCount = 0;
    const invalidDeviceIds = new Set<string>();
    const devicesByToken = new Map(devices.map((device) => [device.fcmToken, device]));

    for (const tokens of chunkTokens(devices.map((device) => device.fcmToken))) {
      const response = await messaging.sendEachForMulticast({
        tokens,
        notification: { title: source.title, body: source.body },
        data: buildPushData(notificationId, source),
        android: { priority: "high" },
        apns: { payload: { aps: { sound: "default" } } }
      });

      successCount += response.successCount;
      failureCount += response.failureCount;
      response.responses.forEach((sendResult, index) => {
        if (!sendResult.success && isInvalidRegistrationToken(sendResult.error?.code)) {
          const token = tokens[index];
          const device = token ? devicesByToken.get(token) : undefined;
          if (device) invalidDeviceIds.add(device.id);
        }
      });
    }

    const batch = notificationsRef(siteId).firestore.batch();
    const now = FieldValue.serverTimestamp();
    invalidDeviceIds.forEach((deviceId) => {
      batch.update(userDevicesRef(siteId, source.userId!).doc(deviceId), {
        fcmToken: FieldValue.delete(),
        isActive: false,
        deactivatedAt: now,
        updatedAt: now
      });
    });
    batch.update(snapshot.ref, {
      deliveryStatus:
        successCount === 0 ? "FAILED" : failureCount > 0 ? "PARTIAL" : "SENT",
      deliveryAttemptedAt: now,
      deliverySuccessCount: successCount,
      deliveryFailureCount: failureCount,
      deliveryClaimedAt: FieldValue.delete()
    });
    await batch.commit();
  }
);
