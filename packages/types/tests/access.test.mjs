import assert from "node:assert/strict";
import test from "node:test";

const { USER_ROLES, isFleetOnlyRoleSet, visibleViewsForRoles } = await import("../dist/index.js");

test("a fleet officer sees only their own two pages", () => {
  assert.deepEqual(visibleViewsForRoles(["fleetOfficer"]), ["my-fleet", "my-bypass"]);
  assert.equal(isFleetOnlyRoleSet(["fleetOfficer"]), true);
});

test("an operational role never sees the fleet officer pages", () => {
  for (const role of USER_ROLES.filter((item) => item !== "fleetOfficer")) {
    const views = visibleViewsForRoles([role]);
    assert.ok(!views.includes("my-fleet"), `${role} must not see my-fleet`);
    assert.ok(!views.includes("my-bypass"), `${role} must not see my-bypass`);
    assert.ok(views.length > 0, `${role} must see something`);
  }
});

test("only the roles that may act see the pages that act", () => {
  assert.ok(visibleViewsForRoles(["programmingOfficer"]).includes("programming"));
  assert.ok(!visibleViewsForRoles(["management"]).includes("programming"));
  assert.ok(!visibleViewsForRoles(["auditor"]).includes("programming"));

  assert.ok(visibleViewsForRoles(["overseer"]).includes("bypass"));
  assert.ok(!visibleViewsForRoles(["programmingOfficer"]).includes("bypass"));

  assert.ok(visibleViewsForRoles(["administrator"]).includes("staff"));
  assert.ok(!visibleViewsForRoles(["management"]).includes("staff"));
});

test("the audit log is only for roles that may read it", () => {
  for (const role of ["management", "auditor", "administrator"]) {
    assert.ok(visibleViewsForRoles([role]).includes("audit"), `${role} should see the audit log`);
  }
  for (const role of ["programmingOfficer", "overseer", "fleetOfficer"]) {
    assert.ok(!visibleViewsForRoles([role]).includes("audit"), `${role} must not see the audit log`);
  }
});

test("two roles combine without repeating a page", () => {
  const views = visibleViewsForRoles(["management", "auditor"]);
  assert.equal(new Set(views).size, views.length);
  assert.ok(views.includes("audit"));
  assert.ok(views.includes("queue"));
});

test("someone holding a fleet role alongside another role is not treated as fleet only", () => {
  assert.equal(isFleetOnlyRoleSet(["fleetOfficer", "management"]), false);
  assert.ok(!visibleViewsForRoles(["fleetOfficer", "management"]).includes("my-fleet"));
});

test("no roles means no pages", () => {
  assert.deepEqual(visibleViewsForRoles([]), []);
  assert.equal(isFleetOnlyRoleSet([]), false);
});
