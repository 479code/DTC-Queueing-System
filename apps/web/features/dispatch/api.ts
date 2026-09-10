import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { ref, uploadBytes } from "firebase/storage";
import { auth, db, functions, storage } from "../../firebase/client";

export type DispatchMatchStatus =
  | "MATCHED"
  | "PROGRAMMED_NOT_DISPATCHED"
  | "DISPATCHED_NOT_PROGRAMMED"
  | "TRUCK_MISMATCH"
  | "UNKNOWN_TRUCK"
  | "DUPLICATE_ROW";

export type DispatchSummary = {
  rowsProcessed: number;
  matchedCount: number;
  programmedNotDispatchedCount: number;
  dispatchedNotProgrammedCount: number;
  truckMismatchCount: number;
  unknownTruckCount: number;
  duplicateRowCount: number;
};

export type DispatchImportView = DispatchSummary & {
  id: string;
  originalFileName: string;
  uploadedAt: string;
  uploadedAtMillis: number;
  status: "UPLOADED" | "PROCESSING" | "PROCESSED" | "FAILED";
  errorMessage?: string;
};

export type DispatchRecordView = {
  id: string;
  sourceRowNumber: number;
  loadingDate: string;
  rawTruckPlate: string;
  driverName: string;
  atcNo: string;
  deliveryNo: string;
  product: string;
  loadedQuantity?: number;
  matchStatus: DispatchMatchStatus;
  matchReason: string;
};

export const demoDispatchImport: DispatchImportView = {
  id: "dispatch-demo-20260910",
  originalFileName: "DTC_Dispatch_10_Sep_2026.xlsx",
  uploadedAt: "10 Sep, 16:42",
  uploadedAtMillis: Date.parse("2026-09-10T16:42:00+01:00"),
  status: "PROCESSED",
  rowsProcessed: 9,
  matchedCount: 4,
  programmedNotDispatchedCount: 2,
  dispatchedNotProgrammedCount: 1,
  truckMismatchCount: 1,
  unknownTruckCount: 1,
  duplicateRowCount: 2
};

export const demoDispatchRecords: DispatchRecordView[] = [
  { id: "demo-1", sourceRowNumber: 2, loadingDate: "10 Sep 2026", rawTruckPlate: "KJA 775 QP", driverName: "Samuel Eze", atcNo: "ATC-240910-041", deliveryNo: "81004217", product: "AGO", loadedQuantity: 33000, matchStatus: "MATCHED", matchReason: "ATC number and truck plate match the programmed FIFO entry." },
  { id: "demo-2", sourceRowNumber: 3, loadingDate: "10 Sep 2026", rawTruckPlate: "BEN 313 AS", driverName: "John Omoregie", atcNo: "ATC-240910-042", deliveryNo: "81004218", product: "PMS", loadedQuantity: 45000, matchStatus: "MATCHED", matchReason: "ATC number and truck plate match the programmed FIFO entry." },
  { id: "demo-3", sourceRowNumber: 4, loadingDate: "10 Sep 2026", rawTruckPlate: "ABU 302 LM", driverName: "Bello Garba", atcNo: "ATC-240910-043", deliveryNo: "81004219", product: "AGO", loadedQuantity: 33000, matchStatus: "MATCHED", matchReason: "ATC number and truck plate match the programmed FIFO entry." },
  { id: "demo-4", sourceRowNumber: 5, loadingDate: "10 Sep 2026", rawTruckPlate: "PHC 725 CE", driverName: "Victor Udo", atcNo: "ATC-240910-044", deliveryNo: "81004220", product: "PMS", loadedQuantity: 45000, matchStatus: "MATCHED", matchReason: "ATC number and truck plate match the programmed FIFO entry." },
  { id: "demo-5", sourceRowNumber: 6, loadingDate: "10 Sep 2026", rawTruckPlate: "FZE 481 DI", driverName: "Musa Abdullahi", atcNo: "ATC-240910-050", deliveryNo: "81004221", product: "AGO", loadedQuantity: 33000, matchStatus: "TRUCK_MISMATCH", matchReason: "ATC ATC-240910-050 belongs to programmed truck KTP 106 XA, not FZE 481 DI." },
  { id: "demo-6", sourceRowNumber: 7, loadingDate: "10 Sep 2026", rawTruckPlate: "ZZZ 991 ZZ", driverName: "Not recorded", atcNo: "ATC-240910-051", deliveryNo: "81004222", product: "PMS", loadedQuantity: 45000, matchStatus: "UNKNOWN_TRUCK", matchReason: "The truck plate is not registered for this site." },
  { id: "demo-7", sourceRowNumber: 8, loadingDate: "10 Sep 2026", rawTruckPlate: "FZE 919 DI", driverName: "Ibrahim Musa", atcNo: "ATC-240910-099", deliveryNo: "81004223", product: "AGO", loadedQuantity: 33000, matchStatus: "DISPATCHED_NOT_PROGRAMMED", matchReason: "The ATC number is not tied to a currently programmed queue entry." },
  { id: "demo-8", sourceRowNumber: 9, loadingDate: "10 Sep 2026", rawTruckPlate: "RSH 883 NV", driverName: "Yusuf Danjuma", atcNo: "ATC-240910-052", deliveryNo: "81004224", product: "PMS", loadedQuantity: 45000, matchStatus: "DUPLICATE_ROW", matchReason: "The same dispatch row appears more than once in this report." },
  { id: "demo-9", sourceRowNumber: 10, loadingDate: "10 Sep 2026", rawTruckPlate: "RSH 883 NV", driverName: "Yusuf Danjuma", atcNo: "ATC-240910-052", deliveryNo: "81004224", product: "PMS", loadedQuantity: 45000, matchStatus: "DUPLICATE_ROW", matchReason: "The same dispatch row appears more than once in this report." },
  { id: "demo-10", sourceRowNumber: 0, loadingDate: "10 Sep 2026", rawTruckPlate: "KTP 106 XA", driverName: "Emeka Nwosu", atcNo: "ATC-240910-050", deliveryNo: "Not in report", product: "Not in report", matchStatus: "PROGRAMMED_NOT_DISPATCHED", matchReason: "This programmed FIFO entry does not appear in the dispatch report." },
  { id: "demo-11", sourceRowNumber: 0, loadingDate: "10 Sep 2026", rawTruckPlate: "LAG 552 HT", driverName: "Peter Okon", atcNo: "ATC-240910-053", deliveryNo: "Not in report", product: "Not in report", matchStatus: "PROGRAMMED_NOT_DISPATCHED", matchReason: "This programmed FIFO entry does not appear in the dispatch report." }
];

function timestampMillis(value: unknown): number {
  return typeof value === "object" && value !== null && "toMillis" in value && typeof value.toMillis === "function"
    ? value.toMillis()
    : 0;
}

function formatTimestamp(value: unknown, includeTime = false): string {
  if (typeof value !== "object" || value === null || !("toDate" in value) || typeof value.toDate !== "function") {
    return "Not recorded";
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: includeTime ? undefined : "numeric",
    hour: includeTime ? "2-digit" : undefined,
    minute: includeTime ? "2-digit" : undefined,
    hour12: false
  }).format(value.toDate());
}

function mapSummary(data: DocumentData): DispatchSummary {
  return {
    rowsProcessed: Number(data.rowsProcessed ?? 0),
    matchedCount: Number(data.matchedCount ?? 0),
    programmedNotDispatchedCount: Number(data.programmedNotDispatchedCount ?? 0),
    dispatchedNotProgrammedCount: Number(data.dispatchedNotProgrammedCount ?? 0),
    truckMismatchCount: Number(data.truckMismatchCount ?? 0),
    unknownTruckCount: Number(data.unknownTruckCount ?? 0),
    duplicateRowCount: Number(data.duplicateRowCount ?? 0)
  };
}

function mapImport(document: QueryDocumentSnapshot<DocumentData>): DispatchImportView {
  const data = document.data();
  return {
    id: document.id,
    originalFileName: String(data.originalFileName ?? document.id),
    uploadedAt: formatTimestamp(data.uploadedAt, true),
    uploadedAtMillis: timestampMillis(data.uploadedAt),
    status: String(data.status ?? "FAILED") as DispatchImportView["status"],
    errorMessage: typeof data.errorMessage === "string" ? data.errorMessage : undefined,
    ...mapSummary(data)
  };
}

function mapRecord(document: QueryDocumentSnapshot<DocumentData>): DispatchRecordView {
  const data = document.data();
  return {
    id: document.id,
    sourceRowNumber: Number(data.sourceRowNumber ?? 0),
    loadingDate: formatTimestamp(data.loadingDate),
    rawTruckPlate: String(data.rawTruckPlate ?? "Not recorded"),
    driverName: String(data.driverName ?? "Not recorded"),
    atcNo: String(data.atcNo ?? "Not recorded"),
    deliveryNo: String(data.deliveryNo ?? "Not in report"),
    product: String(data.product ?? "Not in report"),
    loadedQuantity: typeof data.loadedQuantity === "number" ? data.loadedQuantity : undefined,
    matchStatus: String(data.matchStatus) as DispatchMatchStatus,
    matchReason: String(data.matchReason ?? "No reconciliation detail was recorded.")
  };
}

export function subscribeToDispatchImports(
  siteId: string,
  demoMode: boolean,
  onData: (imports: DispatchImportView[]) => void,
  onError: (message: string) => void
): Unsubscribe {
  if (demoMode || !db) {
    onData([demoDispatchImport]);
    return () => undefined;
  }
  return onSnapshot(
    query(collection(db, "sites", siteId, "dispatchImports"), orderBy("uploadedAt", "desc")),
    (snapshot) => onData(snapshot.docs.map(mapImport)),
    (error) => onError(error.message)
  );
}

export function subscribeToDispatchRecords(
  siteId: string,
  importId: string,
  demoMode: boolean,
  onData: (records: DispatchRecordView[]) => void,
  onError: (message: string) => void
): Unsubscribe {
  if (demoMode || !db) {
    onData(importId === demoDispatchImport.id ? demoDispatchRecords : []);
    return () => undefined;
  }
  return onSnapshot(
    query(collection(db, "sites", siteId, "dispatchRecords"), where("importId", "==", importId)),
    (snapshot) => onData(snapshot.docs.map(mapRecord).sort((a, b) => a.sourceRowNumber - b.sourceRowNumber)),
    (error) => onError(error.message)
  );
}

export async function uploadAndReconcileDispatch(
  siteId: string,
  file: File,
  demoMode: boolean
): Promise<{ importId: string; summary: DispatchSummary }> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Choose an Excel .xlsx dispatch report.");
  if (file.size > 20 * 1024 * 1024) throw new Error("The dispatch report must be smaller than 20 MB.");
  if (demoMode || !storage || !functions || !auth?.currentUser) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    return { importId: demoDispatchImport.id, summary: demoDispatchImport };
  }

  const importId = crypto.randomUUID().replaceAll("-", "");
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const baseName = file.name.slice(0, -5).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "dispatch";
  const storedFileName = `${baseName}.xlsx`;
  const storagePath = `sites/${siteId}/dispatch/${year}/${month}/${importId}/${storedFileName}`;
  const contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const checksum = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");

  await uploadBytes(ref(storage, storagePath), file, {
    contentType,
    customMetadata: { sha256: checksum }
  });

  const register = httpsCallable(functions, "uploadDispatchReport");
  await register({
    siteId,
    importId,
    storagePath,
    originalFileName: file.name,
    contentType,
    fileSize: file.size,
    checksum
  });
  const process = httpsCallable<{ siteId: string; importId: string }, DispatchSummary>(functions, "processDispatchImport");
  const result = await process({ siteId, importId });
  return { importId, summary: result.data };
}
