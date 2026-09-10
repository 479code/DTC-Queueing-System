import { HttpsError } from "firebase-functions/v2/https";

export function unauthenticated(): never {
  throw new HttpsError("unauthenticated", "Sign in is required.");
}

export function permissionDenied(message = "You do not have permission to perform this action."): never {
  throw new HttpsError("permission-denied", message);
}

export function failedPrecondition(message: string): never {
  throw new HttpsError("failed-precondition", message);
}

export function invalidArgument(message: string): never {
  throw new HttpsError("invalid-argument", message);
}

export function notFound(message: string): never {
  throw new HttpsError("not-found", message);
}
