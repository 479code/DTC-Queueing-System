import { httpsCallable } from "firebase/functions";
import { auth, functions } from "./client";

const operationsApiUrl = process.env.NEXT_PUBLIC_OPERATIONS_API_URL?.replace(/\/$/, "");

type ApiErrorPayload = {
  error?: { code?: string; message?: string };
};

export function usesRailwayOperations(): boolean {
  return Boolean(operationsApiUrl);
}

export async function callOperationalApi<TInput, TOutput>(
  operationName: string,
  input: TInput
): Promise<TOutput> {
  const user = auth?.currentUser;
  if (!user) throw new Error("Sign in is required.");

  if (!operationsApiUrl) {
    if (process.env.NODE_ENV === "production") {
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

export async function uploadDispatchWorkbook<TSummary>(input: {
  siteId: string;
  importId: string;
  file: File;
  checksum: string;
}): Promise<{ importId: string; summary: TSummary }> {
  const user = auth?.currentUser;
  if (!user) throw new Error("Sign in is required.");
  if (!operationsApiUrl) throw new Error("Railway dispatch upload is not configured.");

  const response = await fetch(
    `${operationsApiUrl}/v1/sites/${encodeURIComponent(input.siteId)}/dispatch-imports/${encodeURIComponent(input.importId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await user.getIdToken()}`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "X-File-Name": input.file.name,
        "X-Checksum": input.checksum
      },
      body: input.file
    }
  );
  const payload = await response.json() as ApiErrorPayload & { data?: { importId: string; summary: TSummary } };
  if (!response.ok || !payload.data) {
    throw new Error(payload.error?.message ?? "The dispatch workbook could not be processed.");
  }

  return payload.data;
}

export async function uploadOrderWorkbook<TSummary>(input: {
  siteId: string;
  importId: string;
  file: File;
  checksum: string;
}): Promise<{ importId: string; summary: TSummary }> {
  const user = auth?.currentUser;
  if (!user) throw new Error("Sign in is required.");
  if (!operationsApiUrl) throw new Error("Railway order upload is not configured.");
  const response = await fetch(
    `${operationsApiUrl}/v1/sites/${encodeURIComponent(input.siteId)}/order-imports/${encodeURIComponent(input.importId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await user.getIdToken()}`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "X-File-Name": input.file.name,
        "X-Checksum": input.checksum
      },
      body: input.file
    }
  );
  const payload = await response.json() as ApiErrorPayload & { data?: { importId: string; summary: TSummary } };
  if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "The order workbook could not be processed.");
  return payload.data;
}
