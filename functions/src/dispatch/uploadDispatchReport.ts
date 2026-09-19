import { uploadDispatchReportInputSchema } from "@refinery/validation";
import { FieldValue } from "firebase-admin/firestore";
import { validatedCall } from "../shared/callable.js";
import { requireAnyRole, requireAuth, requireSameSite } from "../shared/auth.js";
import { db } from "../shared/firebase.js";
import { dispatchImportsRef } from "../shared/paths.js";
import { writeAuditEvent } from "../shared/audit.js";
import { failedPrecondition } from "../shared/errors.js";
import { getDispatchObjectMetadata } from "./objectStore.js";

export const uploadDispatchReport = validatedCall(
  uploadDispatchReportInputSchema,
  async (data, request) => {
    const context = requireAuth(request);
    requireSameSite(context, data.siteId);
    requireAnyRole(context, ["programmingOfficer", "administrator"]);

    const expectedPrefix = `sites/${data.siteId}/dispatch/`;
    const pathSegments = data.storagePath.split("/");
    const pathImportId = pathSegments.at(-2);
    const storedFileName = pathSegments.at(-1) ?? "";
    if (
      !data.storagePath.startsWith(expectedPrefix) ||
      pathImportId !== data.importId ||
      !storedFileName.toLowerCase().endsWith(".xlsx") ||
      !data.originalFileName.toLowerCase().endsWith(".xlsx")
    ) {
      failedPrecondition("The uploaded file is not in the expected dispatch import location.");
    }

    const metadata = await getDispatchObjectMetadata(data.storagePath);
    if (!metadata) failedPrecondition("The dispatch spreadsheet could not be found in storage.");

    const storedSize = metadata.fileSize;
    if (storedSize !== data.fileSize || storedSize > 20 * 1024 * 1024) {
      failedPrecondition("The uploaded spreadsheet size does not match the registration request.");
    }
    const expectedContentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (data.contentType !== expectedContentType || metadata.contentType !== expectedContentType) {
      failedPrecondition("The uploaded file must be an Excel .xlsx workbook.");
    }
    if (metadata.checksum !== data.checksum) {
      failedPrecondition("The uploaded spreadsheet checksum does not match the registration request.");
    }

    const importRef = dispatchImportsRef(data.siteId).doc(data.importId);
    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(importRef);
      if (existing.exists) failedPrecondition("This dispatch import has already been registered.");

      transaction.set(importRef, {
        id: data.importId,
        siteId: data.siteId,
        storagePath: data.storagePath,
        originalFileName: data.originalFileName,
        contentType: data.contentType,
        fileSize: data.fileSize,
        uploadedBy: context.uid,
        uploadedAt: FieldValue.serverTimestamp(),
        checksum: data.checksum,
        status: "UPLOADED",
        rowsProcessed: 0,
        matchedCount: 0,
        programmedNotDispatchedCount: 0,
        dispatchedNotProgrammedCount: 0,
        truckMismatchCount: 0,
        unknownTruckCount: 0,
        duplicateRowCount: 0
      });

      writeAuditEvent(transaction, {
        siteId: data.siteId,
        eventType: "DISPATCH_IMPORT_UPLOADED",
        actorUserId: context.uid,
        actorRoles: context.roles,
        dispatchImportId: data.importId,
        relatedRecordPath: importRef.path,
        metadata: {
          originalFileName: data.originalFileName,
          fileSize: data.fileSize,
          checksum: data.checksum
        }
      });
    });

    return { importId: data.importId, status: "UPLOADED" as const };
  }
);
