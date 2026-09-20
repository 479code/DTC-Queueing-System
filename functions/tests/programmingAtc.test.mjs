import assert from "node:assert/strict";
import test from "node:test";
import { confirmProgrammingBatchInputSchema } from "@refinery/validation";
import { parseOrderRows } from "../lib/orders/parseOrderRows.js";

const baseInput = {
  siteId: "site-a",
  requestedSize: 2,
  atcAssignments: [
    { queueCycleId: "cycle-a", atcNo: "atc-1001" },
    { queueCycleId: "cycle-b", atcNo: "ATC-1002" }
  ]
};

test("programming confirmation requires an ATC assignment", () => {
  const result = confirmProgrammingBatchInputSchema.safeParse({
    siteId: "site-a",
    requestedSize: 1
  });

  assert.equal(result.success, false);
});

test("programming confirmation normalizes entered ATC numbers", () => {
  const result = confirmProgrammingBatchInputSchema.parse(baseInput);

  assert.equal(result.atcAssignments[0].atcNo, "ATC-1001");
  assert.equal(result.atcAssignments[1].atcNo, "ATC-1002");
});

test("programming confirmation rejects a blank ATC number", () => {
  const result = confirmProgrammingBatchInputSchema.safeParse({
    ...baseInput,
    atcAssignments: [{ queueCycleId: "cycle-a", atcNo: "   " }]
  });

  assert.equal(result.success, false);
});

test("incoming order sheets preserve supplied ATCs and sales order numbers", () => {
  const rows = parseOrderRows([
    ["Incoming orders"],
    ["S/N", "DPRP Customer Name", "Receiving Customer/Station Name", "Volume", "ATC NO", "SALES ORDER NO"],
    [1, "sus oil and gas ltd", "Amkar general merchandise Ltd", 50000, "0472438", "2100001970"]
  ]);
  assert.equal(rows.rows.length, 1);
  assert.equal(rows.skipped.length, 0);
  assert.equal(rows.rows[0].atcNo, "0472438");
  assert.equal(rows.rows[0].salesOrderNo, "2100001970");
  assert.equal(rows.rows[0].volume, 50000);
});

const header = ["S/N", "DPRP Customer Name", "Volume", "ATC NO", "SALES ORDER NO"];
const order = (serial, atcNo, salesOrderNo) => [serial, "SUS Oil and Gas Ltd", 50000, atcNo, salesOrderNo];

test("a row with no ATC number is set aside, and the rest of the file still imports", () => {
  const result = parseOrderRows([
    header,
    order(1, "0472438", "2100001970"),
    order(2, "", "2100001971"),
    order(3, "0472440", "2100001972")
  ]);

  assert.deepEqual(result.rows.map((row) => row.atcNo), ["0472438", "0472440"]);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].sourceRowNumber, 3);
  assert.equal(result.skipped[0].reason, "No ATC number");
});

test("a row with no sales order number is set aside but keeps its ATC for the report", () => {
  const result = parseOrderRows([header, order(1, "0472438", ""), order(2, "0472439", "2100001971")]);

  assert.deepEqual(result.rows.map((row) => row.atcNo), ["0472439"]);
  assert.equal(result.skipped[0].atcNo, "0472438");
  assert.equal(result.skipped[0].reason, "No sales order number");
});

test("an ATC repeated inside one file keeps the first row and names it in the reason", () => {
  const result = parseOrderRows([
    header,
    order(1, "0472438", "2100001970"),
    order(2, "0472439", "2100001971"),
    order(3, "0472438", "2100001972")
  ]);

  assert.deepEqual(result.rows.map((row) => row.salesOrderNo), ["2100001970", "2100001971"]);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].sourceRowNumber, 4);
  assert.match(result.skipped[0].reason, /row 2 was kept/);
});

test("nineteen good rows survive one bad one", () => {
  const rows = [header];
  for (let index = 0; index < 20; index += 1) {
    rows.push(order(index + 1, index === 7 ? "" : `04724${String(index).padStart(2, "0")}`, `21000019${index}`));
  }

  const result = parseOrderRows(rows);

  assert.equal(result.rows.length, 19);
  assert.equal(result.skipped.length, 1);
});

test("a file with nothing usable reports every row rather than throwing", () => {
  const result = parseOrderRows([header, order(1, "", "2100001970"), order(2, "", "2100001971")]);

  assert.equal(result.rows.length, 0);
  assert.equal(result.skipped.length, 2);
});

test("a workbook without the required columns is still rejected outright", () => {
  assert.throws(() => parseOrderRows([["S/N", "Customer"], [1, "SUS Oil"]]), /ATC NO and SALES ORDER NO/);
});

test("a missing optional column leaves the field off rather than writing undefined", () => {
  const result = parseOrderRows([["S/N", "ATC NO", "SALES ORDER NO"], [1, "0472438", "3100458812"]]);
  const row = result.rows[0];

  assert.equal(row.expectedDeliveryDate, undefined);
  const present = Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
  assert.ok(!("expectedDeliveryDate" in present), "Firestore rejects an undefined value outright");
  assert.ok(!Object.values(present).includes(undefined));
});

test("a spreadsheet date cell is stored as a readable date, not a Date toString", () => {
  const result = parseOrderRows([
    ["S/N", "ATC NO", "SALES ORDER NO", "EXPECTED DELIVERY DATE"],
    [1, "0472438", "3100458812", new Date(Date.UTC(2026, 8, 22))]
  ]);

  assert.equal(result.rows[0].expectedDeliveryDate, "22 Sept 2026");
});
