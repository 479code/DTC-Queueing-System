import { registerDeviceTokenInputSchema } from "@refinery/validation";
import { FieldValue } from "firebase-admin/firestore";
import { requireAuth, requireSameSite } from "../shared/auth.js";
import { validatedCall } from "../shared/callable.js";
import { db } from "../shared/firebase.js";
import { permissionDenied } from "../shared/errors.js";
import { userDevicesRef, usersRef } from "../shared/paths.js";

export const registerDeviceToken = validatedCall(
  registerDeviceTokenInputSchema,
  async (data, request) => {
    const context = requireAuth(request);
    requireSameSite(context, data.siteId);

    const userSnapshot = await usersRef(data.siteId).doc(context.uid).get();
    if (!userSnapshot.exists || userSnapshot.data()?.isActive !== true) {
      permissionDenied("An active user profile is required.");
    }

    const devices = userDevicesRef(data.siteId, context.uid);
    const deviceRef = devices.doc(data.deviceId);
    const duplicateTokens = await db
      .collectionGroup("devices")
      .where("fcmToken", "==", data.fcmToken)
      .get();
    const batch = db.batch();
    const now = FieldValue.serverTimestamp();

    duplicateTokens.docs
      .filter((document) => document.ref.path !== deviceRef.path)
      .forEach((document) => {
        batch.update(document.ref, {
          fcmToken: FieldValue.delete(),
          isActive: false,
          deactivatedAt: now,
          updatedAt: now
        });
      });

    batch.set(
      deviceRef,
      {
        siteId: data.siteId,
        userId: context.uid,
        deviceId: data.deviceId,
        fcmToken: data.fcmToken,
        platform: data.platform,
        ...(data.appVersion ? { appVersion: data.appVersion } : {}),
        isActive: true,
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now,
        deactivatedAt: FieldValue.delete()
      },
      { merge: true }
    );

    await batch.commit();

    return { deviceId: data.deviceId, registered: true as const };
  }
);
