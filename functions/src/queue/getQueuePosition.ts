import { z } from "zod";
import { validatedCall } from "../shared/callable.js";
import { requireAuth, requireSameSite } from "../shared/auth.js";
import { failedPrecondition, notFound, permissionDenied } from "../shared/errors.js";
import { db } from "../shared/firebase.js";
import { queueCyclesRef } from "../shared/paths.js";

export const getQueuePosition = validatedCall(
  z.object({
    siteId: z.string().min(1),
    queueCycleId: z.string().min(1)
  }),
  async (data, request) => {
    const context = requireAuth(request);
    requireSameSite(context, data.siteId);

    const cycleRef = queueCyclesRef(data.siteId).doc(data.queueCycleId);
    const cycleSnap = await cycleRef.get();

    if (!cycleSnap.exists) {
      notFound("Queue cycle was not found.");
    }

    const cycle = cycleSnap.data() ?? {};

    const canViewAllQueuePositions = context.roles.some((role) =>
      ["programmingOfficer", "overseer", "management", "auditor", "administrator"].includes(role)
    );
    if (!canViewAllQueuePositions && cycle.fleetOfficerId !== context.uid) {
      permissionDenied("Fleet officers can only view positions for their assigned queue cycles.");
    }

    if (cycle.status !== "QUEUED" || !cycle.queueEnteredAt) {
      failedPrecondition("Only active queued cycles have a queue position.");
    }

    const earlierSnapshot = await db
      .collection(`sites/${data.siteId}/queueCycles`)
      .where("status", "==", "QUEUED")
      .where("queueEnteredAt", "<", cycle.queueEnteredAt)
      .count()
      .get();

    return {
      queueCycleId: data.queueCycleId,
      position: earlierSnapshot.data().count + 1
    };
  }
);
