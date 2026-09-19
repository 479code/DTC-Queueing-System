import { FieldValue } from "firebase-admin/firestore";
import { confirmTruckDispatchInputSchema } from "@refinery/validation";
import { validatedCall } from "../shared/callable.js";
import { requireAuth, requireAnyRole, requireSameSite } from "../shared/auth.js";
import { db } from "../shared/firebase.js";
import { failedPrecondition, notFound } from "../shared/errors.js";
import { queueCyclesRef, trucksRef } from "../shared/paths.js";
import { writeAuditEvent } from "../shared/audit.js";

export const confirmTruckDispatch = validatedCall(confirmTruckDispatchInputSchema, async (data, request) => {
  const context = requireAuth(request);
  requireSameSite(context, data.siteId);
  requireAnyRole(context, ["programmingOfficer", "administrator"]);

  return db.runTransaction(async (transaction) => {
    const cycleRef = queueCyclesRef(data.siteId).doc(data.queueCycleId);
    const cycleSnapshot = await transaction.get(cycleRef);
    if (!cycleSnapshot.exists) notFound("The programmed truck was not found.");
    const cycle = cycleSnapshot.data() ?? {};
    if (cycle.status === "DISPATCHED") failedPrecondition("This truck is already recorded as dispatched.");
    if (cycle.status !== "PROGRAMMED") failedPrecondition("Only a programmed truck can be recorded as dispatched.");

    const truckRef = trucksRef(data.siteId).doc(String(cycle.truckId));
    transaction.update(cycleRef, {
      status: "DISPATCHED",
      dispatchConfirmedAt: FieldValue.serverTimestamp(),
      dispatchConfirmedBy: context.uid,
      updatedAt: FieldValue.serverTimestamp()
    });
    transaction.update(truckRef, {
      currentStatus: "ON_TRIP",
      activeCycleId: null,
      updatedAt: FieldValue.serverTimestamp()
    });
    writeAuditEvent(transaction, {
      siteId: data.siteId,
      eventType: "DISPATCH_CONFIRMED",
      actorUserId: context.uid,
      actorRoles: context.roles,
      truckId: String(cycle.truckId),
      queueCycleId: data.queueCycleId,
      programmingBatchId: typeof cycle.programmingBatchId === "string" ? cycle.programmingBatchId : undefined,
      metadata: { atcNo: cycle.atcNo ?? null, orderId: cycle.orderId ?? null, source: "SYSTEM_CONFIRMATION" }
    });
    return { queueCycleId: data.queueCycleId, truckId: String(cycle.truckId), status: "DISPATCHED" as const };
  });
});
