# Firestore Model

This document is a working companion to `CODEX_HANDOFF.md`.

Canonical collections for MVP:

```text
sites/{siteId}
  users/{userId}
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

Do not store editable live queue positions. Derive queue order from active `queueCycles` sorted by `queueEnteredAt`.

Operational records may denormalize display-only names, including `assignedFleetOfficerName` on trucks, `fleetOfficerName` on queue cycles, and `requestedByName` on bypass requests. Cloud Functions maintain these values so clients can render permitted records without reading another user's private profile document.

Programming does not change FIFO selection. After the system selects the trucks, the programming officer types or batch-pastes one externally issued ATC number for each truck in the locked list. The ATC assignment is written transactionally to the programming item and queue cycle.
