# Access Framework

This project has the access framework in place. It does not create real users or send invitations yet.

## Source of truth

Each future person has two linked records:

1. A Firebase Authentication account, identified by its UID.
2. A Firestore profile at `sites/{siteId}/users/{uid}`.

The profile stores the person's name, optional email, roles, active state, and MFA requirement. The same `siteId` and roles are mirrored into Firebase custom claims for client navigation and authenticated API requests.

Railway checks both the token and the Firestore profile before it accepts a protected operation. An inactive profile, cross-site profile, or changed role set is rejected. Production web and mobile clients require the Railway operational API for protected actions; direct callable fallbacks are retained only for local development. Access updates revoke refresh tokens, so the affected person must sign in again.

## Roles

| Role | Access |
| --- | --- |
| `fleetOfficer` | My Fleet only: returns, availability confirmations, bypass requests, and OTP validation for assigned trucks. |
| `programmingOfficer` | Overview, Live Queue, Programming, and Orders & ATCs. |
| `overseer` | Overview, Live Queue, and Bypass Approvals. |
| `management` | Overview, Live Queue, and Audit Trail. |
| `auditor` | Overview, Live Queue, and Audit Trail. |
| `administrator` | Overview, Live Queue, Orders & ATCs, Trucks, Insurance, and Audit Trail. |

The web navigation reads the shared role policy. Firestore Rules limit direct reads, while Railway enforces protected operations.

## Later onboarding

When the organisation is ready to onboard people:

1. Create their Firebase Authentication account through the chosen sign-in method.
2. Have an existing administrator call `setUserAccess` with that Firebase UID, site, name, roles, active state, and MFA requirement.
3. The system writes the user profile, updates custom claims, revokes old sessions, and records the access event in the audit trail.

The first administrator is a one-time trusted setup step and must be provisioned with Firebase Admin credentials outside the public application. It is intentionally not available to unauthenticated users.
