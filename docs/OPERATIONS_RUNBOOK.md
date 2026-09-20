# Operations Runbook

## Current Order and Availability Workflow

Treat incoming `.xlsx` files as order-and-ATC workbooks, not dispatch reports.
Dispatch reports are no longer imported at all: a programming officer records a
dispatch with one click on the Programmed page, which returns the truck to
`ON_TRIP` and writes a `DISPATCH_CONFIRMED` audit event.
The required columns are `ATC NO` and `SALES ORDER NO`. Preserve the source
file in the private Railway Bucket and use the import result to resolve any
duplicate or malformed ATC before programming begins.

`AVAILABILITY_WINDOW_MINUTES` on the API service overrides the one-hour window
for rehearsal only, clamped between 1 and 240 minutes. Leave it unset in
production so the agreed one-hour rule applies.

The Railway worker checks availability requests continuously. After one hour,
it opens the slot to the next eligible FIFO truck. When that next truck
confirms, the timed-out truck is returned to the back of the list
automatically. Do not attempt to change queue states, nominate replacements,
or restore positions directly in Firestore.

## Before Production Deployment

1. Create separate Firebase projects for development, staging, and production. Do not deploy a test project with production credentials.
2. Set the production project in `.firebaserc`; replace every placeholder value before deployment.
3. Configure the `BYPASS_OTP_PEPPER` Firebase Functions secret separately in each environment. Never put it in an environment file, source code, browser variable, or dispatch spreadsheet.
4. Run `pnpm typecheck`, `pnpm test`, and `pnpm test:rules`. The rules suite starts an isolated Firestore emulator and proves client writes to queue, programming, dispatch, audit, and daily metric records are denied.
5. Run the full emulator suite for a final workflow check. Set `NEXT_PUBLIC_USE_EMULATORS=true` only for local work; it connects the web client to the local Auth, Firestore, Functions, and Storage emulators.
6. Deploy to staging, verify authorised role access and an order import through to dispatch confirmation end to end, then promote the same reviewed revision to production.

## Monitoring And Alerts

Configure these alert policies in the production Google Cloud project. Route critical alerts to the operational owner and the application owner.

| Signal | Trigger | Priority | First response |
| --- | --- | --- | --- |
| Callable Function errors | At least 1 error in 5 minutes for `confirmProgrammingWithOrders`, `startAvailabilityBatch`, `approveBypass`, or `validateBypassOtp` | Critical | Review the matching Cloud Logging entries; stop operational use of the failed workflow until the cause is understood. |
| Error rate | More than 5% of callable invocations fail over 5 minutes | High | Identify the affected callable and client release; roll back only after preserving audit evidence. |
| Scheduled metrics refresh | No successful `refreshDailyMetrics` run in 26 hours | High | Run `recalculateDailyMetrics` as an authorised management user after fixing the scheduler or configuration. |
| Order import failure | Any import reaches `FAILED` | High | Review the import error, preserve the source workbook, correct it, and submit a new import. Do not edit result rows directly. |
| Firestore backup failure | Any configured backup/export job fails | Critical | Investigate before the next scheduled backup and record resolution in the operational log. |

Railway captures API and worker execution logs. Keep Railway logging and Firebase Error Reporting enabled, and make the operation name, site ID, request ID, import ID, batch ID, and audit event ID available as structured context where applicable. Never log OTP values, OTP hashes, order workbook contents, or user credentials.

## Budget Controls

Enable billing budgets and email alerts for the production billing account. Start with alerts at 50%, 75%, 90%, and 100% of the approved monthly operating budget, then revise thresholds after the first month of real usage. A billing budget is an alerting control, not a technical spending cap; operational owners must investigate the source of unexpected usage promptly.

Review Firestore reads, Railway API/worker usage, Railway Bucket volume, and outbound network use monthly. Set a separate lower budget for staging to catch accidental load tests or import loops before they affect production spending.

## Backup And Restore

1. Enable the strongest Firestore backup or point-in-time recovery option available for the production location and retain it according to the refinery's data-retention policy.
2. Keep order source spreadsheets in the private Railway Bucket with a documented retention policy. Do not delete a source file merely because its import was rejected; it may be needed for investigation.
3. Test restoration at least quarterly in a separate recovery project. Restore data there first, verify document counts and sample audit trails, and obtain operational approval before any production recovery.
4. Never restore directly over live operational data during an active programming window. Pause affected operations, preserve current evidence, agree the recovery point, and announce the restored state before resuming.
5. Record every restore exercise and real recovery: initiator, approval, source backup, time range, validation result, and follow-up actions.

## Incident Handling

For a suspected incorrect queue, programming batch, bypass, insurance decision, or dispatch confirmation, preserve the current records and audit trail first. Use the approved correction workflow; do not change Firestore documents in the console. Escalate any possible unauthorised access by disabling the affected user, rotating relevant credentials, and reviewing Cloud Logging and audit events.
