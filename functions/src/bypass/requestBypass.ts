import { requestBypassInputSchema } from "@refinery/validation";
import { Timestamp } from "firebase-admin/firestore";
import { validatedCall } from "../shared/callable.js";
import { requireAuth, requireRole, requireSameSite } from "../shared/auth.js";
import { db } from "../shared/firebase.js";
import { failedPrecondition, notFound, permissionDenied } from "../shared/errors.js";
import {
  bypassAuthorizationsRef,
  bypassRequestsRef,
  queueCyclesRef,
  trucksRef,
  usersRef
} from "../shared/paths.js";
import { writeAuditEvent } from "../shared/audit.js";
import { writeNotification } from "../shared/notifications.js";
import { calculateQueuePosition } from "./queuePosition.js";

export const requestBypass = validatedCall(
  requestBypassInputSchema,
  async (data, request) => {
    const context = requireAuth(request);
    requireSameSite(context, data.siteId);
    requireRole(context, "fleetOfficer");

    return db.runTransaction(async (transaction) => {
      const truckRef = trucksRef(data.siteId).doc(data.truckId);
      const cycleRef = queueCyclesRef(data.siteId).doc(data.queueCycleId);
      const cycleRequestsQuery = bypassRequestsRef(data.siteId).where(
        "queueCycleId",
        "==",
        data.queueCycleId
      );
      const activeQueueQuery = queueCyclesRef(data.siteId)
        .where("status", "==", "QUEUED")
        .orderBy("queueEnteredAt", "asc");
      const overseersQuery = usersRef(data.siteId).where(
        "roles",
        "array-contains",
        "overseer"
      );
      const [truckSnap, cycleSnap, requestSnapshot, queueSnapshot, overseerSnapshot] =
        await Promise.all([
          transaction.get(truckRef),
          transaction.get(cycleRef),
          transaction.get(cycleRequestsQuery),
          transaction.get(activeQueueQuery),
          transaction.get(overseersQuery)
        ]);

      if (!truckSnap.exists) {
        notFound("Truck was not found.");
      }

      if (!cycleSnap.exists) {
        notFound("Queue cycle was not found.");
      }

      const truck = truckSnap.data() ?? {};
      const cycle = cycleSnap.data() ?? {};

      if (truck.assignedFleetOfficerId !== context.uid) {
        permissionDenied("Fleet officers can only request bypass for assigned trucks.");
      }

      if (
        cycle.truckId !== data.truckId ||
        cycle.fleetOfficerId !== context.uid ||
        truck.activeCycleId !== data.queueCycleId
      ) {
        failedPrecondition("Truck and queue cycle do not match the active assignment.");
      }

      if (truck.currentStatus !== "QUEUED" || cycle.status !== "QUEUED") {
        failedPrecondition("Bypass can only be requested for a queued truck.");
      }

      const approvedRequests = requestSnapshot.docs.filter(
        (doc) => doc.data().status === "APPROVED"
      );
      const approvedAuthorizationEntries = approvedRequests.map((requestDoc) => {
        const authorizationId = requestDoc.data().authorizationId;

        return {
          requestDoc,
          authorizationId:
            typeof authorizationId === "string" && authorizationId.length > 0
              ? authorizationId
              : undefined
        };
      });
      const approvedAuthorizationRefs = approvedAuthorizationEntries
        .filter(
          (
            entry
          ): entry is typeof entry & { authorizationId: string } =>
            entry.authorizationId !== undefined
        )
        .map((entry) =>
          bypassAuthorizationsRef(data.siteId).doc(entry.authorizationId)
        );
      const approvedAuthorizationSnaps = await Promise.all(
        approvedAuthorizationRefs.map((ref) => transaction.get(ref))
      );
      const now = Timestamp.now();
      const authorizationSnapsById = new Map(
        approvedAuthorizationSnaps.map((snap) => [snap.id, snap])
      );
      const staleApprovedRequests: Array<{
        requestRef: FirebaseFirestore.DocumentReference;
        requestStatus: "EXPIRED" | "USED";
        authorizationRef?: FirebaseFirestore.DocumentReference;
        expireAuthorization: boolean;
      }> = [];

      for (const entry of approvedAuthorizationEntries) {
        const authorizationSnap = entry.authorizationId
          ? authorizationSnapsById.get(entry.authorizationId)
          : undefined;

        if (!authorizationSnap?.exists) {
          staleApprovedRequests.push({
            requestRef: entry.requestDoc.ref,
            requestStatus: "EXPIRED",
            expireAuthorization: false
          });
          continue;
        }

        const authorization = authorizationSnap.data() ?? {};
        const expiresAt = authorization.expiresAt;
        const isUsable =
          (authorization.status === "ACTIVE" || authorization.status === "VALIDATED") &&
          expiresAt instanceof Timestamp &&
          expiresAt.toMillis() > now.toMillis();

        if (isUsable) {
          failedPrecondition("This truck already has an active bypass authorization.");
        }

        staleApprovedRequests.push({
          requestRef: entry.requestDoc.ref,
          requestStatus: authorization.status === "USED" ? "USED" : "EXPIRED",
          authorizationRef: authorizationSnap.ref,
          expireAuthorization:
            authorization.status === "ACTIVE" ||
            authorization.status === "VALIDATED"
        });
      }

      if (requestSnapshot.docs.some((doc) => doc.data().status === "PENDING")) {
        failedPrecondition("This truck already has a pending bypass request.");
      }

      const queuePositionAtRequest = calculateQueuePosition(
        queueSnapshot.docs,
        data.queueCycleId
      );

      if (queuePositionAtRequest === 0) {
        failedPrecondition("Truck is no longer in the active queue.");
      }

      if (queuePositionAtRequest === 1) {
        failedPrecondition("Bypass is unnecessary for the first truck in the queue.");
      }

      const requestRef = bypassRequestsRef(data.siteId).doc();
      const numberOfTrucksBypassed = queuePositionAtRequest - 1;

      staleApprovedRequests.forEach((staleRequest) => {
        transaction.update(staleRequest.requestRef, {
          status: staleRequest.requestStatus
        });

        if (staleRequest.authorizationRef && staleRequest.expireAuthorization) {
          transaction.update(staleRequest.authorizationRef, {
            status: "EXPIRED"
          });
        }
      });

      transaction.set(requestRef, {
        siteId: data.siteId,
        truckId: data.truckId,
        queueCycleId: data.queueCycleId,
        requestedBy: context.uid,
        requestedByName: String(truck.assignedFleetOfficerName ?? context.uid),
        fleetOfficerId: context.uid,
        queuePositionAtRequest,
        numberOfTrucksBypassed,
        reasonCategory: data.reasonCategory,
        explanation: data.explanation,
        status: "PENDING",
        requestedAt: now
      });

      writeAuditEvent(transaction, {
        siteId: data.siteId,
        eventType: "BYPASS_REQUESTED",
        actorUserId: context.uid,
        actorRoles: context.roles,
        truckId: data.truckId,
        queueCycleId: data.queueCycleId,
        bypassRequestId: requestRef.id,
        newState: {
          status: "PENDING",
          queuePositionAtRequest,
          numberOfTrucksBypassed,
          reasonCategory: data.reasonCategory
        }
      });

      overseerSnapshot.docs
        .filter((doc) => doc.data().isActive === true)
        .forEach((overseer) => {
          writeNotification(transaction, {
            siteId: data.siteId,
            userId: overseer.id,
            type: "BYPASS_REQUESTED",
            title: "Bypass approval needed",
            body: `${String(truck.registrationNumber ?? data.truckId)} is requesting a queue bypass.`,
            truckId: data.truckId,
            bypassRequestId: requestRef.id
          });
        });

      return {
        bypassRequestId: requestRef.id,
        queuePositionAtRequest,
        numberOfTrucksBypassed,
        status: "PENDING" as const
      };
    });
  }
);
