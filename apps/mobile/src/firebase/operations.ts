import { httpsCallable } from "firebase/functions";
import { auth, functions } from "./client";

const operationsApiUrl = process.env.EXPO_PUBLIC_OPERATIONS_API_URL?.replace(/\/$/, "");

type ApiErrorPayload = {
  error?: { code?: string; message?: string };
};

export async function callOperationalApi<TInput, TOutput>(
  operationName: string,
  input: TInput
): Promise<TOutput> {
  const user = auth?.currentUser;
  if (!user) throw new Error("Sign in is required.");

  if (!operationsApiUrl) {
    if (!__DEV__) {
      throw new Error("Railway operational API is not configured.");
    }
    if (!functions) throw new Error("Operational API is not configured.");
    const callable = httpsCallable<TInput, TOutput>(functions, operationName);
    return (await callable(input)).data;
  }

  const response = await fetch(`${operationsApiUrl}/v1/operations/${operationName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
  const payload = await response.json() as ApiErrorPayload & { data?: TOutput };
  if (!response.ok || payload.data === undefined) {
    throw new Error(payload.error?.message ?? "The operation could not be completed.");
  }

  return payload.data;
}
