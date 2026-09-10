import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

process.env.BYPASS_OTP_PEPPER = "workflow-test-pepper-that-is-at-least-thirty-two-characters";

const { Timestamp } = await import("firebase-admin/firestore");
const { db, storage } = await import("../lib/shared/firebase.js");
const { reportTruckReturn } = await import("../lib/returns/reportTruckReturn.js");
const { requestBypass } = await import("../lib/bypass/requestBypass.js");
const { approveBypass } = await import("../lib/bypass/approveBypass.js");
const { validateBypassOtp } = await import("../lib/bypass/validateBypassOtp.js");
const { previewProgrammingBatch } = await import("../lib/programming/previewProgrammingBatch.js");
const { confirmProgrammingBatch } = await import("../lib/programming/confirmProgrammingBatch.js");
const { uploadDispatchReport } = await import("../lib/dispatch/uploadDispatchReport.js");
const { processDispatchImport } = await import("../lib/dispatch/processDispatchImport.js");

const siteId = "workflow-site";
const fleetOfficerId = "fleet-officer";
const overseerId = "overseer";
const programmerId = "programmer";

function request(uid, roles, data) {
  return { auth: { uid, token: { siteId, roles } }, data };
}

function truckRef(id) {
  return db.doc(`sites/${siteId}/trucks/${id}`);
}

function cycleRef(id) {
  return db.doc(`sites/${siteId}/queueCycles/${id}`);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZip(entries) {
  let offset = 0;
  const locals = [];
  const central = [];
  for (const [name, content] of entries) {
    const fileName = Buffer.from(name);
    const data = Buffer.from(content);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(fileName.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, fileName, data);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0, 8);
    directory.writeUInt16LE(0, 10);
    directory.writeUInt16LE(0, 12);
    directory.writeUInt16LE(0, 14);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(data.length, 20);
    directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(fileName.length, 28);
    directory.writeUInt16LE(0, 30);
    directory.writeUInt16LE(0, 32);
    directory.writeUInt16LE(0, 34);
    directory.writeUInt16LE(0, 36);
    directory.writeUInt32LE(0, 38);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, fileName);
    offset += local.length + fileName.length + data.length;
  }
  const centralSize = central.reduce((total, item) => total + item.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, ...central, end]);
}

function dispatchWorkbook() {
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Loading Date</t></is></c><c r="B1" t="inlineStr"><is><t>Truck Plate</t></is></c><c r="C1" t="inlineStr"><is><t>ATC NO</t></is></c><c r="D1" t="inlineStr"><is><t>Driver Name</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>10/09/2026</t></is></c><c r="B2" t="inlineStr"><is><t>FZE 919 DI</t></is></c><c r="C2" t="inlineStr"><is><t>ATC-WF-2</t></is></c><c r="D2" t="inlineStr"><is><t>Fleet Driver</t></is></c></row></sheetData></worksheet>`;
  return createZip([
    ["[Content_Types].xml", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/></Types>"],
    ["_rels/.rels", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>"],
    ["xl/workbook.xml", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\"Dispatch\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>"],
    ["xl/_rels/workbook.xml.rels", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/></Relationships>"],
    ["xl/worksheets/sheet1.xml", sheet]
  ]);
}

test("fleet return through dispatch preserves FIFO, bypass approval, OTP, ATC, reconciliation, and audit trail", async () => {
  const now = Date.now();
  const fleetTruckId = "fleet-truck";

  await Promise.all([
    db.doc(`sites/${siteId}/users/${fleetOfficerId}`).set({ siteId, isActive: true, name: "Fleet Officer", roles: ["fleetOfficer"] }),
    db.doc(`sites/${siteId}/users/${overseerId}`).set({ siteId, isActive: true, name: "Overseer", roles: ["overseer"] }),
    db.doc(`sites/${siteId}/users/${programmerId}`).set({ siteId, isActive: true, name: "Programmer", roles: ["programmingOfficer"] }),
    truckRef("first-truck").set({ registrationNumber: "AAA 001 AA", normalizedRegistration: "AAA001AA", assignedFleetOfficerId: "other-officer", currentStatus: "QUEUED", activeCycleId: "first-cycle", latestInsuranceStatus: "VALID" }),
    cycleRef("first-cycle").set({ siteId, truckId: "first-truck", fleetOfficerId: "other-officer", status: "QUEUED", queueEnteredAt: Timestamp.fromMillis(now - 180000) }),
    truckRef("middle-truck").set({ registrationNumber: "BBB 002 BB", normalizedRegistration: "BBB002BB", assignedFleetOfficerId: "other-officer", currentStatus: "QUEUED", activeCycleId: "middle-cycle", latestInsuranceStatus: "VALID" }),
    cycleRef("middle-cycle").set({ siteId, truckId: "middle-truck", fleetOfficerId: "other-officer", status: "QUEUED", queueEnteredAt: Timestamp.fromMillis(now - 120000) }),
    truckRef(fleetTruckId).set({ registrationNumber: "FZE 919 DI", normalizedRegistration: "FZE919DI", assignedFleetOfficerId: fleetOfficerId, assignedFleetOfficerName: "Fleet Officer", currentStatus: "ON_TRIP", activeCycleId: null, isActive: true, latestInsuranceStatus: "VALID" })
  ]);

  const returned = await reportTruckReturn.run(request(fleetOfficerId, ["fleetOfficer"], { siteId, truckId: fleetTruckId }));
  assert.equal(returned.status, "QUEUED");

  const queuePosition = await db.collection(`sites/${siteId}/queueCycles`).where("status", "==", "QUEUED").orderBy("queueEnteredAt", "asc").get();
  assert.deepEqual(queuePosition.docs.map((item) => item.data().truckId), ["first-truck", "middle-truck", fleetTruckId]);

  const bypass = await requestBypass.run(request(fleetOfficerId, ["fleetOfficer"], {
    siteId,
    truckId: fleetTruckId,
    queueCycleId: returned.cycleId,
    reasonCategory: "OPERATIONAL_REQUIREMENT",
    explanation: "Urgent delivery movement required for the destination."
  }));
  assert.equal(bypass.queuePositionAtRequest, 3);
  assert.equal(bypass.numberOfTrucksBypassed, 2);

  const approved = await approveBypass.run(request(overseerId, ["overseer"], { siteId, bypassRequestId: bypass.bypassRequestId }));
  assert.match(approved.otp, /^\d{6}$/);

  const validated = await validateBypassOtp.run(request(fleetOfficerId, ["fleetOfficer"], {
    siteId,
    truckId: fleetTruckId,
    otp: approved.otp
  }));
  assert.equal(validated.status, "VALIDATED");

  const preview = await previewProgrammingBatch.run(request(programmerId, ["programmingOfficer"], {
    siteId,
    requestedSize: 2,
    includeBypassAuthorizationIds: [approved.authorizationId]
  }));
  assert.equal(preview.fifoCount, 1);
  assert.equal(preview.bypassCount, 1);
  assert.deepEqual(preview.items.map((item) => item.selectionType), ["FIFO", "BYPASS"]);

  const confirmed = await confirmProgrammingBatch.run(request(programmerId, ["programmingOfficer"], {
    siteId,
    requestedSize: 2,
    includeBypassAuthorizationIds: [approved.authorizationId],
    atcAssignments: preview.items.map((item, index) => ({ queueCycleId: item.queueCycleId, atcNo: `ATC-WF-${index + 1}` }))
  }));
  assert.equal(confirmed.confirmedSize, 2);
  assert.equal(confirmed.bypassCount, 1);
  assert.equal(confirmed.atcCount, 2);

  const [fleetCycle, fleetTruck, authorization, bypassRequest, firstCycle, middleCycle, auditEvents] = await Promise.all([
    cycleRef(returned.cycleId).get(),
    truckRef(fleetTruckId).get(),
    db.doc(`sites/${siteId}/bypassAuthorizations/${approved.authorizationId}`).get(),
    db.doc(`sites/${siteId}/bypassRequests/${bypass.bypassRequestId}`).get(),
    cycleRef("first-cycle").get(),
    cycleRef("middle-cycle").get(),
    db.collection(`sites/${siteId}/auditEvents`).get()
  ]);

  assert.equal(fleetCycle.data()?.status, "PROGRAMMED");
  assert.equal(fleetCycle.data()?.atcNo, "ATC-WF-2");
  assert.equal(fleetTruck.data()?.currentStatus, "PROGRAMMED");
  assert.equal(authorization.data()?.status, "USED");
  assert.equal(bypassRequest.data()?.status, "USED");
  assert.equal(firstCycle.data()?.status, "PROGRAMMED");
  assert.equal(middleCycle.data()?.status, "QUEUED");

  const eventTypes = new Set(auditEvents.docs.map((item) => item.data().eventType));
  ["RETURN_REPORTED", "QUEUE_ENTERED", "BYPASS_REQUESTED", "BYPASS_APPROVED", "BYPASS_OTP_GENERATED", "BYPASS_OTP_VALIDATED", "BYPASS_OTP_USED", "TRUCK_PROGRAMMED", "PROGRAMMING_BATCH_CONFIRMED"].forEach((eventType) => assert.ok(eventTypes.has(eventType), `missing ${eventType}`));

  const importId = "workflow-dispatch-import";
  const workbook = dispatchWorkbook();
  const checksum = createHash("sha256").update(workbook).digest("hex");
  const storagePath = `sites/${siteId}/dispatch/${importId}/workflow.xlsx`;
  await storage.bucket().file(storagePath).save(workbook, {
    metadata: {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      metadata: { sha256: checksum }
    }
  });
  await uploadDispatchReport.run(request(programmerId, ["programmingOfficer"], {
    siteId,
    importId,
    storagePath,
    originalFileName: "workflow.xlsx",
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    fileSize: workbook.length,
    checksum
  }));
  const dispatch = await processDispatchImport.run(request(programmerId, ["programmingOfficer"], { siteId, importId }));
  assert.equal(dispatch.status, "PROCESSED");
  assert.equal(dispatch.matchedCount, 1);
  const [dispatchedCycle, returnedTruck, dispatchEvents] = await Promise.all([
    cycleRef(returned.cycleId).get(),
    truckRef(fleetTruckId).get(),
    db.collection(`sites/${siteId}/auditEvents`).where("dispatchImportId", "==", importId).get()
  ]);
  assert.equal(dispatchedCycle.data()?.status, "DISPATCHED");
  assert.equal(returnedTruck.data()?.currentStatus, "ON_TRIP");
  assert.ok(dispatchEvents.docs.some((item) => item.data().eventType === "DISPATCH_CONFIRMED"));
});
