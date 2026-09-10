import { defineSecret } from "firebase-functions/params";
import { failedPrecondition } from "../shared/errors.js";

export const bypassOtpPepper: ReturnType<typeof defineSecret> =
  defineSecret("BYPASS_OTP_PEPPER");

export function getBypassOtpPepper(): string {
  const value = bypassOtpPepper.value();

  if (value.length < 32) {
    failedPrecondition("BYPASS_OTP_PEPPER must be configured with at least 32 characters.");
  }

  return value;
}
