import { z } from "zod";
import { defineTool, fail, ok, type ToolResult } from "../Tool.js";
import { envSchema } from "../../types/schemas.js";
import { ApiError } from "../../services/BaseApi.js";

export const initializeDraft = defineTool({
  name: "initialize_draft",
  description:
    "Create an empty arrakis TransactionBuilder (draft). Returns the builderId to pass to every subsequent call.",
  input: z.object({
    env: envSchema,
    type: z.enum(["TRANSACTION", "LISTING"]).default("TRANSACTION"),
  }),
  async handler({ env, type }, { arrakis }): Promise<ToolResult<{ builderId: string }>> {
    try {
      const builderId = await arrakis.initializeDraft(env, type);
      return ok({ builderId });
    } catch (err) {
      return fromError(err);
    }
  },
});

export const setTransactionOwner = defineTool({
  name: "set_transaction_owner",
  description:
    "Set the primary agent (transactionOwnerId = yentaId) on the draft. Usually this is the authenticated user.",
  input: z.object({
    env: envSchema,
    builderId: z.string(),
    transactionOwnerId: z.string().uuid(),
  }),
  async handler({ env, builderId, transactionOwnerId }, { arrakis }): Promise<ToolResult<unknown>> {
    try {
      const data = await arrakis.setTransactionOwner(env, builderId, transactionOwnerId);
      return ok(data);
    } catch (err) {
      return fromError(err);
    }
  },
});

export function fromError(err: unknown): ToolResult<never> {
  if (err instanceof ApiError) {
    return fail(err.message, { status: err.status, body: err.body });
  }
  if (err instanceof Error) {
    return fail(err.message);
  }
  return fail(String(err));
}
