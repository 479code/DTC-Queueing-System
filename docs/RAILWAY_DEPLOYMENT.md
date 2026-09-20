# Railway Deployment

## Production Boundary

Railway hosts the web application, the protected operational API, a private
order-file bucket, and scheduled/background work. Firebase provides
Authentication, Firestore, and Firebase Cloud Messaging. Firestore is the
single source of truth.

The browser and mobile app read authorised live views from Firestore. They send
every consequential action to Railway with a Firebase ID token. Railway verifies
that token, checks custom `siteId` and `roles` claims, applies the workflow, and
writes Firestore records transactionally.

## Railway Services

Create these services from this GitHub repository:

1. `web`: Next.js from `apps/web`.
2. `api`: Node 20 service from `apps/api` with health check `/health`.
3. `worker`: Node 20 worker for notification delivery and scheduled
   insurance/metrics tasks. It uses a Firestore lease so only one worker
   completes each daily job.
4. `order-files`: private Railway Bucket. Do not make this bucket public.

Deploy Railway services in its nearest available US Central region to keep them
close to Firestore `us-central1`.

## Service Commands

Use the repository root as the Railway service source. Set these commands in
each service so workspace packages are built in the right order:

| Service | Build command | Start command |
| --- | --- | --- |
| `web` | `corepack pnpm --filter @refinery/web build` | `corepack pnpm --filter @refinery/web start` |
| `api` | `corepack pnpm --filter @refinery/functions build && corepack pnpm --filter @refinery/api build` | `corepack pnpm --filter @refinery/api start` |
| `worker` | `corepack pnpm --filter @refinery/functions build && corepack pnpm --filter @refinery/worker build` | `corepack pnpm --filter @refinery/worker start` |

Each build script now builds the workspace packages it depends on, so a clean
Railway builder compiles `@refinery/shared`, `@refinery/types` and
`@refinery/validation` before the service itself. Without that step the
functions package compiles against missing declarations and fails with
`'data' is of type 'unknown'`.

Set the API health check path to `/health`. The worker is a background service
and does not expose a public domain.

## API Environment

Set these as Railway API variables. Do not commit them.

```text
NODE_ENV=production
PORT=<provided by Railway>
WEB_ORIGIN=https://<web-service-domain>
FIREBASE_SERVICE_ACCOUNT_JSON=<one-line Firebase service-account JSON>
BYPASS_OTP_PEPPER=<32+ random characters>
BUCKET=${{order-files.BUCKET}}
ACCESS_KEY_ID=${{order-files.ACCESS_KEY_ID}}
SECRET_ACCESS_KEY=${{order-files.SECRET_ACCESS_KEY}}
ENDPOINT=${{order-files.ENDPOINT}}
REGION=${{order-files.REGION}}
```

`FIREBASE_SERVICE_ACCOUNT_JSON` must belong to the `refinery-queue-dev` project
and be treated as a production secret. It lets Railway verify Firebase ID tokens
and write authorised Firestore records. Restrict access to the smallest group
that can operate the service.

The Bucket values are Railway Variable References from the `order-files`
Bucket. Do not copy Bucket credentials into web or mobile variables. Railway
Buckets are private and S3-compatible; the API validates and uploads each
workbook before it is registered as available order and ATC pairs.

Give the `worker` service the same `FIREBASE_SERVICE_ACCOUNT_JSON` value as the
API and set `WORKER_POLL_INTERVAL_MS=30000`. It does not need Firebase Storage
or Bucket credentials.

## Client Environment

Set the normal public Firebase web/mobile settings as already documented, plus:

```text
NEXT_PUBLIC_OPERATIONS_API_URL=https://<api-service-domain>
EXPO_PUBLIC_OPERATIONS_API_URL=https://<api-service-domain>
```

Never put the Firebase service-account JSON, OTP pepper, or Railway Bucket
credentials in a public `NEXT_PUBLIC_` or `EXPO_PUBLIC_` variable.

## Cutover Order

1. Deploy the API and verify `GET /health`.
2. Set `WEB_ORIGIN` to the Railway web domain.
3. Configure `NEXT_PUBLIC_OPERATIONS_API_URL` and
   `EXPO_PUBLIC_OPERATIONS_API_URL`.
4. Validate Firebase sign-in and a protected API call with a non-production
operator account.
5. Run the return, FIFO, bypass/OTP, programming/ATC, dispatch confirmation, and audit
workflow tests.
6. Configure the Railway Bucket references and validate an `.xlsx` upload through
the API, including a checksum mismatch rejection.
7. Deploy the worker and verify notification delivery plus scheduled insurance
and metrics work.
8. Remove production use of Firebase App Hosting, Cloud Functions, and Cloud
Storage only after the matching Railway capability has passed verification.

## Rollback

Keep the Firebase callable wrappers during the transition. If a Railway release
fails, remove the public Railway API URL from the web/mobile environment and
redeploy the prior client build. Firestore data is unchanged because both paths
use the same validated handlers and collections.
