import { FieldValue, type Transaction } from "firebase-admin/firestore";
import type { NotificationType } from "@refinery/types";
import { notificationsRef } from "./paths.js";

type NotificationInput = {
  siteId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  truckId?: string;
  bypassRequestId?: string;
  bypassAuthorizationId?: string;
};

export function writeNotification(
  transaction: Transaction,
  input: NotificationInput
): void {
  const ref = notificationsRef(input.siteId).doc();

  transaction.set(ref, {
    ...input,
    createdAt: FieldValue.serverTimestamp(),
    readAt: null,
    deliveryStatus: "PENDING"
  });
}
