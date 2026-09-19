import {
  onCall,
  type CallableOptions,
  type CallableRequest
} from "firebase-functions/v2/https";
import type { UserRole } from "@refinery/types";
import { z } from "zod";
import { invalidArgument } from "./errors.js";

export type OperationAuthContext = {
  uid: string;
  siteId: string;
  roles: UserRole[];
};

export type ExecutableCallable<TInput, TOutput> = {
  execute(data: unknown, auth: OperationAuthContext): Promise<TOutput>;
};

export function validatedCall<TInput, TOutput>(
  schema: z.ZodType<TInput>,
  handler: (data: TInput, request: CallableRequest<TInput>) => Promise<TOutput>,
  options?: CallableOptions
) {
  const parseInput = (data: unknown): TInput => {
    const parsed = schema.safeParse(data);

    if (!parsed.success) {
      invalidArgument(parsed.error.issues.map((issue) => issue.message).join("; "));
    }

    return parsed.data;
  };

  const callableHandler = async (request: CallableRequest<TInput>) => {
    return handler(parseInput(request.data), request as CallableRequest<TInput>);
  };

  const callable = options ? onCall(options, callableHandler) : onCall(callableHandler);
  const execute = async (data: unknown, auth: OperationAuthContext): Promise<TOutput> => {
    const input = parseInput(data);
    const request = {
      data: input,
      auth: {
        uid: auth.uid,
        token: {
          siteId: auth.siteId,
          roles: auth.roles
        }
      }
    } as unknown as CallableRequest<TInput>;

    return handler(input, request);
  };

  return Object.assign(callable, { execute });
}
