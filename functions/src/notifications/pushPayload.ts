const INVALID_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token"
]);

export type PushNotificationSource = {
  title: string;
  body: string;
  type?: string;
  truckId?: string;
  bypassRequestId?: string;
  bypassAuthorizationId?: string;
};

export function isInvalidRegistrationToken(code: string | undefined): boolean {
  return typeof code === "string" && INVALID_TOKEN_CODES.has(code);
}

export function chunkTokens(tokens: string[], size = 500): string[][] {
  if (!Number.isInteger(size) || size < 1 || size > 500) {
    throw new Error("FCM token batch size must be between 1 and 500.");
  }

  const chunks: string[][] = [];
  for (let index = 0; index < tokens.length; index += size) {
    chunks.push(tokens.slice(index, index + size));
  }
  return chunks;
}

export function buildPushData(
  notificationId: string,
  source: PushNotificationSource
): Record<string, string> {
  const data: Record<string, string> = { notificationId };

  if (source.type) data.type = source.type;
  if (source.truckId) data.truckId = source.truckId;
  if (source.bypassRequestId) data.bypassRequestId = source.bypassRequestId;
  if (source.bypassAuthorizationId) {
    data.bypassAuthorizationId = source.bypassAuthorizationId;
  }

  return data;
}
