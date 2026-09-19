import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { deliverNotificationForRecord } from "./delivery.js";

export { deliverNotificationForRecord } from "./delivery.js";

export const deliverNotification = onDocumentCreated(
  { document: "sites/{siteId}/notifications/{notificationId}", retry: true },
  async (event) => {
    if (!event.data) return;
    await deliverNotificationForRecord(event.params.siteId, event.params.notificationId);
  }
);
