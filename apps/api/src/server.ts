import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import {
  approveBypass,
  batchSaveTrucks,
  confirmProgrammingBatch,
  confirmProgrammingWithOrders,
  confirmTruckAvailability,
  confirmTruckDispatch,
  getAvailabilityBatch,
  correctRecord,
  getQueuePosition,
  listValidatedBypasses,
  listAvailableOrders,
  previewProgrammingBatch,
  processOrderImport,
  provisionUser,
  recalculateDailyMetrics,
  registerDeviceToken,
  rejectBypass,
  reportTruckReturn,
  requestBypass,
  saveTruck,
  setUserAccess,
  unregisterDeviceToken,
  updateInsurance,
  uploadOrderWorkbook,
  startAvailabilityBatch,
  validateBypassOtp,
  auth,
  db,
  putWorkbookObject
} from "@refinery/functions";
import type { UserRole } from "@refinery/types";

type ExecutableOperation = {
  execute(data: unknown, auth: { uid: string; siteId: string; roles: UserRole[] }): Promise<unknown>;
};

const operations: Record<string, ExecutableOperation> = {
  reportTruckReturn,
  provisionUser,
  saveTruck,
  setUserAccess,
  batchSaveTrucks,
  getQueuePosition,
  previewProgrammingBatch,
  listValidatedBypasses,
  confirmProgrammingBatch,
  startAvailabilityBatch,
  confirmTruckAvailability,
  getAvailabilityBatch,
  confirmProgrammingWithOrders,
  confirmTruckDispatch,
  requestBypass,
  approveBypass,
  rejectBypass,
  validateBypassOtp,
  registerDeviceToken,
  unregisterDeviceToken,
  uploadOrderWorkbook,
  processOrderImport,
  listAvailableOrders,
  updateInsurance,
  correctRecord,
  recalculateDailyMetrics
};

const port = Number(process.env.PORT ?? 3001);
const allowedOrigin = process.env.WEB_ORIGIN;
const maxBodyBytes = 1_048_576;
const maxWorkbookFileBytes = 20 * 1024 * 1024;
const workbookContentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function setCorsHeaders(response: ServerResponse, request: IncomingMessage): void {
  const requestOrigin = request.headers.origin;
  if (allowedOrigin && requestOrigin === allowedOrigin) {
    response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key, X-File-Name, X-Checksum");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const body = await readBytes(request, maxBodyBytes);
  if (body.length === 0) return {};
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    throw new ApiError(400, "invalid-json", "Request body must be valid JSON.");
  }
}

async function readBytes(request: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new ApiError(413, "request-too-large", "Request body is too large.");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

function mapError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (typeof error === "object" && error !== null && "code" in error && "message" in error) {
    const firebaseError = error as { code: string; message: string };
    const statuses: Record<string, number> = {
      unauthenticated: 401,
      "permission-denied": 403,
      "not-found": 404,
      "invalid-argument": 400,
      "failed-precondition": 409
    };
    return new ApiError(statuses[firebaseError.code] ?? 500, firebaseError.code, firebaseError.message);
  }
  return new ApiError(500, "internal", "The operation could not be completed.");
}

async function verifyRequest(request: IncomingMessage) {
  const authorization = request.headers.authorization;
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) throw new ApiError(401, "unauthenticated", "Sign in is required.");

  const decoded = await auth.verifyIdToken(token, true);
  const siteId = decoded.siteId;
  const roles = decoded.roles;
  if (typeof siteId !== "string" || !Array.isArray(roles) || !roles.every((role) => typeof role === "string")) {
    throw new ApiError(403, "permission-denied", "User is missing site or role claims.");
  }

  const profileSnapshot = await db.collection("sites").doc(siteId).collection("users").doc(decoded.uid).get();
  const profile = profileSnapshot.data();
  const profileRoles = Array.isArray(profile?.roles) && profile.roles.every((role) => typeof role === "string")
    ? profile.roles as UserRole[]
    : null;
  const claimsMatchProfile = profileRoles !== null
    && profileRoles.length === roles.length
    && profileRoles.every((role) => roles.includes(role));
  if (!profileSnapshot.exists || profile?.isActive !== true || profile?.siteId !== siteId || !claimsMatchProfile) {
    throw new ApiError(403, "permission-denied", "Account access is inactive or has changed. Sign in again.");
  }

  return { uid: decoded.uid, siteId, roles: profileRoles };
}

async function bootstrapInitialAdministrator(): Promise<void> {
  const uid = process.env.INITIAL_ADMIN_UID?.trim();
  if (!uid) return;

  const siteId = "default-site";
  const roles: UserRole[] = ["administrator"];
  const [authUser, profileSnapshot] = await Promise.all([
    auth.getUser(uid),
    db.collection("sites").doc(siteId).collection("users").doc(uid).get()
  ]);
  const profileRef = profileSnapshot.ref;
  const now = new Date();

  await profileRef.set({
    siteId,
    authUid: uid,
    name: authUser.displayName ?? authUser.email?.split("@")[0] ?? "Initial administrator",
    ...(authUser.email ? { email: authUser.email } : {}),
    roles,
    isActive: true,
    mfaRequired: false,
    updatedAt: now,
    ...(profileSnapshot.exists ? {} : { createdAt: now })
  }, { merge: true });

  await auth.setCustomUserClaims(uid, { siteId, roles });
  await auth.revokeRefreshTokens(uid);
  console.info(`Initial administrator access assigned for ${uid}. Remove INITIAL_ADMIN_UID to disable bootstrap.`);
}

const server = createServer(async (request, response) => {
  setCorsHeaders(response, request);
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, { status: "ok" });
    return;
  }

  const orderUpload = request.url?.match(/^\/v1\/sites\/([^/]+)\/order-imports\/([^/]+)$/);
  if (request.method === "POST" && orderUpload) {
    try {
      const context = await verifyRequest(request);
      const [, siteId, importId] = orderUpload;
      if (!siteId || !importId || context.siteId !== siteId) {
        throw new ApiError(403, "permission-denied", "Cross-site access is not allowed.");
      }
      if (!context.roles.some((role) => role === "programmingOfficer" || role === "administrator")) {
        throw new ApiError(403, "permission-denied", "A programming officer or administrator role is required.");
      }
      const originalFileName = request.headers["x-file-name"];
      const checksum = request.headers["x-checksum"];
      if (
        typeof originalFileName !== "string" ||
        !originalFileName.toLowerCase().endsWith(".xlsx") ||
        typeof checksum !== "string" ||
        !/^[a-f0-9]{64}$/i.test(checksum) ||
        request.headers["content-type"] !== workbookContentType
      ) {
        throw new ApiError(400, "invalid-argument", "A valid Excel workbook name, checksum, and content type are required.");
      }

      const file = await readBytes(request, maxWorkbookFileBytes);
      if (file.length === 0) throw new ApiError(400, "invalid-argument", "The order workbook is empty.");
      const actualChecksum = createHash("sha256").update(file).digest("hex");
      if (actualChecksum !== checksum.toLowerCase()) {
        throw new ApiError(400, "invalid-argument", "The order workbook checksum does not match its content.");
      }

      const now = new Date();
      const safeName = originalFileName.slice(0, -5).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "orders";
      const storagePath = `sites/${siteId}/orders/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${importId}/${safeName}.xlsx`;
      await putWorkbookObject(storagePath, file, workbookContentType, actualChecksum);
      await uploadOrderWorkbook.execute({
        siteId,
        importId,
        storagePath,
        originalFileName,
        contentType: workbookContentType,
        fileSize: file.length,
        checksum: actualChecksum
      }, context);
      const summary = await processOrderImport.execute({ siteId, importId }, context);
      sendJson(response, 200, { data: { importId, summary } });
    } catch (error) {
      const mapped = mapError(error);
      sendJson(response, mapped.status, { error: { code: mapped.code, message: mapped.message } });
    }
    return;
  }

  const operationName = request.url?.match(/^\/v1\/operations\/([a-zA-Z0-9]+)$/)?.[1];
  if (request.method !== "POST" || !operationName) {
    sendJson(response, 404, { error: { code: "not-found", message: "Route not found." } });
    return;
  }

  const operation = operations[operationName];
  if (!operation) {
    sendJson(response, 404, { error: { code: "not-found", message: "Operation not found." } });
    return;
  }

  try {
    const [context, body] = await Promise.all([verifyRequest(request), readJson(request)]);
    const data = await operation.execute(body, context);
    sendJson(response, 200, { data });
  } catch (error) {
    const mapped = mapError(error);
    sendJson(response, mapped.status, { error: { code: mapped.code, message: mapped.message } });
  }
});

bootstrapInitialAdministrator()
  .then(() => {
    server.listen(port, "0.0.0.0", () => {
      console.log(`Refinery Queue API listening on port ${port}`);
    });
  })
  .catch((error: unknown) => {
    console.error("Initial administrator bootstrap failed.", error);
    process.exitCode = 1;
  });
