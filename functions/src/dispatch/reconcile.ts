import { normalizeRegistration } from "@refinery/shared";
import type { DispatchMatchStatus } from "@refinery/types";

export type DispatchCell = string | number | boolean | Date | null | undefined;

type DispatchColumn =
  | "serialNumber"
  | "loadingDate"
  | "customerCode"
  | "customerName"
  | "product"
  | "programmedQuantity"
  | "loadedQuantity"
  | "transporter"
  | "truckPlate"
  | "driverName"
  | "terminal"
  | "finalDestination"
  | "state"
  | "atcNo"
  | "deliveryNo"
  | "salesOrder"
  | "contract";

const HEADER_ALIASES: Record<string, DispatchColumn> = {
  sn: "serialNumber",
  serialno: "serialNumber",
  serialnumber: "serialNumber",
  loadingdate: "loadingDate",
  dateofloading: "loadingDate",
  customercode: "customerCode",
  customername: "customerName",
  product: "product",
  programmedquantity: "programmedQuantity",
  programmedqty: "programmedQuantity",
  loadedquantity: "loadedQuantity",
  loadedqty: "loadedQuantity",
  transporter: "transporter",
  truckplate: "truckPlate",
  truckplateno: "truckPlate",
  truckregistration: "truckPlate",
  registrationnumber: "truckPlate",
  vehicleno: "truckPlate",
  drivername: "driverName",
  terminal: "terminal",
  finaldestination: "finalDestination",
  destination: "finalDestination",
  state: "state",
  atc: "atcNo",
  atcno: "atcNo",
  atcnumber: "atcNo",
  deliveryno: "deliveryNo",
  deliverynumber: "deliveryNo",
  salesorder: "salesOrder",
  salesorderno: "salesOrder",
  contract: "contract",
  contractno: "contract"
};

export type ParsedDispatchRow = {
  sourceRowNumber: number;
  loadingDate: Date;
  customerCode?: string;
  customerName?: string;
  product?: string;
  programmedQuantity?: number;
  loadedQuantity?: number;
  transporter?: string;
  rawTruckPlate: string;
  normalizedTruckPlate: string;
  driverName?: string;
  terminal?: string;
  finalDestination?: string;
  state?: string;
  atcNo?: string;
  deliveryNo?: string;
  salesOrder?: string;
  contract?: string;
  rawData: Record<string, string | number | boolean | null>;
};

export type KnownTruck = {
  id: string;
  normalizedRegistration: string;
  registrationNumber: string;
  driverName?: string;
};

export type ProgrammedCycle = {
  id: string;
  truckId: string;
  normalizedRegistration: string;
  registrationNumber: string;
  driverName?: string;
  atcNo?: string;
  programmingBatchId?: string;
  programmedAt: Date;
};

export type ReconciledDispatchRecord = ParsedDispatchRow & {
  id: string;
  recordKind: "IMPORT_ROW" | "PROGRAMMING_EXCEPTION";
  matchStatus: DispatchMatchStatus;
  matchReason: string;
  truckId?: string;
  matchedQueueCycleId?: string;
  matchedProgrammingBatchId?: string;
};

export type DispatchSummary = {
  rowsProcessed: number;
  matchedCount: number;
  programmedNotDispatchedCount: number;
  dispatchedNotProgrammedCount: number;
  truckMismatchCount: number;
  unknownTruckCount: number;
  duplicateRowCount: number;
};

export type DispatchReconciliation = {
  records: ReconciledDispatchRecord[];
  matchedCycleIds: string[];
  summary: DispatchSummary;
};

function normalizeHeader(value: DispatchCell): string {
  return String(value ?? "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function stringValue(value: DispatchCell): string | undefined {
  const result = value === null || value === undefined ? "" : String(value).trim();
  return result || undefined;
}

function numberValue(value: DispatchCell): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replaceAll(",", "").trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function dateValue(value: DispatchCell): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const excelDate = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (!Number.isNaN(excelDate.getTime())) return excelDate;
  }

  const input = String(value ?? "").trim();
  const dayFirst = input.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (dayFirst) {
    const parsed = new Date(Date.UTC(Number(dayFirst[3]), Number(dayFirst[2]) - 1, Number(dayFirst[1])));
    if (
      parsed.getUTCFullYear() === Number(dayFirst[3]) &&
      parsed.getUTCMonth() === Number(dayFirst[2]) - 1 &&
      parsed.getUTCDate() === Number(dayFirst[1])
    ) return parsed;
  }

  const timestamp = Date.parse(input);
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp);
}

function rawCell(value: DispatchCell): string | number | boolean | null {
  if (value instanceof Date) return value.toISOString();
  return value ?? null;
}

export function parseDispatchRows(rows: DispatchCell[][], maxRows = 200): ParsedDispatchRow[] {
  const headerRowIndex = rows.slice(0, 20).findIndex((row) => {
    const columns = new Set(row.map((cell) => HEADER_ALIASES[normalizeHeader(cell)]).filter(Boolean));
    return columns.has("loadingDate") && columns.has("truckPlate") && columns.has("atcNo");
  });

  if (headerRowIndex < 0) {
    throw new Error("The workbook must contain Loading Date, Truck Plate, and ATC NO columns.");
  }

  const headers = rows[headerRowIndex] ?? [];
  const columnIndexes = new Map<DispatchColumn, number>();
  headers.forEach((cell, index) => {
    const column = HEADER_ALIASES[normalizeHeader(cell)];
    if (column && !columnIndexes.has(column)) columnIndexes.set(column, index);
  });

  const dataRows = rows.slice(headerRowIndex + 1).filter((row) => row.some((cell) => stringValue(cell)));
  if (dataRows.length === 0) throw new Error("The workbook does not contain any dispatch rows.");
  if (dataRows.length > maxRows) throw new Error(`A dispatch import can contain at most ${maxRows} rows.`);

  const cell = (row: DispatchCell[], column: DispatchColumn): DispatchCell => {
    const index = columnIndexes.get(column);
    return index === undefined ? undefined : row[index];
  };

  return dataRows.map((row, index) => {
    const sourceRowNumber = headerRowIndex + index + 2;
    const loadingDate = dateValue(cell(row, "loadingDate"));
    if (!loadingDate) throw new Error(`Row ${sourceRowNumber} has an invalid Loading Date.`);

    const rawTruckPlate = stringValue(cell(row, "truckPlate")) ?? "";
    const rawData = Object.fromEntries(headers.map((header, columnIndex) => [
      String(header ?? `Column ${columnIndex + 1}`).trim() || `Column ${columnIndex + 1}`,
      rawCell(row[columnIndex])
    ]));

    return {
      sourceRowNumber,
      loadingDate,
      customerCode: stringValue(cell(row, "customerCode")),
      customerName: stringValue(cell(row, "customerName")),
      product: stringValue(cell(row, "product")),
      programmedQuantity: numberValue(cell(row, "programmedQuantity")),
      loadedQuantity: numberValue(cell(row, "loadedQuantity")),
      transporter: stringValue(cell(row, "transporter")),
      rawTruckPlate,
      normalizedTruckPlate: normalizeRegistration(rawTruckPlate),
      driverName: stringValue(cell(row, "driverName")),
      terminal: stringValue(cell(row, "terminal")),
      finalDestination: stringValue(cell(row, "finalDestination")),
      state: stringValue(cell(row, "state")),
      atcNo: stringValue(cell(row, "atcNo"))?.toUpperCase(),
      deliveryNo: stringValue(cell(row, "deliveryNo")),
      salesOrder: stringValue(cell(row, "salesOrder")),
      contract: stringValue(cell(row, "contract")),
      rawData
    };
  });
}

function duplicateKey(row: ParsedDispatchRow): string {
  return [
    row.normalizedTruckPlate,
    row.loadingDate.toISOString().slice(0, 10),
    row.deliveryNo?.toUpperCase() ?? "",
    row.salesOrder?.toUpperCase() ?? "",
    row.atcNo?.toUpperCase() ?? "",
    row.product?.toUpperCase() ?? "",
    row.loadedQuantity ?? ""
  ].join("|");
}

function emptySummary(rowsProcessed: number): DispatchSummary {
  return {
    rowsProcessed,
    matchedCount: 0,
    programmedNotDispatchedCount: 0,
    dispatchedNotProgrammedCount: 0,
    truckMismatchCount: 0,
    unknownTruckCount: 0,
    duplicateRowCount: 0
  };
}

export function reconcileDispatchRows(
  importId: string,
  rows: ParsedDispatchRow[],
  trucks: KnownTruck[],
  programmedCycles: ProgrammedCycle[]
): DispatchReconciliation {
  const trucksByPlate = new Map(trucks.map((truck) => [truck.normalizedRegistration, truck]));
  const cyclesByAtc = new Map<string, ProgrammedCycle[]>();
  programmedCycles.forEach((cycle) => {
    const atcNo = cycle.atcNo?.trim().toUpperCase();
    if (!atcNo) return;
    cyclesByAtc.set(atcNo, [...(cyclesByAtc.get(atcNo) ?? []), cycle]);
  });

  const duplicateCounts = new Map<string, number>();
  rows.forEach((row) => {
    const key = duplicateKey(row);
    duplicateCounts.set(key, (duplicateCounts.get(key) ?? 0) + 1);
  });

  const matchedCycleIds = new Set<string>();
  const records: ReconciledDispatchRecord[] = [];
  const summary = emptySummary(rows.length);

  rows.forEach((row) => {
    const base = { ...row, id: `${importId}_row_${row.sourceRowNumber}`, recordKind: "IMPORT_ROW" as const };
    const duplicate = (duplicateCounts.get(duplicateKey(row)) ?? 0) > 1;
    if (duplicate) {
      summary.duplicateRowCount += 1;
      records.push({ ...base, matchStatus: "DUPLICATE_ROW", matchReason: "The same dispatch row appears more than once in this report." });
      return;
    }

    const truck = trucksByPlate.get(row.normalizedTruckPlate);
    if (!truck) {
      summary.unknownTruckCount += 1;
      records.push({ ...base, matchStatus: "UNKNOWN_TRUCK", matchReason: "The truck plate is not registered for this site." });
      return;
    }

    const cycles = row.atcNo ? cyclesByAtc.get(row.atcNo.trim().toUpperCase()) ?? [] : [];
    if (cycles.length === 0) {
      summary.dispatchedNotProgrammedCount += 1;
      records.push({ ...base, truckId: truck.id, matchStatus: "DISPATCHED_NOT_PROGRAMMED", matchReason: row.atcNo ? "The ATC number is not tied to a currently programmed queue entry." : "The dispatch row has no ATC number." });
      return;
    }

    if (cycles.length > 1) {
      summary.truckMismatchCount += 1;
      records.push({ ...base, truckId: truck.id, matchStatus: "TRUCK_MISMATCH", matchReason: "The ATC number is tied to more than one programmed queue entry." });
      return;
    }

    const cycle = cycles[0]!;
    if (cycle.truckId !== truck.id || cycle.normalizedRegistration !== row.normalizedTruckPlate) {
      summary.truckMismatchCount += 1;
      records.push({
        ...base,
        truckId: truck.id,
        matchedQueueCycleId: cycle.id,
        matchedProgrammingBatchId: cycle.programmingBatchId,
        matchStatus: "TRUCK_MISMATCH",
        matchReason: `ATC ${row.atcNo} belongs to programmed truck ${cycle.registrationNumber}, not ${truck.registrationNumber}.`
      });
      return;
    }

    if (matchedCycleIds.has(cycle.id)) {
      summary.duplicateRowCount += 1;
      records.push({ ...base, truckId: truck.id, matchStatus: "DUPLICATE_ROW", matchReason: "This programmed queue entry has already been matched in the report." });
      return;
    }

    matchedCycleIds.add(cycle.id);
    summary.matchedCount += 1;
    records.push({
      ...base,
      truckId: truck.id,
      driverName: row.driverName ?? truck.driverName,
      matchedQueueCycleId: cycle.id,
      matchedProgrammingBatchId: cycle.programmingBatchId,
      matchStatus: "MATCHED",
      matchReason: "ATC number and truck plate match the programmed FIFO entry."
    });
  });

  programmedCycles.forEach((cycle) => {
    if (matchedCycleIds.has(cycle.id)) return;
    summary.programmedNotDispatchedCount += 1;
    records.push({
      id: `${importId}_missing_${cycle.id}`,
      sourceRowNumber: 0,
      loadingDate: cycle.programmedAt,
      rawTruckPlate: cycle.registrationNumber,
      normalizedTruckPlate: cycle.normalizedRegistration,
      truckId: cycle.truckId,
      driverName: cycle.driverName,
      atcNo: cycle.atcNo,
      matchedQueueCycleId: cycle.id,
      matchedProgrammingBatchId: cycle.programmingBatchId,
      recordKind: "PROGRAMMING_EXCEPTION",
      matchStatus: "PROGRAMMED_NOT_DISPATCHED",
      matchReason: "This programmed FIFO entry does not appear in the dispatch report.",
      rawData: {}
    });
  });

  return { records, matchedCycleIds: [...matchedCycleIds], summary };
}
