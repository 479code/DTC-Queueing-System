import { unregisterDeviceTokenInputSchema } from "@refinery/validation";
import { FieldValue } from "firebase-admin/firestore";
import { requireAuth, requireSameSite } from "../shared/auth.js";
import { validatedCall } from "../shared/callable.js";
import { userDevicesRef } from "../shared/paths.js";

export const unregisterDeviceToken = validatedCall(
  unregisterDeviceTokenInputSchema,
  async (data, request) => {
    const context = requireAuth(request);
    requireSameSite(context, data.siteId);

    const deviceRef = userDevicesRef(data.siteId, context.uid).doc(data.deviceId);
    const now = FieldValue.serverTimestamp();

    await deviceRef.set(
      {
        siteId: data.siteId,
        userId: context.uid,
        deviceId: data.deviceId,
        fcmToken: FieldValue.delete(),
        isActive: false,
        updatedAt: now,
        deactivatedAt: now
      },
      { merge: true }
    );

    return { deviceId: data.deviceId, registered: false as const };
  }
);
