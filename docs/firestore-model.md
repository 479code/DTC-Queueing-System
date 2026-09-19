# Firestore Model

This document is a working companion to `CODEX_HANDOFF.md`.

Canonical collections for MVP:

```text
sites/{siteId}
  users/{userId}
  trucks/{truckId}
  queueCycles/{cycleId}
  programmingBatches/{batchId}
  orderImports/{importId}
  orders/{orderId}
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

Operational records may denormalize display-only names, including `assignedFleetOfficerName` on trucks, `fleetOfficerName` on queue cycles, and `requestedByName` on bypass requests. The Railway API maintains these values so clients can render permitted records without reading another user's private profile document.

Programming does not change FIFO selection. The system requests one-hour availability confirmation for the selected trucks, then the programming officer links each confirmed truck with one imported order and its externally issued ATC number. The order, ATC, queue cycle, and programming item are written transactionally.

`queueCycles` may temporarily be `AWAITING_AVAILABILITY`, `READY_FOR_PROGRAMMING`, or `AWAITING_REPLACEMENT`. A timed-out cycle returns to `QUEUED` at the back of the list only after its replacement confirms.

`orderImports` retains each incoming workbook and its checksum. `orders` stores each imported ATC, sales order number, customer details, source row, raw data, and server-controlled status: `AVAILABLE` or `PROGRAMMED`.
