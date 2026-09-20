export type TimestampLike = {
  seconds: number;
  nanoseconds: number;
};

export type UserRole =
  | "fleetOfficer"
  | "programmingOfficer"
  | "overseer"
  | "management"
  | "auditor"
  | "administrator";

export const USER_ROLES = [
  "fleetOfficer",
  "programmingOfficer",
  "overseer",
  "management",
  "auditor",
  "administrator"
] as const satisfies readonly UserRole[];

export type AccessView =
  | "overview"
  | "staff"
  | "my-fleet"
  | "my-bypass"
  | "trucks"
  | "insurance"
  | "queue"
  | "programming"
  | "programmed"
  | "orders"
  | "bypass"
  | "audit";

const roleViews: Record<UserRole, readonly AccessView[]> = {
  fleetOfficer: ["my-fleet", "my-bypass"],
  programmingOfficer: ["overview", "queue", "programming", "programmed", "orders"],
  overseer: ["overview", "queue", "programmed", "bypass"],
  management: ["overview", "queue", "programmed", "audit"],
  auditor: ["overview", "queue", "programmed", "audit"],
  administrator: ["overview", "staff", "queue", "programmed", "orders", "trucks", "insurance", "audit"]
};

export function isFleetOnlyRoleSet(roles: readonly UserRole[]): boolean {
  return roles.length > 0 && roles.every((role) => role === "fleetOfficer");
}

export function visibleViewsForRoles(roles: readonly UserRole[]): AccessView[] {
  if (isFleetOnlyRoleSet(roles)) return ["my-fleet", "my-bypass"];

  return [...new Set(roles.flatMap((role) => roleViews[role]))]
    .filter((view) => view !== "my-fleet" && view !== "my-bypass");
}

export type TruckStatus =
  | "ON_TRIP"
  | "QUEUED"
  | "AWAITING_AVAILABILITY"
  | "READY_FOR_PROGRAMMING"
  | "AWAITING_REPLACEMENT"
  | "INSURANCE_HOLD"
  | "PROGRAMMED"
  | "INACTIVE";

export type InsuranceStatus =
  | "VALID"
  | "EXPIRING_SOON"
  | "EXPIRED"
  | "UNKNOWN";

export type QueueCycleStatus =
  | "RETURN_REPORTED"
  | "QUEUED"
  | "AWAITING_AVAILABILITY"
  | "READY_FOR_PROGRAMMING"
  | "AWAITING_REPLACEMENT"
  | "INSURANCE_HOLD"
  | "PROGRAMMED"
  | "DISPATCHED"
  | "CANCELLED";

export type ProgrammingType = "FIFO" | "BYPASS";

export type ProgrammingBatchStatus =
  | "PREVIEWED"
  | "AWAITING_AVAILABILITY"
  | "CONFIRMED"
  | "CANCELLED";

export type BypassRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "USED"
  | "CANCELLED";

export type BypassAuthorizationStatus =
  | "ACTIVE"
  | "VALIDATED"
  | "USED"
  | "EXPIRED"
  | "REVOKED";

export type BypassReasonCategory =
  | "OPERATIONAL_REQUIREMENT"
  | "DESTINATION_SPECIFIC_REQUIREMENT"
  | "EMERGENCY_MOVEMENT"
  | "CUSTOMER_REQUIREMENT"
  | "MANAGEMENT_INSTRUCTION"
  | "OTHER";

export type AuditEventType =
  | "LOGIN"
  | "USER_CREATED"
  | "USER_ROLE_CHANGED"
  | "USER_DEACTIVATED"
  | "TRUCK_CREATED"
  | "TRUCK_UPDATED"
  | "FLEET_ASSIGNMENT_CHANGED"
  | "INSURANCE_RECORD_CREATED"
  | "INSURANCE_HOLD_APPLIED"
  | "INSURANCE_RENEWED"
  | "RETURN_REPORTED"
  | "QUEUE_ENTERED"
  | "QUEUE_REMOVED"
  | "AVAILABILITY_REQUESTED"
  | "AVAILABILITY_CONFIRMED"
  | "AVAILABILITY_EXPIRED"
  | "QUEUE_REPLACED"
  | "QUEUE_REENTERED_AFTER_TIMEOUT"
  | "ORDER_IMPORT_UPLOADED"
  | "ORDER_IMPORT_PROCESSED"
  | "ORDER_ATC_ASSIGNED"
  | "PROGRAMMING_BATCH_PREVIEWED"
  | "PROGRAMMING_BATCH_CONFIRMED"
  | "PROGRAMMING_BATCH_EXPIRED"
  | "TRUCK_PROGRAMMED"
  | "BYPASS_REQUESTED"
  | "BYPASS_APPROVED"
  | "BYPASS_REJECTED"
  | "BYPASS_OTP_GENERATED"
  | "BYPASS_OTP_VALIDATED"
  | "BYPASS_OTP_FAILED"
  | "BYPASS_OTP_USED"
  | "DISPATCH_CONFIRMED"
  | "RECORD_CORRECTED"
  | "METRIC_RECALCULATED";

export type DevicePlatform = "android" | "ios";

export type DeviceRegistration = {
  id: string;
  siteId: string;
  userId: string;
  deviceId: string;
  fcmToken?: string;
  platform: DevicePlatform;
  appVersion?: string;
  isActive: boolean;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
  lastSeenAt: TimestampLike;
  deactivatedAt?: TimestampLike;
};

export type AppUser = {
  id: string;
  siteId: string;
  authUid: string;
  name: string;
  email: string;
  phone?: string;
  roles: UserRole[];
  fleetOfficerId?: string;
  isActive: boolean;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
};

export type Truck = {
  id: string;
  siteId: string;
  internalCode: string;
  registrationNumber: string;
  normalizedRegistration: string;
  driverName: string;
  assignedFleetOfficerId: string;
  assignedFleetOfficerName?: string;
  currentStatus: TruckStatus;
  activeCycleId?: string;
  latestInsuranceStatus: InsuranceStatus;
  latestInsuranceExpiry?: TimestampLike;
  isActive: boolean;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
};

export type InsuranceRecord = {
  id: string;
  siteId: string;
  truckId: string;
  policyNumber: string;
  provider: string;
  effectiveDate: TimestampLike;
  expiryDate: TimestampLike;
  documentPath?: string;
  recordedBy: string;
  recordedAt: TimestampLike;
  statusAtRecordTime: Exclude<InsuranceStatus, "UNKNOWN">;
  supersedesRecordId?: string;
};

export type QueueCycle = {
  id: string;
  siteId: string;
  truckId: string;
  normalizedRegistration: string;
  fleetOfficerId: string;
  fleetOfficerName?: string;
  status: QueueCycleStatus;
  returnReportedAt: TimestampLike;
  queueEnteredAt?: TimestampLike;
  insuranceEvaluatedAt: TimestampLike;
  queueExitAt?: TimestampLike;
  programmedAt?: TimestampLike;
  dispatchConfirmedAt?: TimestampLike;
  programmingBatchId?: string;
  programmingType?: ProgrammingType;
  bypassRequestId?: string;
  bypassAuthorizationId?: string;
  atcNo?: string;
  createdBy: string;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
};

export type ProgrammingBatch = {
  id: string;
  siteId: string;
  humanCode: string;
  requestedSize: number;
  confirmedSize: number;
  fifoCount: number;
  bypassCount: number;
  status: ProgrammingBatchStatus;
  createdBy: string;
  createdAt: TimestampLike;
  confirmedBy?: string;
  confirmedAt?: TimestampLike;
  includedBypassAuthorizationIds: string[];
  notes?: string;
};

export type ProgrammingBatchItem = {
  id: string;
  siteId: string;
  batchId: string;
  batchOrder: number;
  truckId: string;
  queueCycleId: string;
  selectionType: ProgrammingType;
  originalQueuePosition: number;
  queueEnteredAt: TimestampLike;
  atcNo: string;
  bypassRequestId?: string;
  bypassAuthorizationId?: string;
  numberOfTrucksBypassed?: number;
  createdAt: TimestampLike;
};

export type BypassRequest = {
  id: string;
  siteId: string;
  truckId: string;
  queueCycleId: string;
  requestedBy: string;
  fleetOfficerId: string;
  queuePositionAtRequest: number;
  numberOfTrucksBypassed: number;
  reasonCategory: BypassReasonCategory;
  explanation: string;
  status: BypassRequestStatus;
  requestedAt: TimestampLike;
  decidedBy?: string;
  decidedAt?: TimestampLike;
  rejectionReason?: string;
  authorizationId?: string;
};

export type BypassAuthorization = {
  id: string;
  siteId: string;
  bypassRequestId: string;
  truckId: string;
  queueCycleId: string;
  requestedBy: string;
  approvedBy: string;
  otpHash: string;
  generatedAt: TimestampLike;
  expiresAt: TimestampLike;
  validatedAt?: TimestampLike;
  usedAt?: TimestampLike;
  failedAttempts: number;
  status: BypassAuthorizationStatus;
};

export type AuditEvent = {
  id: string;
  siteId: string;
  eventType: AuditEventType;
  actorUserId: string;
  actorRoles: UserRole[];
  truckId?: string;
  queueCycleId?: string;
  programmingBatchId?: string;
  bypassRequestId?: string;
  bypassAuthorizationId?: string;
  relatedRecordPath?: string;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: TimestampLike;
};

export type DailyMetrics = {
  id: string;
  siteId: string;
  date: string;
  queuedCount: number;
  programmedCount: number;
  dispatchedCount: number;
  insuranceHoldCount: number;
  bypassRequestedCount: number;
  bypassApprovedCount: number;
  bypassUsedCount: number;
  dispatchExceptionCount: number;
  fifoProgrammingCount: number;
  bypassProgrammingCount: number;
  fifoCompliancePercent: number;
  averageQueueWaitMinutes?: number;
  longestCurrentWaitMinutes?: number;
  updatedAt: TimestampLike;
};

export type NotificationType =
  | "RETURN_QUEUED"
  | "AVAILABILITY_REQUESTED"
  | "AVAILABILITY_CONFIRMED"
  | "AVAILABILITY_EXPIRED"
  | "INSURANCE_HOLD"
  | "INSURANCE_RENEWED"
  | "BYPASS_REQUESTED"
  | "BYPASS_APPROVED"
  | "BYPASS_REJECTED";

export type AppNotification = {
  id: string;
  siteId: string;
  userId: string;
  type: NotificationType;
  /** Present only on an approved bypass, until the code is validated or expires. */
  otp?: string;
  title: string;
  body: string;
  truckId?: string;
  bypassRequestId?: string;
  bypassAuthorizationId?: string;
  createdAt: TimestampLike;
  readAt?: TimestampLike;
  deliveryStatus?:
    | "PENDING"
    | "SENDING"
    | "SENT"
    | "PARTIAL"
    | "FAILED"
    | "NO_DEVICES";
  deliveryClaimedAt?: TimestampLike;
  deliveryAttemptedAt?: TimestampLike;
  deliverySuccessCount?: number;
  deliveryFailureCount?: number;
  deliveryError?: string;
};

export type FunctionResult<T> = {
  ok: true;
  data: T;
} | {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};
