# Security Rules

Firestore and Storage rules are guardrails. Cloud Functions enforce business rules.

Baseline principles:

- Signed-in active users only.
- Site access is mandatory.
- Role checks apply to every read.
- Direct client writes to operational state are denied.
- Clients cannot set `queueEnteredAt`, `programmedAt`, dispatch confirmation, bypass authorization, or audit events.
- OTP hashes are never exposed to normal client reads.

Use the emulator test suite before production deployment.
