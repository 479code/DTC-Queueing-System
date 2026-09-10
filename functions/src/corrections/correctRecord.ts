import { correctRecordInputSchema } from "@refinery/validation";
import { validatedCall } from "../shared/callable.js";
import { requireAuth, requireRole, requireSameSite } from "../shared/auth.js";
import { failedPrecondition } from "../shared/errors.js";

export const correctRecord = validatedCall(
  correctRecordInputSchema,
  async (data, request) => {
    const context = requireAuth(request);
    requireSameSite(context, data.siteId);
    requireRole(context, "administrator");

    failedPrecondition("correctRecord is scaffolded. Implement controlled correction and audit from docs/CODEX_HANDOFF.md.");
  }
);
