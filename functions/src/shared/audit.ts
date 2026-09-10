import { FieldValue, type Transaction } from "firebase-admin/firestore";
import type { AuditEventType, UserRole } from "@refinery/types";
import { auditEventsRef } from "./paths.js";

export type AuditInput = {
  siteId: string;
  eventType: AuditEventType;
  actorUserId: string;
  actorRoles: UserRole[];
  truckId?: string;
  queueCycleId?: string;
  programmingBatchId?: string;
  bypassRequestId?: string;
  bypassAuthorizationId?: string;
  dispatchImportId?: string;
  dispatchRecordId?: string;
  relatedRecordPath?: string;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export function writeAuditEvent(transaction: Transaction, input: AuditInput): void {
  const ref = auditEventsRef(input.siteId).doc();

  transaction.set(ref, {
    ...Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined)
    ),
    createdAt: FieldValue.serverTimestamp()
  });
}
