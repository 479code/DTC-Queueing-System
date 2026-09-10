import type { CallableRequest } from "firebase-functions/v2/https";
import type { UserRole } from "@refinery/types";
import { permissionDenied, unauthenticated } from "./errors.js";

export type AuthContext = {
  uid: string;
  siteId: string;
  roles: UserRole[];
};

export function requireAuth(request: CallableRequest<unknown>): AuthContext {
  if (!request.auth) {
    unauthenticated();
  }

  const siteId = request.auth.token.siteId;
  const roles = request.auth.token.roles;

  if (typeof siteId !== "string" || !Array.isArray(roles)) {
    permissionDenied("User is missing site or role claims.");
  }

  return {
    uid: request.auth.uid,
    siteId,
    roles: roles as UserRole[]
  };
}

export function requireRole(context: AuthContext, role: UserRole): void {
  if (!context.roles.includes(role)) {
    permissionDenied(`Role required: ${role}.`);
  }
}

export function requireAnyRole(context: AuthContext, roles: UserRole[]): void {
  if (!roles.some((role) => context.roles.includes(role))) {
    permissionDenied(`One of these roles is required: ${roles.join(", ")}.`);
  }
}

export function requireSameSite(context: AuthContext, siteId: string): void {
  if (context.siteId !== siteId) {
    permissionDenied("Cross-site access is not allowed.");
  }
}
