import { z } from "zod";
import { defineTool, fail, ok, type ToolResult } from "../Tool.js";
import {
  computeCommissionSplits,
  CommissionMathError,
  dollarsToCents,
  type ComputeSplitsResult,
} from "../../math/commissionSplits.js";
import { moneyValueSchema } from "../../types/schemas.js";

/**
 * Pure arithmetic — no network, no env. Integer-cents math with hard invariants.
 * The agent is required by the runbook to call this BEFORE `set_commission_splits`
 * so the numbers hitting arrakis are deterministic rather than LLM-computed.
 */
export const computeCommissionSplitsTool = defineTool({
  name: "compute_commission_splits",
  description:
    "Compute commission splits with integer-cents precision. Takes the gross commission plus a list of agent ratios (e.g. 60/40) and an optional referral percent; returns the arrakis-ready splits (percent + dollar per participant), the reconciled totals, and whether renormalization was needed. Call this BEFORE set_commission_splits — the math is deterministic here, not LLM-computed.",
  input: z.object({
    gross: moneyValueSchema,
    agents: z
      .array(
        z.object({
          key: z
            .string()
            .min(1)
            .describe("Stable identifier, typically the participantId from the builder."),
          displayName: z.string().optional(),
          rawRatio: z
            .number()
            .positive()
            .describe(
              "The raw ratio the user typed. For 'me 60 / Tamir 40' pass 60 and 40.",
            ),
        }),
      )
      .min(1),
    referral: z
      .object({
        key: z.string().min(1),
        displayName: z.string().optional(),
        rawPercent: z
          .number()
          .min(0)
          .max(99.99)
          .describe("Referral's percent of gross (off the top). 0 ≤ x < 100."),
      })
      .optional(),
  }),
  async handler(args): Promise<ToolResult<ComputeSplitsResult>> {
    try {
      const grossCents = dollarsToCents(args.gross.amount);
      const result = computeCommissionSplits({
        grossCents,
        currency: args.gross.currency,
        agents: args.agents,
        referral: args.referral,
      });
      return ok(result);
    } catch (err) {
      if (err instanceof CommissionMathError) {
        return fail(err.message, { code: "COMMISSION_MATH_ERROR" });
      }
      if (err instanceof Error) return fail(err.message);
      return fail(String(err));
    }
  },
});
