import assert from "node:assert/strict";
import test from "node:test";
import { parseDispatchRows, reconcileDispatchRows } from "../lib/dispatch/reconcile.js";

test("dispatch rows are parsed from the agreed workbook columns", () => {
  const rows = parseDispatchRows([
    ["Dispatch report"],
    ["S/N", "Loading Date", "Truck Plate", "Driver Name", "ATC NO", "Loaded Quantity"],
    [1, "10/09/2026", "FZE 481 DI", "Musa Abdullahi", "atc-1001", "33,000"]
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].sourceRowNumber, 3);
  assert.equal(rows[0].normalizedTruckPlate, "FZE481DI");
  assert.equal(rows[0].atcNo, "ATC-1001");
  assert.equal(rows[0].loadedQuantity, 33000);
  assert.equal(rows[0].loadingDate.toISOString(), "2026-09-10T00:00:00.000Z");
});

test("dispatch parsing rejects a workbook without the required matching columns", () => {
  assert.throws(
    () => parseDispatchRows([["Loading Date", "Truck Plate"], ["10/09/2026", "FZE 481 DI"]]),
    /Loading Date, Truck Plate, and ATC NO/
  );
});

test("reconciliation follows the programmed ATC and truck pairing", () => {
  const loadingDate = new Date("2026-09-10T00:00:00.000Z");
  const programmedAt = new Date("2026-09-09T16:00:00.000Z");
  const trucks = [
    { id: "truck-fze", registrationNumber: "FZE 481 DI", normalizedRegistration: "FZE481DI", driverName: "Musa Abdullahi" },
    { id: "truck-ktp", registrationNumber: "KTP 106 XA", normalizedRegistration: "KTP106XA", driverName: "Emeka Nwosu" },
    { id: "truck-abu", registrationNumber: "ABU 302 LM", normalizedRegistration: "ABU302LM", driverName: "Bello Garba" },
    { id: "truck-phc", registrationNumber: "PHC 725 CE", normalizedRegistration: "PHC725CE", driverName: "Victor Udo" },
    { id: "truck-lag", registrationNumber: "LAG 552 HT", normalizedRegistration: "LAG552HT", driverName: "Peter Okon" }
  ];
  const cycles = [
    { id: "cycle-fze", truckId: "truck-fze", registrationNumber: "FZE 481 DI", normalizedRegistration: "FZE481DI", atcNo: "ATC-1001", programmingBatchId: "batch-a", programmedAt },
    { id: "cycle-ktp", truckId: "truck-ktp", registrationNumber: "KTP 106 XA", normalizedRegistration: "KTP106XA", atcNo: "ATC-1002", programmingBatchId: "batch-a", programmedAt },
    { id: "cycle-lag", truckId: "truck-lag", registrationNumber: "LAG 552 HT", normalizedRegistration: "LAG552HT", atcNo: "ATC-1003", programmingBatchId: "batch-a", programmedAt }
  ];
  const makeRow = (sourceRowNumber, rawTruckPlate, atcNo, deliveryNo) => ({
    sourceRowNumber,
    loadingDate,
    rawTruckPlate,
    normalizedTruckPlate: rawTruckPlate.replace(/[^a-zA-Z0-9]/g, "").toUpperCase(),
    atcNo,
    deliveryNo,
    loadedQuantity: 33000,
    product: "AGO",
    rawData: {}
  });
  const rows = [
    makeRow(2, "FZE 481 DI", "ATC-1001", "DEL-1"),
    makeRow(3, "FZE 481 DI", "ATC-1002", "DEL-2"),
    makeRow(4, "ZZZ 999 ZZ", "ATC-1003", "DEL-3"),
    makeRow(5, "ABU 302 LM", "ATC-9999", "DEL-4"),
    makeRow(6, "PHC 725 CE", "ATC-8888", "DEL-5"),
    makeRow(7, "PHC 725 CE", "ATC-8888", "DEL-5")
  ];

  const result = reconcileDispatchRows("import-a", rows, trucks, cycles);

  assert.deepEqual(result.summary, {
    rowsProcessed: 6,
    matchedCount: 1,
    programmedNotDispatchedCount: 2,
    dispatchedNotProgrammedCount: 1,
    truckMismatchCount: 1,
    unknownTruckCount: 1,
    duplicateRowCount: 2
  });
  assert.deepEqual(result.matchedCycleIds, ["cycle-fze"]);
  assert.equal(result.records.filter((record) => record.matchStatus === "PROGRAMMED_NOT_DISPATCHED").length, 2);
  assert.match(
    result.records.find((record) => record.matchStatus === "TRUCK_MISMATCH").matchReason,
    /KTP 106 XA/
  );
});
