import { listValidatedBypassesInputSchema } from "@refinery/validation";
import { Timestamp } from "firebase-admin/firestore";
import { requireAuth, requireRole, requireSameSite } from "../shared/auth.js";
import { validatedCall } from "../shared/callable.js";
import { db } from "../shared/firebase.js";
import {
  bypassAuthorizationsRef,
  queueCyclesRef,
  trucksRef
} from "../shared/paths.js";

export const listValidatedBypasses = validatedCall(
  listValidatedBypassesInputSchema,
  async (data, request) => {
    const context = requireAuth(request);
    requireSameSite(context, data.siteId);
    requireRole(context, "programmingOfficer");

    const [authorizationSnapshot, queueSnapshot] = await Promise.all([
      bypassAuthorizationsRef(data.siteId).where("status", "==", "VALIDATED").get(),
      queueCyclesRef(data.siteId)
        .where("status", "==", "QUEUED")
        .orderBy("queueEnteredAt", "asc")
        .get()
    ]);
    const nowMillis = Timestamp.now().toMillis();
    const queuePositionByCycle = new Map(
      queueSnapshot.docs.map((cycle, index) => [cycle.id, index + 1])
    );

    const candidates = authorizationSnapshot.docs
      .map((authorization) => {
        const authorizationData = authorization.data();
        return {
          id: authorization.id,
          truckId: authorizationData.truckId,
          queueCycleId: authorizationData.queueCycleId,
          expiresAt: authorizationData.expiresAt
        };
      })
      .filter((authorization) => {
        const expiresAt = authorization.expiresAt;
        return (
          expiresAt instanceof Timestamp &&
          expiresAt.toMillis() > nowMillis &&
          queuePositionByCycle.has(String(authorization.queueCycleId))
        );
      })
      .sort((left, right) => {
        const leftExpiry = left.expiresAt as FirebaseFirestore.Timestamp;
        const rightExpiry = right.expiresAt as FirebaseFirestore.Timestamp;
        return leftExpiry.toMillis() - rightExpiry.toMillis();
      });

    if (candidates.length === 0) {
      return [];
    }

    const trucks = await db.getAll(
      ...candidates.map((authorization) =>
        trucksRef(data.siteId).doc(String(authorization.truckId))
      )
    );

    return candidates.flatMap((authorization, index) => {
      const truck = trucks[index]?.data();
      const queueCycleId = String(authorization.queueCycleId);
      const originalQueuePosition = queuePositionByCycle.get(queueCycleId);
      const expiresAt = authorization.expiresAt as FirebaseFirestore.Timestamp;

      if (!truck || !originalQueuePosition) {
        return [];
      }

      return [{
        authorizationId: authorization.id,
        truckId: String(authorization.truckId),
        queueCycleId,
        registrationNumber: String(truck.registrationNumber ?? authorization.truckId),
        driverName: String(truck.driverName ?? "Driver not recorded"),
        originalQueuePosition,
        expiresAt: expiresAt.toDate().toISOString()
      }];
    });
  }
);
