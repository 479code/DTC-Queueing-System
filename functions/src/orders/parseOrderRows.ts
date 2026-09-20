import type { SheetCell } from "../shared/sheet.js";

type OrderColumn =
  | "serialNumber"
  | "customerName"
  | "receivingCustomer"
  | "stationAddress"
  | "state"
  | "contactName"
  | "contactNumber"
  | "licenceNumber"
  | "volume"
  | "expectedDeliveryDate"
  | "atcNo"
  | "salesOrderNo";

const HEADER_ALIASES: Record<string, OrderColumn> = {
  sn: "serialNumber",
  serialno: "serialNumber",
  serialnumber: "serialNumber",
  dprpcustomername: "customerName",
  customername: "customerName",
  receivingcustomerstationname: "receivingCustomer",
  receivingcustomername: "receivingCustomer",
  stationname: "receivingCustomer",
  stationaddress: "stationAddress",
  state: "state",
  contactrepname: "contactName",
  contactrepnumber: "contactNumber",
  nmdpralicencenumber: "licenceNumber",
  nmdpralicensenumber: "licenceNumber",
  volume: "volume",
  expecteddeliverydate: "expectedDeliveryDate",
  atc: "atcNo",
  atcno: "atcNo",
  atcnumber: "atcNo",
  salesorder: "salesOrderNo",
  salesorderno: "salesOrderNo"
};

export type ParsedOrderRow = {
  sourceRowNumber: number;
  atcNo: string;
  salesOrderNo: string;
  customerName?: string;
  receivingCustomer?: string;
  stationAddress?: string;
  state?: string;
  contactName?: string;
  contactNumber?: string;
  licenceNumber?: string;
  volume?: number;
  expectedDeliveryDate?: string;
  rawData: Record<string, string | number | boolean | null>;
};

function normalizedHeader(value: SheetCell): string {
  return String(value ?? "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function stringValue(value: SheetCell): string | undefined {
  const result = String(value ?? "").trim();
  return result || undefined;
}

function numberValue(value: SheetCell): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replaceAll(",", "").trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function rawValue(value: SheetCell): string | number | boolean | null {
  if (value instanceof Date) return value.toISOString();
  return value ?? null;
}

/** A row we could not use, and the plain reason why, for the officer to read. */
export type SkippedOrderRow = {
  sourceRowNumber: number;
  atcNo?: string;
  reason: string;
};

export type ParsedOrderSheet = {
  rows: ParsedOrderRow[];
  skipped: SkippedOrderRow[];
};

/**
 * One bad row should not cost an officer the other nineteen, so a row that
 * cannot be used is set aside with a reason rather than failing the file.
 * Only a workbook we cannot read at all is rejected outright.
 */
export function parseOrderRows(rows: SheetCell[][], maxRows = 500): ParsedOrderSheet {
  const headerIndex = rows.slice(0, 20).findIndex((row) => {
    const columns = new Set(row.map((cell) => HEADER_ALIASES[normalizedHeader(cell)]).filter(Boolean));
    return columns.has("atcNo") && columns.has("salesOrderNo");
  });
  if (headerIndex < 0) {
    throw new Error("The workbook must contain ATC NO and SALES ORDER NO columns.");
  }
  const headers = rows[headerIndex] ?? [];
  const indexes = new Map<OrderColumn, number>();
  headers.forEach((cell, index) => {
    const column = HEADER_ALIASES[normalizedHeader(cell)];
    if (column && !indexes.has(column)) indexes.set(column, index);
  });
  const rowsWithData = rows.slice(headerIndex + 1).filter((row) => row.some((cell) => stringValue(cell)));
  if (!rowsWithData.length) throw new Error("The workbook does not contain any orders.");
  if (rowsWithData.length > maxRows) throw new Error(`An order import can contain at most ${maxRows} rows.`);
  const cell = (row: SheetCell[], column: OrderColumn) => {
    const index = indexes.get(column);
    return index === undefined ? undefined : row[index];
  };
  const seenAtcs = new Map<string, number>();
  const skipped: SkippedOrderRow[] = [];
  const parsed: ParsedOrderRow[] = [];

  rowsWithData.forEach((row, index) => {
    const sourceRowNumber = headerIndex + index + 2;
    const atcNo = stringValue(cell(row, "atcNo"))?.toUpperCase();
    const salesOrderNo = stringValue(cell(row, "salesOrderNo"));
    if (!atcNo) {
      skipped.push({ sourceRowNumber, reason: "No ATC number" });
      return;
    }
    if (!salesOrderNo) {
      skipped.push({ sourceRowNumber, atcNo, reason: "No sales order number" });
      return;
    }
    const firstSeenAt = seenAtcs.get(atcNo);
    if (firstSeenAt !== undefined) {
      skipped.push({ sourceRowNumber, atcNo, reason: `Repeated in this file (row ${firstSeenAt} was kept)` });
      return;
    }
    seenAtcs.set(atcNo, sourceRowNumber);
    parsed.push({
      sourceRowNumber,
      atcNo,
      salesOrderNo,
      customerName: stringValue(cell(row, "customerName")),
      receivingCustomer: stringValue(cell(row, "receivingCustomer")),
      stationAddress: stringValue(cell(row, "stationAddress")),
      state: stringValue(cell(row, "state")),
      contactName: stringValue(cell(row, "contactName")),
      contactNumber: stringValue(cell(row, "contactNumber")),
      licenceNumber: stringValue(cell(row, "licenceNumber")),
      volume: numberValue(cell(row, "volume")),
      expectedDeliveryDate: stringValue(cell(row, "expectedDeliveryDate")),
      rawData: Object.fromEntries(headers.map((header, columnIndex) => [
        String(header ?? `Column ${columnIndex + 1}`).trim() || `Column ${columnIndex + 1}`,
        rawValue(row[columnIndex])
      ]))
    });
  });

  return { rows: parsed, skipped };
}
