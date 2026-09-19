# CODEX_HANDOFF.md

# Refinery Truck FIFO Queue & Programming System

> **Current controlling change (16 September 2026):** This section supersedes every earlier reference in this document to dispatch reporting, post-programming reconciliation, manually typed/batch-pasted ATCs, or a permanently held unavailable truck. The system does not create ATC numbers and does not reconcile dispatch reports. It imports the received order workbook, which already contains orders and ATC numbers, then links one imported order/ATC pair to each confirmed FIFO truck during programming.

## Availability-Controlled Order Programming

1. A programming officer previews the next eligible FIFO batch, with an approved bypass only where the existing OTP rule permits it.
2. Starting the batch sends an availability request for every selected truck. Each request has a server-controlled one-hour window.
3. The assigned fleet officer confirms the truck and its assigned driver are available. No standing user permission allows a person to substitute a driver or choose a replacement truck.
4. A truck that does not confirm in time opens its slot. The system offers that slot to the next eligible FIFO truck and begins its own one-hour window.
5. When that replacement truck confirms, the expired truck automatically returns to the back of the FIFO list with a new server queue-entry time. It cannot reclaim its former position. The same rule repeats safely for any further expiry.
6. The programming officer can only program trucks with confirmed availability. For each, they select one available imported order and its supplied ATC number. The ATC cannot be typed or generated in this system.
7. The system records the truck, driver, availability events, imported order, ATC number, sales order number, batch, actors, timestamps, bypass evidence where applicable, and audit events.

### Incoming Workbook Contract

The supplied workbook `DD SUS OIL 16.09.26.xlsx` is the reference shape. It includes `ATC NO` and `SALES ORDER NO`, plus customer, station, contact, licence, volume, and expected delivery details. Only `ATC NO` and `SALES ORDER NO` are required for import. Preserve supplied ATCs as text, including leading zeroes such as `0472438`. Reject blank or duplicate ATCs and duplicate previously imported ATCs. Truck registration is not an input requirement for this workbook.

### Current Collections and State

Use `orderImports/{importId}` for workbook metadata and checksum, and `orders/{orderId}` for individual imported records. Orders move from `AVAILABLE` to `PROGRAMMED` only in the same transaction that programs their linked truck. Queue cycles may temporarily be `AWAITING_AVAILABILITY`, `READY_FOR_PROGRAMMING`, or `AWAITING_REPLACEMENT`; only backend code may set these states, expire a timer, nominate the next FIFO truck, or move an expired truck to the rear.

## Implementation Handoff for Codex

This document is the implementation-ready handoff for building the Refinery Truck FIFO Queue & Programming System.

The business logic in this document is settled. Do not redesign the allocation model, bypass workflow, or operating rules. Implement the agreed rules as specified. Where implementation details are missing, choose the simplest secure hybrid Railway/Firebase approach, document the decision, and keep the product behavior consistent with this handoff.

Figma reference:

https://www.figma.com/design/hIeb7OVHEhYurtq3GGPzJP

The Figma file contains the product wireframes, entity model, and sequence-flow reference. Treat it as the UX reference, not as permission to change the underlying business rules.

## 1. Product Purpose

The system is an internal refinery operations platform for controlling how refinery-owned trucks are queued and programmed for loading.

The product exists to:

- make loading order transparent;
- ensure trucks with valid insurance enter a FIFO queue when their return is reported;
- remove discretionary truck selection from normal programming;
- allow legitimate exceptions only through an approved bypass workflow;
- bind each approved bypass to a short-lived one-time authorization code;
- reconcile programmed trucks against refinery dispatch reports;
- expose dispatch discrepancies;
- maintain an immutable audit trail for all consequential actions;
- give management visibility into FIFO compliance, bypasses, insurance exposure, and dispatch exceptions.

The product must stay neutral in branding. Do not invent company names or public-facing marketing names. Use neutral labels such as `Refinery Truck Queue System`, `Fleet Queue Control`, or `Truck Queue`.

## 2. Scope Boundaries

### In Scope for MVP

- Firebase Auth based sign-in and role assignment.
- Web operations dashboard in Next.js.
- Role-based mobile app in React Native/Expo.
- Truck registry and fleet-officer assignment.
- Insurance record management and eligibility checks.
- Fleet officer return reporting.
- Server-authoritative FIFO queue entry.
- Batch programming of the next N trucks.
- Approved bypass inclusion in a programming batch.
- OTP validation for bypass authorization.
- Dispatch Excel upload and reconciliation.
- Audit log.
- Basic management reporting.
- FCM push notifications and in-app notifications.
- Firestore security rules and Railway API enforced business rules.

### Explicitly Out of Scope for MVP

- Predictive AI or smart scoring.
- Rotation-deficit scoring.
- Route optimization.
- Driver performance scoring.
- Maintenance management.
- Fuel management.
- PIF digitization.
- SAP integration.
- GPS/geofence verification.
- Real-time GPS fleet tracking.
- Customer order allocation.
- Complex dispatch optimization.
- Public multi-tenant SaaS product.
- Microservices.

Earlier discussion explored fairness scores, rotation rounds, and observation-only analytics. Those ideas are not the MVP allocation model. MVP uses strict FIFO based on server-side queue entry time, with bypass as the only approved exception.

## 3. Final Architecture Decision

The final agreed architecture is a Railway/Firebase hybrid. This preserves
Firebase for identity and real-time operational data while Railway hosts the
application layer and private file storage.

Use:

- `Next.js` for the web dashboard.
- `Railway` for the Next.js web app.
- `React Native / Expo` for mobile.
- `Firebase Authentication` for user identity.
- `Firestore` as the operational database.
- `Railway API` for all consequential business logic.
- `Railway Bucket` for uploaded dispatch spreadsheets and supporting documents.
- `Firebase Cloud Messaging` for push notifications.
- Railway and Firebase monitoring, backups, and budget alerts.

Do not implement the prior NestJS/PostgreSQL/REST design or a PostgreSQL
migration. Firestore remains the single source of truth.

The clients may read safe operational views from Firestore, subject to security rules. Clients must not directly write consequential state transitions. All important writes go through the Railway API.

The Railway API verifies Firebase ID tokens, derives the caller's `siteId` and
roles from Firebase custom claims, enforces the same rules for web and mobile,
and writes to Firestore with server credentials. Firestore Security Rules deny
client writes to consequential state; Railway is the only production writer.

Consequential operations include:

- reporting a truck return;
- creating or changing queue-cycle state;
- previewing and confirming programming batches;
- requesting bypass;
- approving or rejecting bypass;
- generating and validating bypass OTP;
- including bypass trucks in a batch;
- uploading and reconciling dispatch reports;
- updating insurance records;
- correcting operational records;
- writing audit events;
- maintaining daily metrics;
- recording externally issued ATC numbers against the trucks selected for programming.

## 4. Recommended Repository Structure

Use a monorepo.

```text
refinery-queue/
  apps/
    web/
      app/
      components/
      features/
      lib/
      firebase/
      tests/
    mobile/
      app/
      src/
        features/
        components/
        firebase/
        navigation/
        tests/

  functions/
    src/
      auth/
      users/
      trucks/
      insurance/
      returns/
      queue/
      programming/
      bypass/
      dispatch/
      audit/
      notifications/
      metrics/
      corrections/
      shared/
      index.ts
    tests/

  packages/
    types/
    validation/
    shared/
    ui/

  docs/
    CODEX_HANDOFF.md
    firestore-model.md
    function-contracts.md
    security-rules.md

  firestore.rules
  firestore.indexes.json
  storage.rules
  firebase.json
  package.json
  pnpm-workspace.yaml
  README.md
```

For this delivered handoff file, keep `CODEX_HANDOFF.md` as the source of truth until the repo is scaffolded. After scaffolding, copy it to `docs/CODEX_HANDOFF.md`.

## 5. Core Operating Rule

The central rule is:

> A truck with valid insurance enters the FIFO queue when its return is reported and confirmed by the backend. Trucks are programmed in chronological order of queue entry. A truck may only be programmed outside FIFO through an approved bypass.

Queue position is never a manually editable field.

Queue order is derived from:

```text
queueEnteredAt ascending
```

The backend server timestamp determines `queueEnteredAt`. Mobile device time must never determine queue priority.

## 6. Core Truck Cycle

Use this lifecycle:

```text
ON_TRIP
  -> RETURN_REPORTED
  -> insurance validation
  -> QUEUED if insurance is valid
  -> INSURANCE_HOLD if insurance is expired
  -> PROGRAMMED after batch programming
  -> existing refinery PIF process outside this system
  -> DISPATCHED / ON_TRIP after dispatch report confirmation
  -> next return creates a new queue cycle
```

Each return creates a new `queueCycle` document. Do not overwrite history.

A truck can have only one active operational cycle at a time.

## 7. Roles and Permissions

### Fleet Officer

Can:

- view assigned trucks;
- view the live queue;
- view current queue position for assigned trucks;
- report return for assigned trucks;
- view insurance status for assigned trucks;
- receive insurance warnings;
- request bypass for assigned queued trucks;
- enter bypass OTP for assigned trucks;
- view own truck activity history.

Cannot:

- manually change queue position;
- approve bypass;
- approve own request;
- program trucks unless also granted programmer permissions;
- update dispatch records;
- alter audit events.

### Programming Officer

Can:

- view the full active queue;
- preview a batch of the next N FIFO trucks;
- include a valid authorized bypass in a batch;
- confirm programming batches;
- view programming batch history.

Cannot:

- manually tick arbitrary trucks;
- manually reorder the queue;
- authorize bypass;
- change return timestamps;
- edit audit records.

### Overseer

Can:

- receive bypass requests;
- view requested truck, queue position, and trucks being bypassed;
- approve or reject bypass requests;
- view generated OTP immediately after approval;
- view bypass decision history.

Cannot:

- approve their own request;
- alter queue order directly;
- program trucks as a bypass workaround unless separately granted programmer permissions;
- edit old approvals.

### Management

Read-focused role.

Can view:

- operations overview;
- active queue;
- FIFO compliance;
- bypass activity;
- insurance exposure;
- dispatch reconciliation;
- fleet officer statistics;
- overseer approval patterns;
- reports and exports.

### Auditor

Read-only investigative role.

Can view:

- queue cycles;
- return timestamps;
- programming events;
- bypass requests;
- approvals;
- OTP use metadata, excluding plaintext codes;
- dispatch reconciliation;
- administrative corrections;
- audit log.

### Administrator

Can:

- create users;
- assign roles;
- register trucks;
- assign fleet officers;
- update insurance records;
- configure bypass reason categories;
- deactivate users or trucks;
- perform controlled corrections.

Every administrator correction must create an audit event.

### Web Navigation by Role

In a live session, hide screens that do not belong to the signed-in user's role.
Do not rely on hidden navigation for security; Firestore rules and the Railway API
remain the enforcement layer.

| Role | Visible web navigation |
| --- | --- |
| Fleet officer only | My Fleet |
| Programming officer | Overview, Live Queue, Programming, Dispatch |
| Overseer | Overview, Live Queue, Bypass Requests |
| Management | Overview, Live Queue, Audit Log |
| Auditor | Overview, Live Queue, Audit Log |
| Administrator | Overview, Live Queue, Trucks, Insurance, Audit Log |

For a multi-role user, show the union of their permitted screens. A fleet
officer with no operational role is the only user whose web experience is
restricted to My Fleet. Direct hash routes to an unavailable screen must fall
back to the first permitted screen.

## 8. Firestore Data Model

Use a single-refinery structure for MVP, but leave a `siteId`/`tenantId` path or field so the system can later partition by site without rewriting the model.

Recommended top-level structure:

```text
sites/{siteId}
  config/{configDoc}
  users/{userId}
    devices/{deviceId}
  trucks/{truckId}
  queueCycles/{cycleId}
  programmingBatches/{batchId}
    items/{itemId}
  bypassRequests/{requestId}
  bypassAuthorizations/{authorizationId}
  insuranceRecords/{insuranceRecordId}
  dispatchImports/{importId}
    rows/{rowId}
  dispatchRecords/{dispatchRecordId}
  auditEvents/{eventId}
  dailyMetrics/{yyyyMMdd}
  notifications/{notificationId}
```

If implementation simplicity requires top-level collections for V1, include `siteId` on every operational document and enforce it in rules and queries.

### users

Mirror Firebase Auth users into Firestore for profile and role metadata.

```ts
type AppUser = {
  id: string;
  siteId: string;
  authUid: string;
  name: string;
  email: string;
  phone?: string;
  roles: Array<
    | "fleetOfficer"
    | "programmingOfficer"
    | "overseer"
    | "management"
    | "auditor"
    | "administrator"
  >;
  fleetOfficerId?: string;
  isActive: boolean;
  mfaRequired: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

Use Firebase custom claims for coarse roles and site access. Use Firestore user docs for display metadata and assignment details.

### user devices

Store private FCM registrations at `users/{userId}/devices/{deviceId}`, where `deviceId` is the Firebase Installation ID.

```ts
type DeviceRegistration = {
  id: string;
  siteId: string;
  userId: string;
  deviceId: string;
  fcmToken?: string;
  platform: "android" | "ios";
  appVersion?: string;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastSeenAt: Timestamp;
  deactivatedAt?: Timestamp;
};
```

FCM tokens are sensitive. Clients must not read or write these documents directly. Authenticated callable functions register and unregister only the caller's installation. Registering a token deactivates any older registration that holds the same token, including one belonging to a previously signed-in user.

### trucks

```ts
type Truck = {
  id: string;
  siteId: string;
  internalCode: string; // server-generated, example: TRK-000184
  registrationNumber: string; // display value, example: FZE 481 DI
  normalizedRegistration: string; // example: FZE481DI
  driverName: string;
  assignedFleetOfficerId: string;
  assignedFleetOfficerName?: string; // denormalized display value
  currentStatus:
    | "ON_TRIP"
    | "QUEUED"
    | "INSURANCE_HOLD"
    | "PROGRAMMED"
    | "INACTIVE";
  activeCycleId?: string;
  latestInsuranceStatus: "VALID" | "EXPIRING_SOON" | "EXPIRED" | "UNKNOWN";
  latestInsuranceExpiry?: Timestamp;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

Normalize registrations by removing spaces and punctuation and uppercasing. Store raw and normalized values. Dispatch matching uses normalized registration.

`driverName` belongs on the truck master record because users need to identify the truck and driver together during queue, programming, return, and dispatch-review workflows. Dispatch imports may also contain a `Driver Name` column; preserve the imported value on dispatch records even when it differs from the truck master value.

### insuranceRecords

```ts
type InsuranceRecord = {
  id: string;
  siteId: string;
  truckId: string;
  policyNumber: string;
  provider: string;
  effectiveDate: Timestamp;
  expiryDate: Timestamp;
  documentPath?: string;
  recordedBy: string;
  recordedAt: Timestamp;
  statusAtRecordTime: "VALID" | "EXPIRING_SOON" | "EXPIRED";
  supersedesRecordId?: string;
};
```

Insurance updates create new records. Do not overwrite historical records.

Warning periods:

- 30 days;
- 14 days;
- 7 days;
- 1 day;
- expired.

Expired trucks cannot enter the FIFO queue. If insurance expires while a truck is queued, a scheduled function must move the active cycle to `INSURANCE_HOLD`.

MVP re-entry policy:

> When expired insurance is renewed, the timestamp at which valid insurance is restored becomes the new queue-entry timestamp.

This prevents an inactive truck from preserving stale queue priority indefinitely.

### queueCycles

```ts
type QueueCycle = {
  id: string;
  siteId: string;
  truckId: string;
  normalizedRegistration: string;
  fleetOfficerId: string;
  fleetOfficerName?: string; // denormalized display value
  status:
    | "RETURN_REPORTED"
    | "QUEUED"
    | "INSURANCE_HOLD"
    | "PROGRAMMED"
    | "DISPATCHED"
    | "CANCELLED";
  returnReportedAt: Timestamp;
  queueEnteredAt?: Timestamp;
  insuranceEvaluatedAt: Timestamp;
  queueExitAt?: Timestamp;
  programmedAt?: Timestamp;
  dispatchConfirmedAt?: Timestamp;
  programmingBatchId?: string;
  programmingType?: "FIFO" | "BYPASS";
  atcNo?: string;
  bypassRequestId?: string;
  bypassAuthorizationId?: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

Historical cycles are append-preserving. Corrections do not erase the original cycle. Use controlled correction records and audit events.

### programmingBatches

Programming is batch-based. Single-truck programming is a batch of size 1.

```ts
type ProgrammingBatch = {
  id: string;
  siteId: string;
  humanCode: string; // example: PB-20260908-0042
  requestedSize: number;
  confirmedSize: number;
  fifoCount: number;
  bypassCount: number;
  status: "PREVIEWED" | "CONFIRMED" | "CANCELLED";
  createdBy: string;
  createdAt: Timestamp;
  confirmedBy?: string;
  confirmedAt?: Timestamp;
  includedBypassAuthorizationIds: string[];
  notes?: string;
};
```

Use subcollection items:

```ts
type ProgrammingBatchItem = {
  id: string;
  siteId: string;
  batchId: string;
  batchOrder: number;
  truckId: string;
  queueCycleId: string;
  selectionType: "FIFO" | "BYPASS";
  originalQueuePosition: number;
  queueEnteredAt: Timestamp;
  atcNo: string;
  bypassRequestId?: string;
  bypassAuthorizationId?: string;
  numberOfTrucksBypassed?: number;
  createdAt: Timestamp;
};
```

Store original queue position at selection time for audit. Do not store editable live queue positions on trucks or cycles.

### bypassRequests

```ts
type BypassRequest = {
  id: string;
  siteId: string;
  truckId: string;
  queueCycleId: string;
  requestedBy: string;
  requestedByName?: string; // denormalized display value
  fleetOfficerId: string;
  queuePositionAtRequest: number;
  numberOfTrucksBypassed: number;
  reasonCategory:
    | "OPERATIONAL_REQUIREMENT"
    | "DESTINATION_SPECIFIC_REQUIREMENT"
    | "EMERGENCY_MOVEMENT"
    | "CUSTOMER_REQUIREMENT"
    | "MANAGEMENT_INSTRUCTION"
    | "OTHER";
  explanation: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "USED" | "CANCELLED";
  requestedAt: Timestamp;
  decidedBy?: string;
  decidedAt?: Timestamp;
  rejectionReason?: string;
  authorizationId?: string;
};
```

Bypass is unnecessary if the truck is already position #1. The function should reject or warn accordingly.

### bypassAuthorizations

```ts
type BypassAuthorization = {
  id: string;
  siteId: string;
  bypassRequestId: string;
  truckId: string;
  queueCycleId: string;
  requestedBy: string;
  approvedBy: string;
  otpHash: string;
  generatedAt: Timestamp;
  expiresAt: Timestamp;
  validatedAt?: Timestamp;
  usedAt?: Timestamp;
  failedAttempts: number;
  status: "ACTIVE" | "VALIDATED" | "USED" | "EXPIRED" | "REVOKED";
};
```

The plaintext OTP must never be stored permanently. Return it only once in the approve function response for display to the overseer. Recommended OTP format is six digits shown as `482 193`. Validity is 10 minutes for MVP.

OTP must be bound to:

- bypass request;
- truck;
- queue cycle;
- requesting fleet officer;
- approving overseer;
- expiry time.

It is one-time use only.

### dispatchImports

```ts
type DispatchImport = {
  id: string;
  siteId: string;
  storagePath: string;
  originalFileName: string;
  uploadedBy: string;
  uploadedAt: Timestamp;
  processedAt?: Timestamp;
  checksum: string;
  status: "UPLOADED" | "PROCESSING" | "PROCESSED" | "FAILED";
  rowsProcessed: number;
  matchedCount: number;
  programmedNotDispatchedCount: number;
  dispatchedNotProgrammedCount: number;
  truckMismatchCount: number;
  unknownTruckCount: number;
  duplicateRowCount: number;
  errorMessage?: string;
};
```

The provided sample dispatch spreadsheet contains these columns:

- `S/N`
- `Loading Date`
- `Customer Code`
- `Customer Name`
- `Product`
- `Programmed Quantity`
- `Loaded Quantity`
- `Transporter`
- `Truck Plate`
- `Driver Name`
- `Terminal`
- `Final Destination`
- `State`
- `ATC NO`
- `Delivery no`
- `SALES ORDER`
- `CONTRACT`

The importer must preserve raw row values and normalized values.

For MVP, `Loading Date`, `Truck Plate`, and `ATC NO` are required matching columns. The importer recognizes the remaining known columns when present, preserves every source cell in `rawData`, rejects invalid loading dates, and limits one import to 200 non-empty rows so all exact-match queue claims fit within Firestore transaction limits.

### dispatchRecords

```ts
type DispatchRecord = {
  id: string;
  siteId: string;
  importId: string;
  sourceRowNumber: number;
  loadingDate: Timestamp;
  customerCode?: string;
  customerName?: string;
  product?: string;
  programmedQuantity?: number;
  loadedQuantity?: number;
  transporter?: string;
  rawTruckPlate: string;
  normalizedTruckPlate: string;
  truckId?: string;
  driverName?: string;
  terminal?: string;
  finalDestination?: string;
  state?: string;
  atcNo?: string;
  deliveryNo?: string;
  salesOrder?: string;
  contract?: string;
  matchedQueueCycleId?: string;
  matchedProgrammingBatchId?: string;
  matchStatus:
    | "MATCHED"
    | "PROGRAMMED_NOT_DISPATCHED"
    | "DISPATCHED_NOT_PROGRAMMED"
    | "TRUCK_MISMATCH"
    | "UNKNOWN_TRUCK"
    | "DUPLICATE_ROW";
  recordKind: "IMPORT_ROW" | "PROGRAMMING_EXCEPTION";
  matchReason: string;
  rawData: Record<string, string | number | boolean | null>;
  createdAt: Timestamp;
};
```

Reconciliation categories:

- `MATCHED`: programmed and dispatched.
- `PROGRAMMED_NOT_DISPATCHED`: selected in system but absent from dispatch report.
- `DISPATCHED_NOT_PROGRAMMED`: appears in dispatch report without system programming.
- `TRUCK_MISMATCH`: expected one truck but dispatch indicates another.
- `UNKNOWN_TRUCK`: dispatch plate does not match any registered truck.
- `DUPLICATE_ROW`: likely duplicate dispatch row.

Duplicate detection should use a combination of normalized truck plate, loading date, delivery number, sales order, ATC number, product, and loaded quantity.

ATC numbers are not generated by this system. A programming officer enters one ATC number for each truck while confirming the FIFO programming batch. Dispatch reconciliation must use that stored ATC-to-queue-cycle assignment and the truck plate together. An exact ATC match with a different truck is `TRUCK_MISMATCH`, not `MATCHED`.

### auditEvents

```ts
type AuditEvent = {
  id: string;
  siteId: string;
  eventType: AuditEventType;
  actorUserId: string;
  actorRoles: string[];
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
  createdAt: Timestamp;
};
```

Audit events are append-only. No client or normal administrator can update or delete them.

Required audit event types:

```text
LOGIN
USER_CREATED
USER_ROLE_CHANGED
USER_DEACTIVATED
TRUCK_CREATED
TRUCK_UPDATED
FLEET_ASSIGNMENT_CHANGED
INSURANCE_RECORD_CREATED
INSURANCE_HOLD_APPLIED
INSURANCE_RENEWED
RETURN_REPORTED
QUEUE_ENTERED
QUEUE_REMOVED
PROGRAMMING_BATCH_PREVIEWED
PROGRAMMING_BATCH_CONFIRMED
TRUCK_PROGRAMMED
BYPASS_REQUESTED
BYPASS_APPROVED
BYPASS_REJECTED
BYPASS_OTP_GENERATED
BYPASS_OTP_VALIDATED
BYPASS_OTP_FAILED
BYPASS_OTP_USED
DISPATCH_IMPORT_UPLOADED
DISPATCH_IMPORT_PROCESSED
DISPATCH_CONFIRMED
DISPATCH_MISMATCH
RECORD_CORRECTED
METRIC_RECALCULATED
```

### dailyMetrics

```ts
type DailyMetrics = {
  id: string; // yyyyMMdd
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
  updatedAt: Timestamp;
};
```

Dashboards should use metrics documents rather than scanning historical audit data on every page load.

## 9. Firestore Indexes

Define composite indexes for the main queries.

Recommended indexes:

```text
queueCycles:
  siteId ASC, status ASC, queueEnteredAt ASC
  siteId ASC, truckId ASC, createdAt DESC
  siteId ASC, fleetOfficerId ASC, status ASC, queueEnteredAt ASC

trucks:
  siteId ASC, assignedFleetOfficerId ASC, currentStatus ASC
  siteId ASC, normalizedRegistration ASC
  siteId ASC, latestInsuranceExpiry ASC

bypassRequests:
  siteId ASC, status ASC, requestedAt DESC
  siteId ASC, fleetOfficerId ASC, requestedAt DESC
  siteId ASC, truckId ASC, requestedAt DESC

bypassAuthorizations:
  siteId ASC, truckId ASC, status ASC, expiresAt ASC
  siteId ASC, bypassRequestId ASC

programmingBatches:
  siteId ASC, confirmedAt DESC
  siteId ASC, status ASC, createdAt DESC

dispatchImports:
  siteId ASC, uploadedAt DESC

dispatchRecords:
  siteId ASC, importId ASC, matchStatus ASC
  siteId ASC, normalizedTruckPlate ASC, loadingDate DESC
  siteId ASC, matchStatus ASC, loadingDate DESC

auditEvents:
  siteId ASC, createdAt DESC
  siteId ASC, truckId ASC, createdAt DESC
  siteId ASC, actorUserId ASC, createdAt DESC
  siteId ASC, eventType ASC, createdAt DESC
```

Avoid a design that updates one global `CURRENT_QUEUE` document for every operation. That would create contention. Queue cycles should be separate documents.

## 10. Cloud Function Contracts

Use callable functions or HTTPS functions with Firebase Auth context. All functions must verify:

- authenticated user;
- active user;
- site membership;
- required role;
- target records belong to the same site;
- operation is allowed for the current record state.

Return structured errors with stable codes.

### saveTruck

Called by administrator.

Rules:

- Create or update the truck master record, including `driverName`.
- Generate `internalCode` on the server when a truck is created; users do not enter or edit it.
- Registration number must be unique after normalization.
- Assigned officer must be active and have the `fleetOfficer` role.
- A truck with an active queue cycle cannot be deactivated.
- Reactivating an inactive truck returns it to `ON_TRIP`.
- Write an immutable audit event.

### batchSaveTrucks

Called by administrator after a CSV file is parsed and previewed by the web client.

Rules:

- Accept between 1 and 100 new trucks per call.
- Require registration number, driver name, and active fleet officer for every row.
- The batch template has no status column. Every successfully created batch truck starts active with server-controlled `ON_TRIP` status.
- Reject the complete batch before writing if any registration is duplicated within the file or already exists in the site.
- Generate every `internalCode` on the server.
- Create all trucks and their audit events in one Firestore transaction.
- Record `BATCH_CSV` and the original CSV row number in audit metadata.

### reportTruckReturn

Called by fleet officer.

Input:

```ts
{
  siteId: string;
  truckId: string;
}
```

Rules:

- User must be assigned fleet officer for the truck, unless administrator override flow is explicitly used.
- Truck must be active.
- Truck must not already have an active cycle.
- Truck should normally be `ON_TRIP`.
- Function uses server timestamp.
- Function checks latest valid insurance.
- If insurance valid, create `queueCycle` with `QUEUED` and `queueEnteredAt`.
- If insurance expired, create `queueCycle` with `INSURANCE_HOLD` and no FIFO priority.
- Update truck `currentStatus` and `activeCycleId`.
- Write audit events.

Output:

```ts
{
  cycleId: string;
  truckId: string;
  status: "QUEUED" | "INSURANCE_HOLD";
  queuePosition?: number;
  queueEnteredAt?: string;
  insuranceStatus: "VALID" | "EXPIRING_SOON" | "EXPIRED";
}
```

Offline mobile returns must not reserve queue position. If the app is offline, show pending sync. The truck joins the queue only when this function succeeds.

### getQueuePosition

Can be function or client query backed by rules.

Input:

```ts
{
  siteId: string;
  queueCycleId: string;
}
```

Calculate position by counting active queued cycles with earlier `queueEnteredAt`. Do not store mutable position.

### listValidatedBypasses

Called by programming officer.

Returns only validated, unexpired authorizations whose truck is still in the active queue. The response contains safe programming fields such as authorization ID, truck, driver, queue cycle, current queue position, and expiry. It must never return `otpHash` or expose the authorization document directly to the programming client.

### previewProgrammingBatch

Called by programming officer.

Input:

```ts
{
  siteId: string;
  requestedSize: number;
  includeBypassAuthorizationIds?: string[];
}
```

Rules:

- `requestedSize` minimum 1.
- `requestedSize` cannot exceed available queued trucks plus valid included bypasses.
- Normal selection is automatic FIFO.
- User cannot manually choose arbitrary trucks.
- If no bypass included, select #1 through #N.
- If one approved bypass is included in a batch of 20, select #1 through #19 plus bypass truck.
- The displaced FIFO truck, such as old #20, remains queued and keeps its relative FIFO priority.
- Authorized bypass must be active, validated, unexpired, unused, bound to that truck and cycle, and approved for the same site.
- Preview is informational and must be revalidated during confirmation.
- After preview, the selected list is locked in FIFO order. The programming officer types an externally issued ATC number beside each truck or batch-pastes one ATC number per line in the same order.
- Users cannot reorder, replace, or manually select normal FIFO trucks while entering ATC numbers.

Output:

```ts
{
  requestedSize: number;
  fifoCount: number;
  bypassCount: number;
  items: Array<{
    truckId: string;
    queueCycleId: string;
    batchOrder: number;
    selectionType: "FIFO" | "BYPASS";
    originalQueuePosition: number;
    queueEnteredAt: string;
    bypassAuthorizationId?: string;
    numberOfTrucksBypassed?: number;
  }>;
  displacedFifoTruckIds: string[];
}
```

### confirmProgrammingBatch

Called by programming officer.

Input:

```ts
{
  siteId: string;
  requestedSize: number;
  includeBypassAuthorizationIds?: string[];
  atcAssignments: Array<{
    queueCycleId: string;
    atcNo: string;
  }>;
  previewToken?: string;
}
```

Rules:

- Must run in a Firestore transaction.
- Recompute the selection inside the transaction.
- Verify every selected cycle is still queued.
- Verify each selected truck still has valid insurance.
- Verify included bypass authorizations are still valid.
- Require exactly one non-empty ATC number for every selected queue cycle.
- Trim and normalize ATC values to uppercase. The queue system records ATCs but does not generate them.
- Copy the ATC number to the programming item and queue cycle in the same transaction that confirms the batch.
- Create programming batch and items.
- Change selected queue cycles to `PROGRAMMED`.
- Set `queueExitAt`, `programmedAt`, `programmingBatchId`, and `programmingType`.
- Update selected trucks to `PROGRAMMED`.
- Mark bypass authorizations as `USED` only when the batch is confirmed.
- Mark associated bypass requests as `USED`.
- Create audit events for batch and each truck.

Output:

```ts
{
  batchId: string;
  humanCode: string;
  confirmedSize: number;
  fifoCount: number;
  bypassCount: number;
  atcCount: number;
}
```

### requestBypass

Called by fleet officer.

Input:

```ts
{
  siteId: string;
  truckId: string;
  queueCycleId: string;
  reasonCategory: string;
  explanation: string;
}
```

Rules:

- Truck must belong to requesting fleet officer.
- Truck must be queued.
- If truck is #1, bypass is unnecessary and should not proceed.
- Function calculates queue position and number of trucks bypassed.
- Explanation is required.
- One active pending request per truck/cycle unless prior request is rejected, expired, cancelled, or used.
- Write audit event.
- Notify overseers.

Output:

```ts
{
  bypassRequestId: string;
  queuePositionAtRequest: number;
  numberOfTrucksBypassed: number;
  status: "PENDING";
}
```

### approveBypass

Called by overseer.

Input:

```ts
{
  siteId: string;
  bypassRequestId: string;
}
```

Rules:

- Overseer cannot approve their own request.
- Request must be pending.
- Truck and cycle must still be queued.
- Recalculate current queue position and bypass count.
- Generate six-digit OTP.
- Store only hash.
- Set authorization expiry to 10 minutes from server time.
- Mark request approved and link authorization.
- Write audit events.
- Return plaintext OTP only once to the overseer response.
- Notify requesting fleet officer that bypass was approved.

Output:

```ts
{
  bypassRequestId: string;
  authorizationId: string;
  otp: string;
  expiresAt: string;
  truckId: string;
}
```

### rejectBypass

Called by overseer.

Input:

```ts
{
  siteId: string;
  bypassRequestId: string;
  rejectionReason: string;
}
```

Rules:

- Request must be pending.
- Rejection reason is required.
- Write audit event.
- Notify requesting fleet officer.

### validateBypassOtp

Called by requesting fleet officer.

Input:

```ts
{
  siteId: string;
  truckId: string;
  otp: string;
}
```

Rules:

- The officer selects the truck and enters the OTP; the client never sends or displays a bypass request ID for validation.
- Resolve exactly one approved bypass request for that truck and requesting fleet officer. Keep its request ID internal for authorization binding and audit events.
- Authorization must exist, be active, unexpired, and bound to truck/request/officer.
- Hash must match.
- Limit repeated failed attempts to five per authorization. Revoke the
  authorization when the fifth incorrect attempt is recorded.
- On success, set authorization status to `VALIDATED`.
- Do not mark as `USED` until `confirmProgrammingBatch` consumes it.
- Write audit event.

Output:

```ts
{
  authorizationId: string;
  status: "VALIDATED";
  expiresAt: string;
}
```

### uploadDispatchReport

The authorized client uploads the workbook through the Railway API to the private Railway Bucket. The API calculates and persists the SHA-256 checksum before registering the immutable import.

Input:

```ts
{
  siteId: string;
  importId: string;
  storagePath: string;
  originalFileName: string;
  contentType: string;
  fileSize: number;
  checksum: string;
}
```

Rules:

- Only programming officers and administrators can upload.
- Accept `.xlsx` for MVP.
- Require the path `sites/{siteId}/dispatch/{year}/{month}/{importId}/{fileName}`.
- Verify the Storage object exists and its size and checksum metadata match the request.
- Limit the workbook to 20 MB.
- Create `dispatchImport` with status `UPLOADED`.
- Write audit event.

### processDispatchImport

Called by the authorized client immediately after `uploadDispatchReport`. Processing is idempotent for a completed import and claims an uploaded or failed import as `PROCESSING` before reading the file. The implementation uses `read-excel-file` for `.xlsx` parsing.

Rules:

- Validate expected spreadsheet structure.
- Extract rows.
- Normalize registration numbers.
- Normalize dates.
- Preserve raw values.
- Match truck by normalized plate.
- Match the entered ATC number against queue cycles whose status is `PROGRAMMED`.
- Require the dispatch truck plate to match the truck tied to that same programmed ATC.
- Create dispatch records.
- Update matched programmed cycles to `DISPATCHED`.
- Update matched trucks to `ON_TRIP`.
- Flag programmed but not dispatched.
- Flag dispatched without programming.
- Flag unknown trucks.
- Flag duplicates.
- Create a `PROGRAMMED_NOT_DISPATCHED` record for each still-programmed cycle absent from the report.
- Only `MATCHED` records may update a queue cycle to `DISPATCHED` and its truck to `ON_TRIP`.
- Claim all exact matches in a Firestore transaction that rechecks cycle status, ATC number, and truck assignment. A retry may reuse cycles already claimed by the same import, but a different import must never confirm them twice.
- Write one immutable audit event for every confirmation or discrepancy.
- Create summary counts.
- Write audit events.

Output:

```ts
{
  importId: string;
  status: "PROCESSED";
  rowsProcessed: number;
  matchedCount: number;
  programmedNotDispatchedCount: number;
  dispatchedNotProgrammedCount: number;
  truckMismatchCount: number;
  unknownTruckCount: number;
  duplicateRowCount: number;
}
```

### updateInsurance

Called by administrator or authorized insurance user.

Input:

```ts
{
  siteId: string;
  truckId: string;
  policyNumber: string;
  provider: string;
  effectiveDate: string;
  expiryDate: string;
  documentPath?: string;
}
```

Rules:

- Create new insurance record.
- Update truck latest insurance summary.
- If truck is on insurance hold and the new policy is valid, apply MVP re-entry policy with server timestamp as new `queueEnteredAt`.
- Write audit events.
- Notify fleet officer if status changes.

### expireInsurance

Scheduled daily. Recalculate current insurance status from the latest insurance record. If a queued truck has expired insurance, move its active cycle to `INSURANCE_HOLD`, remove its FIFO priority timestamp, update the truck summary, notify the assigned fleet officer, and write an audit event.

### correctRecord

Called by administrator.

Input:

```ts
{
  siteId: string;
  targetPath: string;
  correctionType: string;
  previousValue: unknown;
  correctedValue: unknown;
  reason: string;
}
```

Rules:

- Must require a reason.
- Must not directly edit audit events.
- Must preserve previous state.
- Must write `RECORD_CORRECTED` audit event.
- Prefer corrective state transitions over destructive edits.

## 11. Firestore Security Rules Requirements

Security rules are a guardrail. The Railway API is the authority for business logic.

Rules must enforce:

- signed-in users only;
- active user profile required;
- users can only access their site;
- fleet officers can read assigned trucks and safe queue views;
- fleet officers cannot write `queueCycles` directly;
- programming officers cannot manually create programming batch items directly;
- overseers cannot approve by writing bypass docs directly;
- clients cannot set `queueEnteredAt`;
- clients cannot set `programmedAt`;
- clients cannot mark dispatch confirmed;
- clients cannot create or edit audit events;
- normal users cannot read OTP hashes;
- dispatch files are readable only by authorized roles;
- write access to Storage is restricted by path, file type, and role.

Recommended pattern:

- Clients create no direct operational or device-token writes.
- Railway uses the Firebase Admin SDK and bypasses rules only after checking Firebase token claims and authorization.
- Firestore rules allow role-appropriate reads and deny consequential client writes.

Minimum examples to enforce:

```text
users:
  user may read self
  administrators may manage users through functions only

trucks:
  fleet officer may read assigned trucks
  operations roles may read active trucks
  client writes denied except non-consequential fields explicitly approved

queueCycles:
  readable by operations roles
  fleet officer may read assigned cycles
  direct client creates/updates/deletes denied

programmingBatches:
  readable by operations, management, audit
  direct client writes denied

bypassRequests:
  fleet officer may read own requests
  overseer may read pending requests
  direct client writes denied

bypassAuthorizations:
  do not expose otpHash to clients
  direct client writes denied

auditEvents:
  read by management/auditor/admin as permitted
  all client writes denied
  all client deletes denied

dispatchImports / dispatchRecords:
  read by authorized roles
  all Firestore client writes denied; source workbook upload is controlled by Storage rules
```

## 12. Storage Rules Requirements

Use private Railway Bucket object keys like:

```text
sites/{siteId}/dispatch/{yyyy}/{mm}/{importId}/{originalFileName}
sites/{siteId}/insurance/{truckId}/{insuranceRecordId}/{fileName}
```

Rules:

- Dispatch uploads only from programming officers and administrators. Management and auditors have read-only access.
- Insurance document uploads only from authorized insurance/admin roles.
- Files cannot be overwritten after processing unless correction flow creates a new version.
- Restrict upload content type and extension where possible.
- Enforce size limits appropriate for Excel dispatch reports and insurance PDFs/images.
- Do not allow public reads.

## 13. UX Requirements

The UI should feel like an industrial operations control system:

- calm during normal operation;
- obvious when exceptions occur;
- dense enough for operations staff to scan many trucks;
- simple enough for field and supervisory users to use quickly on mobile;
- neutral, readable, and low-distraction;
- no fake refinery branding.

Use color mainly for operational meaning:

- normal/valid/queued: green or neutral positive;
- programmed: blue;
- insurance warning: amber;
- insurance hold or critical exception: red;
- approved bypass: distinct accent;
- on trip or historical: grey.

Truck registration numbers must be visually prominent.

### Web Navigation

Recommended sections:

```text
Operations
  Overview
  Live Queue
  Programming
  Dispatch Reconciliation

Fleet
  Trucks
  Insurance

Controls
  Bypass Requests
  Audit Log

Reports
  Operations Reports
  Exports

Administration
  Users
  Fleet Assignments
  Configuration
```

Navigation is role-based.

### Operations Overview

Show:

- queued trucks;
- programmed trucks;
- trucks on trip;
- insurance holds;
- FIFO compliance;
- bypasses today;
- dispatch exceptions;
- first five queue entries;
- recent exceptions;
- insurance attention.

### Live FIFO Queue

Primary table columns:

- position;
- truck;
- driver;
- fleet officer;
- queue entry;
- waiting time;
- insurance;
- status.

The #1 truck should be visually emphasized. Users must not be able to manually sort the table in a way that suggests FIFO order changed. Search and filters are allowed, but the canonical queue order must remain clear.

Clicking a truck opens a right-side drawer with:

- status;
- driver name;
- assigned fleet officer;
- insurance;
- current cycle;
- timeline;
- dispatch history;
- insurance records;
- bypass history;
- role-based actions.

### Programming

Programming must be batch-based.

Flow:

```text
Programming officer enters batch size
  -> Preview Batch
  -> system automatically selects next N FIFO trucks
  -> optional valid bypass inclusion
  -> Confirm Programming
  -> batch committed transactionally
```

For a request of 20 trucks, normal selection is #1 through #20.

If truck #37 has valid approved bypass authorization and is included in a 20-truck batch, the selected batch is:

```text
#1 through #19
+ truck #37
```

Truck #20 remains queued. It should become the first truck in the remaining queue after #1 through #19 are removed.

The UI must explain:

```text
Including this bypass removes the current FIFO truck #20 from this batch only. It retains its place at the head of the remaining queue.
```

Programming success shows:

- batch ID;
- confirmed size;
- FIFO count;
- bypass count;
- link to batch detail;
- return to queue action.

### Bypass Request

Fleet officer selects a queued assigned truck.

Screen must show:

- truck registration;
- driver name;
- current queue position;
- number of trucks ahead;
- number of trucks that would be bypassed;
- reason dropdown;
- required explanation;
- permanent audit notice.

Recommended reasons:

- operational requirement;
- destination-specific requirement;
- emergency movement;
- customer requirement;
- management instruction;
- other.

### Overseer Approval

Overseer review must show:

- truck;
- driver name;
- requesting fleet officer;
- current queue position;
- trucks being bypassed;
- queue entry time;
- reason;
- explanation;
- requested time.

Actions:

- reject, requiring reason;
- approve, requiring confirmation.

After approval, show OTP prominently:

```text
482 193
Valid for 10 minutes
For this truck only
Single use
```

### Fleet Officer OTP Entry

Fleet officer enters the OTP for the approved truck. On success, show:

```text
Bypass authorization confirmed.
Truck is available for exceptional programming until consumed or expired.
```

### Dispatch Upload and Reconciliation

Web upload accepts `.xlsx`.

After processing, show:

- rows processed;
- matched;
- programmed but not dispatched;
- dispatched without programming;
- unknown trucks;
- duplicate rows.

Reconciliation tabs:

- matched;
- programmed/not dispatched;
- dispatched/not programmed;
- truck mismatch;
- unknown truck;
- duplicate rows.

`DISPATCHED_NOT_PROGRAMMED` is a critical exception.

### Mobile Access Model

Mobile is role-based. It is not only for fleet officers.

Fleet officers also have a focused responsive web workspace. Mobile is their primary field experience; web supports the same assigned-fleet actions when they are working from an office or shared workstation. Both clients call the same Firebase Functions and are restricted to the same assigned trucks, own queue cycles, own bypass requests, and OTP validations. The web workspace must not expose programming, dispatch, other officers&apos; trucks, audit administration, or management reporting to a fleet-only user.

The mobile app should support:

- fleet officers reporting returns, viewing assigned trucks, requesting bypass, and entering OTP;
- overseers reviewing bypass requests, approving or rejecting requests, and viewing generated OTPs;
- management checking queue status, alerts, bypass activity, insurance exposure, and dispatch exceptions remotely;
- auditors or administrators viewing limited mobile-friendly records only where useful;
- programming officers viewing queue and batch status if required by operations.

Fleet officers are expected to be the heaviest daily mobile users because return reporting and truck status checks happen in the field. Overseers are also first-class mobile users because bypass approvals and OTP display should be fast and reliable.

Full batch programming should be web-first for MVP unless operations explicitly requires mobile confirmation. Programming affects multiple trucks at once, so the desktop/control-room flow should be the primary implementation. If mobile programming is added, it must use the same Cloud Function contracts, confirmation steps, bypass controls, and audit trail as web.

Mobile must not be a squeezed desktop dashboard. It should be action-oriented, role-aware, and limited to the decisions each user can responsibly make from a phone.

### Mobile Fleet Officer Home

Fleet officer home:

- total assigned trucks;
- queued;
- on trip;
- programmed;
- insurance hold;
- next assigned truck in queue;
- report return;
- view queue;
- request bypass;
- insurance attention.

### Mobile Report Return

Flow:

```text
Report Return
  -> select assigned truck currently ON_TRIP
  -> view status and insurance
  -> Confirm Return
  -> success with queue position or insurance hold
```

Keep this to a few taps.

### Mobile Queue

Show stacked rows rather than a desktop table.

Each row:

- position;
- truck registration;
- driver name;
- fleet officer;
- waiting time;
- highlight if it is the logged-in fleet officer's truck.

### Mobile Overseer Approvals

Show pending approval count and a list of requests with:

- truck;
- position;
- trucks bypassed;
- requesting officer;
- reason.

Tapping opens the full approval screen.

### Mobile Management View

Management mobile access should provide a compact status view:

- current queue count;
- first few trucks in queue;
- FIFO compliance;
- bypasses today;
- pending/approved bypasses;
- insurance holds and expiries;
- dispatch exceptions;
- critical alerts.

Management mobile users should not need the full desktop analytics workspace on a phone. Keep it focused on operational status and exceptions.

### Mobile Programming View

Programming officer mobile access may show:

- live queue;
- recently programmed batches;
- batch detail;
- dispatch status for programmed trucks;
- bypass authorization status.

For MVP, batch preview and confirmation should be implemented web-first. Mobile batch confirmation is optional and should only be enabled if explicitly required by operations.

## 14. Notifications

Use FCM and in-app notification documents.

Every notification is first written to `sites/{siteId}/notifications/{notificationId}` with `deliveryStatus: "PENDING"`. A Firestore `onDocumentCreated` function transactionally claims it as `SENDING`, sends the push message to all active device registrations for the target user, then records `SENT`, `PARTIAL`, `FAILED`, or `NO_DEVICES` with success/failure counts and a server timestamp. Duplicate events must not resend completed notifications, and an abandoned claim may be reclaimed after five minutes. Permanently invalid FCM tokens are removed and deactivated. Never place raw FCM tokens in notifications, audit events, or logs.

Mobile registers the FCM token after authentication and notification permission, using the Firebase Installation ID as `deviceId`, and refreshes the registration when FCM rotates the token. The app must unregister the device before an explicit sign-out when a sign-out flow is added.

React Native Firebase messaging requires a native Expo development/production build; it does not run in Expo Go. Supply the same Firebase project's `google-services.json` and `GoogleService-Info.plist`, then rebuild the native client after installing or changing Firebase native modules.

Notify:

- fleet officer when return enters queue;
- fleet officer when return goes to insurance hold;
- fleet officer when insurance expires soon;
- overseer when bypass request is submitted;
- fleet officer when bypass is approved or rejected;
- fleet officer when OTP is nearing expiry;
- relevant roles when programming batch completes;
- relevant roles when dispatch discrepancies are found.

SMS, email, or WhatsApp are optional later channels. OTP must not depend on SMS.

## 15. Edge Cases and Required Behavior

### Duplicate Return Report

If a truck already has an active cycle, reject a new return report.

### Truck Already Queued

Prevent second queue entry.

### Truck Programmed Twice

Use transaction checks to prevent duplicate programming.

### Concurrent Programming

If two programming officers confirm at the same time, only one transaction should commit the selected cycles. The other must retry or return a stale-preview error.

### Insurance Expires While Queued

Scheduled function moves truck/cycle to `INSURANCE_HOLD` and removes it from active FIFO selection.

### Insurance Renewed After Hold

For MVP, restored validity creates a fresh queue-entry timestamp.

### Offline Return Report

Mobile may store a pending local action, but official queue position is assigned only after server confirmation.

### OTP Incorrect

Reject, increment failed attempts, audit the failure, and rate-limit repeated attempts.

### OTP Expired

Reject. Require new approval or new authorization according to policy.

### OTP Already Used

Reject permanently.

### OTP Validated But Not Programmed

Authorization remains valid only until expiry. If it expires before programming, it cannot be used.

### Bypass Request While Truck Is #1

Bypass is unnecessary. Do not create approval workflow.

### Bypass Included in Batch

The bypass truck replaces the last FIFO slot that would have been included in the batch. Skipped trucks retain relative order.

### Programmed But Not Dispatched

Flag as investigation item during reconciliation.

### Dispatched Without Programming

Flag as critical exception.

### Unknown Dispatch Registration

Do not ignore. Place in unknown truck review.

### Duplicate Dispatch Rows

Detect probable duplicates using dispatch identifiers and normalized plate.

### PIF Failure

PIF remains outside MVP system control. If a programmed truck fails PIF and needs to return to the queue, implement a controlled correction or explicit `PIF_HOLD` policy only after management confirms the final rule. Do not invent a silent re-entry behavior.

## 16. Metrics and Reporting

MVP management metrics:

- current queued trucks;
- programmed today;
- dispatched today;
- trucks on trip;
- insurance holds;
- FIFO compliance percent;
- bypass requests/approvals/usage;
- bypasses by fleet officer;
- bypasses by overseer;
- average queue waiting time;
- longest current waiting trucks;
- dispatch exceptions;
- insurance expiring within 30, 14, 7, and 1 day.

FIFO compliance:

```text
normal FIFO selections / total programming selections
```

Bypass selections are legitimate exceptions when approved and consumed through the OTP workflow. They should still be counted and visible.

Do not compute dashboards by scanning all historical audit events on every load. Maintain `dailyMetrics` and summary documents via functions.

## 17. Testing Requirements

Add tests for business rules before building broad UI polish.

Minimum backend/function tests:

- fleet officer can report return for assigned truck;
- fleet officer cannot report return for unassigned truck;
- expired insurance creates insurance hold;
- valid insurance creates queued cycle;
- queue order uses server timestamps;
- duplicate active cycle is rejected;
- preview batch selects #1 through #N;
- confirm batch transaction moves all selected cycles to programmed;
- concurrent batch confirmation does not program the same cycle twice;
- bypass request records queue position and number bypassed;
- overseer cannot approve own request;
- approve bypass returns OTP once and stores only hash;
- wrong OTP fails and increments attempts;
- expired OTP fails;
- validated OTP can be included in batch;
- bypass truck replaces final FIFO slot in batch;
- displaced FIFO truck remains queued;
- dispatch importer matches normalized plates;
- dispatch importer flags unknown trucks;
- dispatch importer flags dispatched-without-programming;
- audit events are written for consequential actions.

Minimum security rules tests:

- unauthenticated users cannot read operational data;
- fleet officers read only permitted assigned/private data plus safe queue views;
- clients cannot create queue cycles directly;
- clients cannot update queue timestamps;
- clients cannot create programming batches directly;
- clients cannot write audit events;
- normal users cannot read OTP hashes;
- cross-site access is denied.

Minimum frontend tests:

- fleet officer return flow;
- queue screen shows canonical FIFO order;
- programming preview shows correct count and positions;
- bypass inclusion explanation appears;
- overseer approval displays number of trucks bypassed;
- dispatch reconciliation tabs show category counts.

## 18. Implementation Order

Build in this order.

### Phase 0: Project Foundation

- Scaffold monorepo.
- Configure Firebase project aliases for development, staging, and production.
- Set up Firebase Auth emulator, Firestore emulator, Functions emulator, and Storage emulator.
- Add shared TypeScript types and validation schemas.
- Add role constants and error-code conventions.
- Add seed data for users, trucks, insurance, and queue cycles.

### Phase 1: Auth, Roles, and Rules Baseline

- Implement Firebase Auth integration.
- Mirror users into Firestore.
- Add custom claims for roles and site access.
- Write initial Firestore and Storage rules.
- Add security rules tests.

### Phase 2: Truck Registry and Insurance

- Build truck registration model.
- Include driver name on truck records and truck-facing UI.
- Implement normalized registration helper.
- Implement insurance record creation.
- Implement latest insurance status summary.
- Implement scheduled insurance expiry check.
- Add web admin screens for trucks and insurance.
- Add validated CSV batch registration with a downloadable template and preview.

### Phase 3: Return Reporting and FIFO Queue

- Implement `reportTruckReturn`.
- Implement active queue query.
- Implement queue position calculation.
- Build mobile report-return flow.
- Build web and mobile live queue views.
- Confirm server timestamp behavior.

### Phase 4: Batch Programming Vertical Slice

- Implement `previewProgrammingBatch`.
- Implement `confirmProgrammingBatch`.
- Create programming batch and item records.
- Build web programming screen.
- Add transaction/concurrency tests.

This phase proves the core system:

```text
Login
  -> fleet officer reports return
  -> function validates truck and insurance
  -> server timestamp creates queue entry
  -> live FIFO queue updates
  -> programming officer requests next 20
  -> backend selects #1 through #20
  -> programming officer enters one externally issued ATC for each truck in the locked order
  -> batch is committed
  -> audit events are created
```

### Phase 5: Bypass and OTP

- Implement bypass request.
- Implement overseer approval/rejection.
- Implement OTP generation, hashing, validation, expiry, and attempt limits.
- Implement bypass inclusion in programming batch.
- Build mobile and web bypass screens.
- Add notifications.

### Phase 6: Dispatch Reconciliation

Implemented in the current repository:

- Dispatch upload to Storage with path, size, type, and SHA-256 validation.
- Excel parser for the known column structure.
- ATC-plus-normalized-truck matching against programmed queue cycles.
- All six reconciliation categories and immutable audit records.
- Exact-match updates to `DISPATCHED` and `ON_TRIP` only.
- Dispatch import result screen, summary counters, upload dialog, and review tabs.

### Phase 7: Audit and Management Reporting

Implemented in the current repository:

- A role-protected Audit Log with event-type filtering, search, and CSV export. Only management, auditors, and administrators can see the navigation item in a live session.
- A management Operations Overview with daily queue, programming, dispatch, insurance, FIFO, bypass, and exception metrics; first five FIFO entries; recent exceptions; and insurance attention.
- `recalculateDailyMetrics(siteId, date?)` for management or administrators, plus a nightly `refreshDailyMetrics` scheduled function at 23:55 Africa/Lagos.
- Metrics are stored in `sites/{siteId}/dailyMetrics/{yyyyMMdd}`, are based on authoritative trucks, queue cycles, and that day&apos;s audit events, and do not recalculate FIFO order from audit history at page-load time.
- CSV export for the currently filtered audit-log result set.

### Phase 8: Hardening

Implemented in the current repository:

- Firestore rules reviewed and an isolated emulator suite proves anonymous access is denied, fleet officers can only read assigned trucks and queue cycles, operational roles have the expected read scope, and clients cannot write queue, programming, dispatch, audit, or metric records directly.
- Local web emulator support via `NEXT_PUBLIC_USE_EMULATORS=true`; it connects Auth, Firestore, Functions, and Storage to the configured local emulator ports.
- A GitHub Actions verification workflow runs typechecking, unit tests, and Firestore-rule tests on pull requests and `main` pushes.
- `docs/OPERATIONS_RUNBOOK.md` defines production monitoring signals, alert thresholds, budget-alert setup, backup/restore practice, deployment gates, and incident handling.

Before the first production deployment, a Firebase/Google Cloud administrator must create the alert policies, budgets, and backup/PITR configuration described in the operations runbook. These require access to the real production project and cannot be safely created from source code alone.

### Phase 9: Fleet Officer Web And Mobile Access

Implemented in the current repository:

- Responsive `My Fleet` web workspace available in the preview, and shown as the only navigation for a signed-in fleet-only role.
- Web return reporting, bypass request, and OTP validation use the established protected Function contracts; no client writes operational queue records directly.
- Fleet-only web reads are scoped to the signed-in officer&apos;s assigned trucks and own queue cycles. Queue positions are returned by the existing server-side `getQueuePosition` callable.
- Mobile Home now loads the same assigned-fleet summary, with working `Report Return` and `My Queue` routes. The existing mobile bypass and OTP flows receive the selected truck and queue-cycle context.
- `pnpm test:workflow` runs the combined return, FIFO, bypass approval, OTP validation, ATC programming, Excel dispatch upload, reconciliation, and audit-trail path through the Firestore and Storage emulators. The CI workflow runs it alongside type, behavior, and security-rule checks.

## 19. Environment and Operations

Use separate Firebase projects:

```text
development
staging
production
```

Never test new FIFO or bypass rules against production data.

Production must have:

- billing enabled with budget alerts;
- Firestore backup/PITR strategy where available;
- Railway Bucket retention policy for dispatch source files;
- Cloud Function error logging;
- alerting for failed dispatch import;
- alerting for repeated function errors;
- alerting for backup failures;
- controlled admin access;
- documented data export process.

Recommended initial budget alerts:

- 10 USD;
- 25 USD;
- 50 USD;
- 100 USD.

## 20. Acceptance Criteria

The implementation is not ready until these are true:

- A fleet officer can report a returned assigned truck from mobile.
- The backend, not the device, assigns the queue timestamp.
- A valid-insurance truck enters the queue.
- An expired-insurance truck goes to insurance hold.
- The live queue orders trucks by `queueEnteredAt`.
- No user can manually edit queue position.
- A programming officer can preview and confirm the next N trucks as a batch.
- Every programmed truck has its externally issued ATC number recorded against the programming item and queue cycle.
- Programming never generates ATC numbers and does not allow normal FIFO trucks to be reordered or substituted during ATC entry.
- Batch truck import requires registration, driver name, and fleet officer only; it does not include a status column.
- A 20-truck batch selects #1 through #20 by default.
- A valid bypass can replace the final FIFO slot in a batch.
- The displaced FIFO truck remains queued with its relative priority.
- A bypass requires request, overseer approval, OTP generation, OTP validation, and audit.
- OTP is single-use, short-lived, bound to the truck/request/cycle, and stored only as a hash.
- Dispatch `.xlsx` uploads are stored and processed.
- Dispatch rows match registered trucks by normalized registration.
- Reconciliation flags programmed-not-dispatched, dispatched-not-programmed, truck mismatch, unknown truck, and duplicate rows.
- Audit events exist for every consequential action.
- Firestore rules prevent direct client writes to consequential records.
- Management can see current queue, FIFO compliance, bypass counts, insurance exposure, and dispatch exceptions.

## 21. Final Instruction to Codex

Build the product described here. Do not replace FIFO with scoring. Do not make bypass a casual manual override. Do not let users manually select arbitrary trucks for normal programming. Do not store plaintext OTPs. Do not let clients write queue, programming, dispatch, or audit state directly.

The most important first deliverable is a working vertical slice that proves manipulation-resistant FIFO batch programming:

```text
Auth
  -> return reporting
  -> insurance validation
  -> server-timestamped queue entry
  -> live queue
  -> preview next N
  -> confirm batch
  -> audit events
```

Only after that slice is correct should the build expand into bypass/OTP, dispatch reconciliation, and management analytics.
