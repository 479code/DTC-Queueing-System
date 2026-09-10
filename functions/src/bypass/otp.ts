import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export type BypassOtpBinding = {
  siteId: string;
  bypassRequestId: string;
  truckId: string;
  queueCycleId: string;
  requestedBy: string;
  approvedBy: string;
  expiresAtMillis: number;
};

function otpPayload(otp: string, binding: BypassOtpBinding): string {
  return JSON.stringify([
    "bypass-otp-v1",
    binding.siteId,
    binding.bypassRequestId,
    binding.truckId,
    binding.queueCycleId,
    binding.requestedBy,
    binding.approvedBy,
    binding.expiresAtMillis,
    otp
  ]);
}

export function generateBypassOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashBypassOtp(
  otp: string,
  binding: BypassOtpBinding,
  pepper: string
): string {
  return createHmac("sha256", pepper)
    .update(otpPayload(otp, binding))
    .digest("hex");
}

export function verifyBypassOtp(
  otp: string,
  binding: BypassOtpBinding,
  pepper: string,
  expectedHash: string
): boolean {
  const actual = Buffer.from(hashBypassOtp(otp, binding, pepper), "hex");
  const expected = Buffer.from(expectedHash, "hex");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
