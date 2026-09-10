import {
  onCall,
  type CallableOptions,
  type CallableRequest
} from "firebase-functions/v2/https";
import { z } from "zod";
import { invalidArgument } from "./errors.js";

export function validatedCall<TInput, TOutput>(
  schema: z.ZodType<TInput>,
  handler: (data: TInput, request: CallableRequest<TInput>) => Promise<TOutput>,
  options?: CallableOptions
) {
  const callableHandler = async (request: CallableRequest<TInput>) => {
    const parsed = schema.safeParse(request.data);

    if (!parsed.success) {
      invalidArgument(parsed.error.issues.map((issue) => issue.message).join("; "));
    }

    return handler(parsed.data, request as CallableRequest<TInput>);
  };

  return options ? onCall(options, callableHandler) : onCall(callableHandler);
}
