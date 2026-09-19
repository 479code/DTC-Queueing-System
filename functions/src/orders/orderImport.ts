import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { readSheet } from "read-excel-file/node";
import { listAvailableOrdersInputSchema, processOrderImportInputSchema, uploadOrderWorkbookInputSchema } from "@refinery/validation";
import { validatedCall } from "../shared/callable.js";
import { requireAnyRole, requireAuth, requireSameSite } from "../shared/auth.js";
import { db } from "../shared/firebase.js";
import { failedPrecondition, notFound } from "../shared/errors.js";
import { orderImportsRef, ordersRef } from "../shared/paths.js";
import { writeAuditEvent } from "../shared/audit.js";
import { downloadDispatchObject } from "../dispatch/objectStore.js";
import { parseOrderRows } from "./parseOrderRows.js";

export const uploadOrderWorkbook = validatedCall(uploadOrderWorkbookInputSchema, async (data, request) => {
  const context = requireAuth(request);
  requireSameSite(context, data.siteId);
  requireAnyRole(context, ["programmingOfficer", "administrator"]);
  const importRef = orderImportsRef(data.siteId).doc(data.importId);
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(importRef);
    if (existing.exists && existing.data()?.checksum !== data.checksum) failedPrecondition("This import ID is already in use.");
    if (existing.exists) return;
    transaction.set(importRef, {
      siteId: data.siteId,
      storagePath: data.storagePath,
      originalFileName: data.originalFileName,
      checksum: data.checksum,
      contentType: data.contentType,
      fileSize: data.fileSize,
      status: "UPLOADED",
      uploadedBy: context.uid,
      uploadedAt: FieldValue.serverTimestamp(),
      rowsProcessed: 0,
      createdAt: FieldValue.serverTimestamp()
    });
    writeAuditEvent(transaction, {
      siteId: data.siteId,
      eventType: "ORDER_IMPORT_UPLOADED",
      actorUserId: context.uid,
      actorRoles: context.roles,
      relatedRecordPath: importRef.path,
      metadata: { originalFileName: data.originalFileName, checksum: data.checksum }
    });
  });
  return { importId: data.importId, status: "UPLOADED" as const };
});

export const processOrderImport = validatedCall(processOrderImportInputSchema, async (data, request) => {
  const context = requireAuth(request);
  requireSameSite(context, data.siteId);
  requireAnyRole(context, ["programmingOfficer", "administrator"]);
  const importRef = orderImportsRef(data.siteId).doc(data.importId);
  const claimed = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(importRef);
    if (!snapshot.exists) notFound("The order import was not found.");
    const importData = snapshot.data() ?? {};
    if (importData.status === "PROCESSED") return { alreadyProcessed: true, importData };
    if (importData.status === "PROCESSING") failedPrecondition("This order import is already being processed.");
    transaction.update(importRef, { status: "PROCESSING", processingStartedAt: FieldValue.serverTimestamp(), errorMessage: FieldValue.delete() });
    return { alreadyProcessed: false, importData };
  });
  if (claimed.alreadyProcessed) return { importId: data.importId, status: "PROCESSED" as const, rowsProcessed: Number(claimed.importData.rowsProcessed ?? 0) };
  try {
    const buffer = await downloadDispatchObject(String(claimed.importData.storagePath ?? ""));
    const checksum = createHash("sha256").update(buffer).digest("hex");
    if (checksum !== claimed.importData.checksum) throw new Error("The spreadsheet checksum changed after upload.");
    const sheet = await readSheet(buffer);
    const rows = parseOrderRows(sheet as never);
    const existing = await ordersRef(data.siteId).get();
    const existingAtcs = new Set(existing.docs.map((document) => String(document.data().atcNo ?? "").toUpperCase()));
    const duplicate = rows.find((row) => existingAtcs.has(row.atcNo));
    if (duplicate) throw new Error(`ATC ${duplicate.atcNo} has already been imported.`);
    const writer = db.bulkWriter();
    rows.forEach((row) => {
      const orderRef = ordersRef(data.siteId).doc();
      writer.set(orderRef, {
        ...row,
        siteId: data.siteId,
        importId: data.importId,
        status: "AVAILABLE",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    });
    await writer.close();
    await db.runTransaction(async (transaction) => {
      transaction.update(importRef, { status: "PROCESSED", rowsProcessed: rows.length, processedAt: FieldValue.serverTimestamp() });
      writeAuditEvent(transaction, {
        siteId: data.siteId,
        eventType: "ORDER_IMPORT_PROCESSED",
        actorUserId: context.uid,
        actorRoles: context.roles,
        relatedRecordPath: importRef.path,
        metadata: { rowsProcessed: rows.length }
      });
    });
    return { importId: data.importId, status: "PROCESSED" as const, rowsProcessed: rows.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The order workbook could not be processed.";
    await importRef.set({ status: "FAILED", errorMessage: message, processedAt: FieldValue.serverTimestamp() }, { merge: true });
    failedPrecondition(`Order import failed: ${message}`);
  }
});

export const listAvailableOrders = validatedCall(listAvailableOrdersInputSchema, async (data, request) => {
  const context = requireAuth(request);
  requireSameSite(context, data.siteId);
  requireAnyRole(context, ["programmingOfficer", "administrator"]);
  const snapshot = await ordersRef(data.siteId).where("status", "==", "AVAILABLE").orderBy("createdAt", "asc").limit(500).get();
  return snapshot.docs.map((document) => {
    const order = document.data();
    return {
      orderId: document.id,
      atcNo: String(order.atcNo),
      salesOrderNo: String(order.salesOrderNo),
      customerName: String(order.customerName ?? "Customer not recorded"),
      dprpCustomerName: String(order.customerName ?? "Customer not recorded"),
      receivingCustomerName: String(order.receivingCustomer ?? order.customerName ?? "Station not recorded"),
      volume: typeof order.volume === "number" ? order.volume : undefined,
      expectedDeliveryDate: typeof order.expectedDeliveryDate === "string" ? order.expectedDeliveryDate : undefined
    };
  });
});
