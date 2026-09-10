# Cloud Function Contracts

The contracts in `CODEX_HANDOFF.md` are authoritative. All consequential writes go through Cloud Functions.

## Operational Callables

- `reportTruckReturn`
- `getQueuePosition`
- `saveTruck`
- `batchSaveTrucks`
- `listValidatedBypasses`
- `previewProgrammingBatch`
- `confirmProgrammingBatch`
- `requestBypass`
- `approveBypass`
- `rejectBypass`
- `validateBypassOtp`
- `uploadDispatchReport`
- `processDispatchImport`
- `updateInsurance`
- `expireInsurance` (scheduled daily)
- `correctRecord`

## Push Registration

### `registerDeviceToken()`

Authenticated callable. Registers only the calling user's installation.

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

Authenticated callable. Deactivates only the calling user's installation and removes its FCM token.

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

`deliverNotification` runs when `sites/{siteId}/notifications/{notificationId}` is created. It sends the title, body, and string-only routing identifiers to every active device registered for `userId`.

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

Clients cannot read or write `users/{userId}/devices/{deviceId}` directly. Device registration and removal always use the callables above.
