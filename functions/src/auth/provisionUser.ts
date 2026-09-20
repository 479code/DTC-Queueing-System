import { randomBytes } from "node:crypto";
import { provisionUserInputSchema } from "@refinery/validation";
import type { UserRole } from "@refinery/types";
import { FieldValue } from "firebase-admin/firestore";
import { writeAuditEvent } from "../shared/audit.js";
import { requireAuth, requireRole, requireSameSite } from "../shared/auth.js";
import { validatedCall } from "../shared/callable.js";
import { failedPrecondition } from "../shared/errors.js";
import { auth, db } from "../shared/firebase.js";
import { usersRef } from "../shared/paths.js";

function invitationPassword(): string {
  return `Q!${randomBytes(24).toString("base64url")}`;
}

export const provisionUser = validatedCall(
  provisionUserInputSchema,
  async (data, request) => {
    const context = requireAuth(request);
    requireSameSite(context, data.siteId);
    requireRole(context, "administrator");

    try {
      await auth.getUserByEmail(data.email);
      failedPrecondition("An account already exists for this email. Update it from Staff Access instead.");
    } catch (error) {
      if (error instanceof Error && error.message.includes("An account already exists")) throw error;
    }

    const authUser = await auth.createUser({
      email: data.email,
      displayName: data.name,
      password: invitationPassword()
    });
    const userRef = usersRef(data.siteId).doc(authUser.uid);

    try {
      await db.runTransaction(async (transaction) => {
        transaction.set(userRef, {
          siteId: data.siteId,
          authUid: authUser.uid,
          name: data.name,
          email: data.email,
          roles: data.roles,
          isActive: true,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
        writeAuditEvent(transaction, {
          siteId: data.siteId,
          eventType: "USER_CREATED",
          actorUserId: context.uid,
          actorRoles: context.roles,
          relatedRecordPath: userRef.path,
          newState: {
            roles: data.roles,
            isActive: true
          },
          metadata: { userId: authUser.uid, email: data.email }
        });
      });

      await auth.setCustomUserClaims(authUser.uid, {
        siteId: data.siteId,
        roles: data.roles as UserRole[]
      });
      await auth.revokeRefreshTokens(authUser.uid);
    } catch (error) {
      await auth.deleteUser(authUser.uid);
      throw error;
    }

    return { userId: authUser.uid };
  }
);
