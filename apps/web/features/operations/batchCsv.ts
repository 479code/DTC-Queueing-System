import { parse } from "csv-parse/browser/esm/sync";
import type { FleetOfficerOption } from "./api";

export type BatchTruckRow = {
  rowNumber: number;
  registrationNumber: string;
  driverName: string;
  assignedFleetOfficerId: string;
  fleetOfficerName: string;
  errors: string[];
};

function normalizedHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

function valueFor(row: Record<string, string>, acceptedHeaders: string[]): string {
  const entry = Object.entries(row).find(([key]) =>
    acceptedHeaders.includes(normalizedHeader(key))
  );
  return entry?.[1]?.trim() ?? "";
}

export function parseBatchTruckCsv(
  content: string,
  officers: FleetOfficerOption[]
): BatchTruckRow[] {
  const records = parse(content, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true
  }) as Record<string, string>[];
  if (records.length === 0) {
    throw new Error("The CSV file contains no truck rows.");
  }
  if (records.length > 100) {
    throw new Error("A batch can contain at most 100 trucks.");
  }

  const officerByLabel = new Map<string, FleetOfficerOption>();
  officers.forEach((officer) => {
    officerByLabel.set(officer.id.toLowerCase(), officer);
    officerByLabel.set(officer.name.toLowerCase(), officer);
  });

  const rows = records.map((record, index) => {
    const registrationNumber = valueFor(record, [
      "registrationnumber",
      "registration",
      "truckregistration"
    ]);
    const driverName = valueFor(record, ["drivername", "driver"]);
    const officerValue = valueFor(record, [
      "fleetofficer",
      "fleetofficername",
      "officer"
    ]);
    const officer = officerByLabel.get(officerValue.toLowerCase());
    const errors: string[] = [];

    if (registrationNumber.length < 2) errors.push("Registration is required");
    if (driverName.length < 2) errors.push("Driver name is required");
    if (!officer) errors.push("Fleet officer was not found");

    return {
      rowNumber: index + 2,
      registrationNumber,
      driverName,
      assignedFleetOfficerId: officer?.id ?? "",
      fleetOfficerName: officer?.name ?? officerValue,
      errors
    };
  });

  const rowsByRegistration = new Map<string, BatchTruckRow[]>();
  rows.forEach((row) => {
    const normalized = row.registrationNumber.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!normalized) return;
    rowsByRegistration.set(normalized, [...(rowsByRegistration.get(normalized) ?? []), row]);
  });
  rowsByRegistration.forEach((duplicates) => {
    if (duplicates.length > 1) {
      duplicates.forEach((row) => row.errors.push("Duplicate registration in file"));
    }
  });

  return rows;
}
