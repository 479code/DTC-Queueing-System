import { setUserAccessInputSchema } from "@refinery/validation";
import { USER_ROLES, type UserRole } from "@refinery/types";
import { FieldValue } from "firebase-admin/firestore";
import { writeAuditEvent } from "../shared/audit.js";
import { requireAuth, requireRole, requireSameSite } from "../shared/auth.js";
import { validatedCall } from "../shared/callable.js";
import { failedPrecondition, notFound, permissionDenied } from "../shared/errors.js";
import { auth, db } from "../shared/firebase.js";
import { usersRef } from "../shared/paths.js";

function sameRoles(left: readonly UserRole[], right: readonly UserRole[]): boolean {
  return left.length === right.length && left.every((role) => right.includes(role));
}

export const setUserAccess = validatedCall(
  setUserAccessInputSchema,
  async (data, request) => {
    const context = requireAuth(request);
    requireSameSite(context, data.siteId);
    requireRole(context, "administrator");

    if (data.userId === context.uid && (!data.isActive || !data.roles.includes("administrator"))) {
      permissionDenied("Administrators cannot remove or deactivate their own administrator access.");
    }

    let authUser;
    try {
      authUser = await auth.getUser(data.userId);
    } catch {
      notFound("The Firebase Authentication user was not found.");
    }

    if (!authUser) {
      notFound("The Firebase Authentication user was not found.");
    }

    const userRef = usersRef(data.siteId).doc(data.userId);
    const result = await db.runTransaction(async (transaction) => {
      const current = await transaction.get(userRef);
      const previous = current.data() ?? {};
      const previousRoles = Array.isArray(previous.roles)
        ? previous.roles.filter((role): role is UserRole => typeof role === "string" && USER_ROLES.includes(role as UserRole))
        : [];
      const accessChanged = !current.exists
        || previous.isActive !== data.isActive
        || !sameRoles(previousRoles, data.roles)
        || previous.mfaRequired !== data.mfaRequired;

      if (current.exists && previous.siteId !== data.siteId) {
        failedPrecondition("User access cannot be moved between sites through this operation.");
      }

      const email = data.email ?? authUser.email;
      const profile = {
        siteId: data.siteId,
        authUid: data.userId,
        name: data.name,
        roles: data.roles,
        isActive: data.isActive,
        mfaRequired: data.mfaRequired,
        updatedAt: FieldValue.serverTimestamp(),
        ...(email ? { email } : {})
      };

      transaction.set(userRef, current.exists
        ? profile
        : { ...profile, createdAt: FieldValue.serverTimestamp() }, { merge: true });

      const eventType = !current.exists
        ? "USER_CREATED"
        : !data.isActive
          ? "USER_DEACTIVATED"
          : "USER_ROLE_CHANGED";
      writeAuditEvent(transaction, {
        siteId: data.siteId,
        eventType,
        actorUserId: context.uid,
        actorRoles: context.roles,
        relatedRecordPath: userRef.path,
        previousState: current.exists ? {
          roles: previousRoles,
          isActive: previous.isActive,
          mfaRequired: previous.mfaRequired
        } : undefined,
        newState: {
          roles: data.roles,
          isActive: data.isActive,
          mfaRequired: data.mfaRequired
        },
        metadata: { userId: data.userId, accessChanged }
      });

      return { created: !current.exists, accessChanged };
    });

    await auth.setCustomUserClaims(data.userId, {
      siteId: data.siteId,
      roles: data.roles
    });
    await auth.revokeRefreshTokens(data.userId);

    return { userId: data.userId, ...result };
  }
);
