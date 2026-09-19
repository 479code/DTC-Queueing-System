# Operational API Contracts

The contracts in `CODEX_HANDOFF.md` are authoritative. All consequential writes
go through the Railway API. The API verifies a Firebase ID token, derives the
site and role claims from that token, and executes the same validated operation
handlers used by local Firebase emulator tests.

## Operational Endpoints

Each operation is invoked with `POST /v1/operations/{operationName}`, a bearer
Firebase ID token, and the documented JSON input as the request body. A success
response is `{ "data": ... }`; errors are `{ "error": { "code", "message" } }`.

Firebase callable wrappers remain only for local emulator compatibility during
the migration. Production clients use the Railway endpoint.

- `reportTruckReturn`
- `getQueuePosition`
- `saveTruck`
- `batchSaveTrucks`
- `listValidatedBypasses`
- `previewProgrammingBatch`
- `confirmProgrammingBatch`
- `startAvailabilityBatch`
- `confirmTruckAvailability`
- `getAvailabilityBatch`
- `confirmProgrammingWithOrders`
- `requestBypass`
- `approveBypass`
- `rejectBypass`
- `validateBypassOtp`
- `uploadDispatchReport`
- `processDispatchImport`
- `uploadOrderWorkbook`
- `processOrderImport`
- `listAvailableOrders`

## Availability and order programming

`startAvailabilityBatch` selects the next FIFO batch (plus any already approved
bypass) and starts a one-hour availability window for every selected truck.
Only the fleet officer assigned to a truck can call `confirmTruckAvailability`.

When the worker detects an unconfirmed request after one hour, it offers the
open slot to the next eligible FIFO truck. Once that replacement confirms, the
timed-out truck is automatically returned to the back of the queue with a new
server timestamp. No user may manually select a replacement.

`uploadOrderWorkbook` and `processOrderImport` import the received `.xlsx`
workbook. Required columns are `ATC NO` and `SALES ORDER NO`. The importer
preserves the supplied ATC exactly and rejects duplicate ATCs. The programming
officer uses `confirmProgrammingWithOrders` to pair each confirmed FIFO truck
with one available imported order/ATC pair.
- `updateInsurance`
- `expireInsurance` (scheduled daily)
- `correctRecord`

## Push Registration

### `registerDeviceToken()`

Authenticated API operation. Registers only the calling user's installation.

```ts
input: {
  siteId: string;
  deviceId: string; // Firebase Installation ID
  fcmToken: string;
  platform: "android" | "ios";
  appVersion?: string;
}

output: {
  deviceId: string;
  registered: true;
}
```

The function verifies the caller's site and active user profile. If the token was previously attached to another user or installation, that older registration is deactivated so a signed-out user cannot continue receiving another user's notifications.

### `unregisterDeviceToken()`

Authenticated API operation. Deactivates only the calling user's installation and removes its FCM token.

```ts
input: {
  siteId: string;
  deviceId: string;
}

output: {
  deviceId: string;
  registered: false;
}
```

## Push Delivery Trigger

The Railway notification worker claims a new `sites/{siteId}/notifications/{notificationId}` record. It sends the title, body, and string-only routing identifiers to every active device registered for `userId`.

Delivery is split into groups of no more than 500 FCM tokens. The notification document is updated with:

```ts
deliveryStatus: "PENDING" | "SENDING" | "SENT" | "PARTIAL" | "FAILED" | "NO_DEVICES";
deliveryClaimedAt?: Timestamp;
deliveryAttemptedAt: Timestamp;
deliverySuccessCount: number;
deliveryFailureCount: number;
deliveryError?: string;
```

Permanently invalid or unregistered tokens are removed and their device registrations are deactivated. Raw FCM tokens must never be copied into notifications, audit events, or logs.

The trigger claims each notification transactionally before sending. Duplicate Firestore event deliveries cannot send a notification that is already complete; an abandoned `SENDING` claim can be reclaimed after five minutes.

Clients cannot read or write `users/{userId}/devices/{deviceId}` directly. Device registration and removal always use the operations above.
