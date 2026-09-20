import assert from "node:assert/strict";
import test from "node:test";

const { STATUS_ORDER, groupByStatus, statusLabel } = await import("../dist/index.js");

const truck = (registration, status) => ({ registration, status });

test("rows are grouped in the canonical order, never interleaved", () => {
  const rows = [
    truck("ON-1", "ON_TRIP"),
    truck("HOLD-1", "INSURANCE_HOLD"),
    truck("QUEUE-1", "QUEUED"),
    truck("ON-2", "ON_TRIP"),
    truck("PROG-1", "PROGRAMMED"),
    truck("QUEUE-2", "QUEUED")
  ];

  const groups = groupByStatus(rows, (row) => row.status);

  assert.deepEqual(groups.map((group) => group.status), ["QUEUED", "PROGRAMMED", "ON_TRIP", "INSURANCE_HOLD"]);
  assert.deepEqual(groups[0].rows.map((row) => row.registration), ["QUEUE-1", "QUEUE-2"]);
  assert.deepEqual(groups[2].rows.map((row) => row.registration), ["ON-1", "ON-2"]);
});

test("a group with no rows is not rendered at all", () => {
  const groups = groupByStatus([truck("A", "QUEUED")], (row) => row.status);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, "In the line");
});

test("rows keep the order they arrived in within their group", () => {
  const rows = ["c", "a", "b"].map((id) => truck(id, "QUEUED"));
  const [group] = groupByStatus(rows, (row) => row.status);
  assert.deepEqual(group.rows.map((row) => row.registration), ["c", "a", "b"]);
});

test("a status nobody listed still appears, at the end", () => {
  const groups = groupByStatus(
    [truck("A", "SOMETHING_NEW"), truck("B", "QUEUED")],
    (row) => row.status
  );
  assert.deepEqual(groups.map((group) => group.status), ["QUEUED", "SOMETHING_NEW"]);
  assert.equal(groups[1].label, "Something new");
});

test("every ordered status has a readable label", () => {
  for (const status of STATUS_ORDER) {
    const label = statusLabel(status);
    assert.ok(label && label !== status, `${status} needs a label`);
    assert.ok(!label.includes("_"), `${status} label should read as words`);
  }
});

test("an empty list produces no groups", () => {
  assert.deepEqual(groupByStatus([], (row) => row.status), []);
});
