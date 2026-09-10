# Refinery Truck FIFO Queue & Programming System

Firebase-native monorepo for the refinery truck FIFO queue, batch programming, bypass/OTP, insurance, dispatch reconciliation, and audit system.

Start with [docs/CODEX_HANDOFF.md](docs/CODEX_HANDOFF.md). It is the implementation source of truth.

## Stack

- Next.js web app on Firebase App Hosting
- React Native / Expo mobile app
- Firebase Auth
- Firestore
- Cloud Functions for Firebase
- Cloud Storage
- Firebase Cloud Messaging

## First Build Target

Build the vertical slice first:

```text
Auth
  -> return reporting
  -> insurance validation
  -> server-timestamped queue entry
  -> live FIFO queue
  -> preview next N trucks
  -> confirm programming batch
  -> audit events
```

## Local Development

Install dependencies after choosing the package manager:

```bash
pnpm install
```

Run Firebase emulators:

```bash
pnpm emulators
```

Run the Firestore security-rule tests in an isolated emulator:

```bash
pnpm test:rules
```

Run the combined fleet officer, bypass, OTP, programming, dispatch upload, and
reconciliation workflow through the Firestore and Storage emulators:

```bash
pnpm test:workflow
```

To make the web client use the local Firebase emulators, set
`NEXT_PUBLIC_USE_EMULATORS=true` alongside the Firebase client settings. Do not set
this value in a deployed environment.

Before running or deploying the bypass functions, configure the OTP hashing
secret with at least 32 random characters:

```powershell
firebase functions:secrets:set BYPASS_OTP_PEPPER
```

For local emulator work, provide the same secret through the Firebase Functions
secret override mechanism. Never commit its value.

## Mobile Push Setup

Firebase Cloud Messaging is connected through React Native Firebase. Add the mobile app credentials from the same Firebase project at:

```text
apps/mobile/google-services.json
apps/mobile/GoogleService-Info.plist
```

Push notifications require an Expo native development or production build; Expo Go cannot load the Firebase messaging native module. After adding credentials, rebuild the native client with Expo/EAS. Device tokens are registered only after sign-in and notification permission, and direct Firestore access to token documents is denied.

## Local Path Note

Next.js/Webpack production builds can fail on Windows if the absolute project path contains `!`, because Webpack reserves that character for loader syntax. This machine's user folder is `C:\Users\!admin`, so `apps/web` may type-check correctly but fail during `next build` from this exact path.

The active local development copy is `C:\dev\dtc-queueing-system`, where the
complete production build succeeds. Keep future development in that folder.
