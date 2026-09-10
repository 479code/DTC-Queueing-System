export type RecordedInsuranceStatus = "VALID" | "EXPIRING_SOON" | "EXPIRED";

export function evaluateInsuranceStatus(
  effectiveAtMillis: number,
  expiresAtMillis: number,
  nowMillis: number
): RecordedInsuranceStatus {
  if (expiresAtMillis <= effectiveAtMillis) {
    throw new Error("Insurance expiry must be after its effective date.");
  }

  if (expiresAtMillis <= nowMillis || effectiveAtMillis > nowMillis) {
    return "EXPIRED";
  }

  const daysRemaining = (expiresAtMillis - nowMillis) / (24 * 60 * 60 * 1000);
  return daysRemaining <= 30 ? "EXPIRING_SOON" : "VALID";
}
