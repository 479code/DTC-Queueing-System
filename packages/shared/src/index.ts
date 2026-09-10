export const DEFAULT_SITE_ID = "default-site";

export const BYPASS_OTP_TTL_MINUTES = 10;

export const BYPASS_OTP_MAX_FAILED_ATTEMPTS = 5;

export const INSURANCE_WARNING_DAYS = [30, 14, 7, 1] as const;

export function normalizeRegistration(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function formatProgrammingBatchCode(date: Date, sequence: number): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const seq = String(sequence).padStart(4, "0");
  return `PB-${yyyy}${mm}${dd}-${seq}`;
}

export function assertPositiveBatchSize(value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("Batch size must be a positive whole number.");
  }
}
