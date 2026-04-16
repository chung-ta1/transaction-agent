import { z } from "zod";
import { defineTool, ok, type ToolResult } from "../Tool.js";
import { addParticipantRequestSchema, envSchema } from "../../types/schemas.js";
import { fromError } from "../granular/init.js";

/**
 * One tool for "add a partner who works this deal with me":
 *   - Real agent (internal) + single-rep → one addCoAgent
 *   - Real agent (internal) + DUAL rep   → two addCoAgent (BUYERS_AGENT + SELLERS_AGENT)
 *   - Outside agent                      → addOtherParticipant (OTHER_AGENT)
 * Avoids the agent runbook having to remember the dual-twice rule.
 */
export const addPartnerAgent = defineTool({
  name: "add_partner_agent",
  description:
    "Add a partner agent to the draft. For Real agents pass {kind: \"internal\", agentId, side}. For outside agents pass {kind: \"external\", …brokerage fields…}. Side=DUAL automatically registers the agent on both BUYERS_AGENT and SELLERS_AGENT roles.",
  input: z.union([
    z.object({
      env: envSchema,
      builderId: z.string(),
      kind: z.literal("internal"),
      agentId: z.string().uuid(),
      side: z.enum(["BUYERS_AGENT", "SELLERS_AGENT", "TENANT_AGENT", "DUAL"]),
      receivesInvoice: z.boolean().default(false),
    }),
    z.object({
      env: envSchema,
      builderId: z.string(),
      kind: z.literal("external"),
      participant: addParticipantRequestSchema.extend({
        role: z.literal("OTHER_AGENT").default("OTHER_AGENT"),
      }),
    }),
  ]),
  async handler(args, { arrakis }): Promise<ToolResult<unknown>> {
    try {
      if (args.kind === "internal") {
        const { env, builderId, agentId, side, receivesInvoice } = args;
        if (side === "DUAL") {
          await arrakis.addCoAgent(env, builderId, {
            agentId,
            role: "BUYERS_AGENT",
            receivesInvoice,
          });
          await arrakis.addCoAgent(env, builderId, {
            agentId,
            role: "SELLERS_AGENT",
            receivesInvoice,
          });
          return ok({ registered: ["BUYERS_AGENT", "SELLERS_AGENT"] });
        }
        return ok(
          await arrakis.addCoAgent(env, builderId, {
            agentId,
            role: side,
            receivesInvoice,
          }),
        );
      }
      return ok(await arrakis.addOtherParticipant(args.env, args.builderId, args.participant));
    } catch (err) {
      return fromError(err);
    }
  },
});
