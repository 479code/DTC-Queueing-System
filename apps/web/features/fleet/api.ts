import { httpsCallable } from "firebase/functions";
import { auth, functions } from "../../firebase/client";
import type { InsuranceStatus, TruckStatus } from "../operations/api";

export async function reportFleetReturn(input: { siteId: string; truckId: string; insuranceStatus: InsuranceStatus }): Promise<{
  cycleId: string;
  status: Extract<TruckStatus, "QUEUED" | "INSURANCE_HOLD">;
}> {
  if (!functions || !auth?.currentUser) {
    return {
      cycleId: `cycle-demo-${input.truckId}`,
      status: input.insuranceStatus === "VALID" || input.insuranceStatus === "EXPIRING_SOON" ? "QUEUED" : "INSURANCE_HOLD"
    };
  }

  const callable = httpsCallable<{ siteId: string; truckId: string }, { cycleId: string; status: Extract<TruckStatus, "QUEUED" | "INSURANCE_HOLD"> }>(functions, "reportTruckReturn");
  return (await callable({ siteId: input.siteId, truckId: input.truckId })).data;
}

export async function requestFleetBypass(input: {
  siteId: string;
  truckId: string;
  queueCycleId: string;
  reasonCategory: string;
  explanation: string;
}): Promise<{ bypassRequestId: string; queuePositionAtRequest: number; numberOfTrucksBypassed: number }> {
  if (!functions || !auth?.currentUser) {
    return { bypassRequestId: "BR-DEMO-NEW", queuePositionAtRequest: 7, numberOfTrucksBypassed: 6 };
  }

  const callable = httpsCallable<typeof input, { bypassRequestId: string; queuePositionAtRequest: number; numberOfTrucksBypassed: number }>(functions, "requestBypass");
  return (await callable(input)).data;
}

export async function validateFleetBypassOtp(input: {
  siteId: string;
  truckId: string;
  otp: string;
}): Promise<{ authorizationId: string; status: "VALIDATED"; expiresAt: string }> {
  if (!functions || !auth?.currentUser) {
    if (input.otp !== "482193") throw new Error("Incorrect bypass code. Use the code provided by the approving overseer.");
    return { authorizationId: "AUTH-DEMO-919", status: "VALIDATED", expiresAt: new Date(Date.now() + 600000).toISOString() };
  }

  const callable = httpsCallable<typeof input, { authorizationId: string; status: "VALIDATED"; expiresAt: string }>(functions, "validateBypassOtp");
  return (await callable(input)).data;
}
