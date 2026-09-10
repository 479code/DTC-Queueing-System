import { previewProgrammingBatchInputSchema } from "@refinery/validation";
import { db } from "../shared/firebase.js";
import { validatedCall } from "../shared/callable.js";
import { requireAuth, requireRole, requireSameSite } from "../shared/auth.js";
import { selectProgrammingBatch } from "./selectProgrammingBatch.js";

export const previewProgrammingBatch = validatedCall(
  previewProgrammingBatchInputSchema,
  async (data, request) => {
    const context = requireAuth(request);
    requireSameSite(context, data.siteId);
    requireRole(context, "programmingOfficer");

    const items = await db.runTransaction((transaction) =>
      selectProgrammingBatch(transaction, data)
    );

    return {
      requestedSize: data.requestedSize,
      fifoCount: items.filter((item) => item.selectionType === "FIFO").length,
      bypassCount: items.filter((item) => item.selectionType === "BYPASS").length,
      items: items.map((item) => ({
        ...item,
        queueEnteredAt: item.queueEnteredAt.toDate().toISOString()
      }))
    };
  }
);
