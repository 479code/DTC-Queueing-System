import { collection, onSnapshot, orderBy, query, where, type DocumentData, type QueryDocumentSnapshot, type Unsubscribe } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { ref, uploadBytes } from "firebase/storage";
import { auth, db, functions, storage } from "../../firebase/client";
import { uploadOrderWorkbook, usesRailwayOperations } from "../../firebase/operations";
import { formatSiteTime } from "../../lib/time";

export type SkippedOrderRow = { sourceRowNumber: number; atcNo?: string; reason: string };
export type OrderImportView = { id: string; originalFileName: string; status: string; rowsProcessed: number; rowsSkipped: number; uploadedAt: string };
export type OrderImportResult = { importId: string; rowsProcessed: number; rowsSkipped: number; skipped: SkippedOrderRow[] };
export type OrderView = { id: string; atcNo: string; salesOrderNo: string; dprpCustomerName: string; receivingCustomerName: string; state: string; volume?: number; expectedDeliveryDate: string; status: string };

const demoImports: OrderImportView[] = [{ id: "orders-demo-160926", originalFileName: "DD SUS OIL 16.09.26.xlsx", status: "PROCESSED", rowsProcessed: 2, rowsSkipped: 0, uploadedAt: "16 Sep, 09:10" }];
const demoOrders: OrderView[] = [
  { id: "demo-order-1", atcNo: "0472438", salesOrderNo: "2100001970", dprpCustomerName: "SUS Oil and Gas Ltd", receivingCustomerName: "Amkar General Merchandise Ltd", state: "Kano", volume: 50000, expectedDeliveryDate: "16 Sep 2026", status: "AVAILABLE" },
  { id: "demo-order-2", atcNo: "0472439", salesOrderNo: "2100001971", dprpCustomerName: "SUS Oil and Gas Ltd", receivingCustomerName: "Danzabuwa and Babura Trading Co Ltd", state: "Kano", volume: 50000, expectedDeliveryDate: "16 Sep 2026", status: "AVAILABLE" }
];

function dateText(value: unknown): string {
  return formatSiteTime(value);
}

/**
 * Early imports stored the delivery date as a full Date toString, so rows
 * written then read "Tue Sep 22 2026 00:00:00 GMT+0000 (Coordinated ...)".
 * Show those as a date; anything already readable is left alone.
 */
function deliveryDateText(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text || !text.includes(":")) return text;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(parsed);
}
function mapImport(document: QueryDocumentSnapshot<DocumentData>): OrderImportView {
  const data = document.data();
  return { id: document.id, originalFileName: String(data.originalFileName ?? document.id), status: String(data.status ?? "FAILED"), rowsProcessed: Number(data.rowsProcessed ?? 0), rowsSkipped: Number(data.rowsSkipped ?? 0), uploadedAt: dateText(data.uploadedAt) };
}
function mapOrder(document: QueryDocumentSnapshot<DocumentData>): OrderView {
  const data = document.data();
  return { id: document.id, atcNo: String(data.atcNo ?? ""), salesOrderNo: String(data.salesOrderNo ?? ""), dprpCustomerName: String(data.customerName ?? "Customer not recorded"), receivingCustomerName: String(data.receivingCustomer ?? data.customerName ?? "Station not recorded"), state: String(data.state ?? ""), volume: typeof data.volume === "number" ? data.volume : undefined, expectedDeliveryDate: deliveryDateText(data.expectedDeliveryDate), status: String(data.status ?? "AVAILABLE") };
}
export function subscribeToOrderImports(siteId: string, demoMode: boolean, onData: (items: OrderImportView[]) => void, onError: (message: string) => void): Unsubscribe {
  if (demoMode || !db) { onData(demoImports); return () => undefined; }
  return onSnapshot(query(collection(db, "sites", siteId, "orderImports"), orderBy("uploadedAt", "desc")), (snapshot) => onData(snapshot.docs.map(mapImport)), (error) => onError(error.message));
}
export function subscribeToOrders(siteId: string, demoMode: boolean, onData: (items: OrderView[]) => void, onError: (message: string) => void): Unsubscribe {
  if (demoMode || !db) { onData(demoOrders); return () => undefined; }
  return onSnapshot(query(collection(db, "sites", siteId, "orders"), where("status", "==", "AVAILABLE"), orderBy("createdAt", "asc")), (snapshot) => onData(snapshot.docs.map(mapOrder)), (error) => onError(error.message));
}
export async function uploadOrders(siteId: string, file: File, demoMode: boolean): Promise<OrderImportResult> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Choose an Excel .xlsx order workbook.");
  if (file.size > 20 * 1024 * 1024) throw new Error("The order workbook must be smaller than 20 MB.");
  if (demoMode || !auth?.currentUser) return { importId: "orders-demo-160926", rowsProcessed: 2, rowsSkipped: 0, skipped: [] };
  const importId = crypto.randomUUID().replaceAll("-", "");
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const checksum = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (usesRailwayOperations()) {
    return uploadOrderWorkbook<Omit<OrderImportResult, "importId">>({ siteId, importId, file, checksum }).then((result) => ({
      importId: result.importId,
      rowsProcessed: result.summary.rowsProcessed,
      rowsSkipped: result.summary.rowsSkipped ?? 0,
      skipped: result.summary.skipped ?? []
    }));
  }
  if (!storage || !functions) throw new Error("Order upload is not configured.");
  const storagePath = `sites/${siteId}/orders/${importId}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  await uploadBytes(ref(storage, storagePath), file, { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", customMetadata: { sha256: checksum } });
  await httpsCallable(functions, "uploadOrderWorkbook")({ siteId, importId, storagePath, originalFileName: file.name, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileSize: file.size, checksum });
  const processed = await httpsCallable<{ siteId: string; importId: string }, Omit<OrderImportResult, "importId">>(functions, "processOrderImport")({ siteId, importId });
  return { importId, rowsProcessed: processed.data.rowsProcessed, rowsSkipped: processed.data.rowsSkipped ?? 0, skipped: processed.data.skipped ?? [] };
}
