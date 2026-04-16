import { z } from "zod";
import { defineTool, ok, type ToolResult } from "../Tool.js";
import {
  addParticipantRequestSchema,
  commissionPayerInfoSchema,
  commissionSplitSchema,
  envSchema,
} from "../../types/schemas.js";
import { fromError } from "./init.js";

export const setOpcity = defineTool({
  name: "set_opcity",
  description:
    "Turn the realtor.com (opcity) flag on or off. MUST be called (even with opcity=false) before set_commission_splits — arrakis uses this call to finalize participants.",
  input: z.object({
    env: envSchema,
    builderId: z.string(),
    opcity: z.boolean().default(false),
  }),
  async handler({ env, builderId, opcity }, { arrakis }): Promise<ToolResult<unknown>> {
    try {
      return ok(await arrakis.setOpcity(env, builderId, opcity));
    } catch (err) {
      return fromError(err);
    }
  },
});

export const setCommissionSplits = defineTool({
  name: "set_commission_splits",
  description:
    "Write commission splits. Percentages are of the post-referral pool (gross − amount commissions − referral). Single-rep: agent percents sum with (100-sum) split equally among undefined agents. Dual-rep: per-side validation; ≥1 agent must have commission on both sides.",
  input: z.object({
    env: envSchema,
    builderId: z.string(),
    splits: z.array(commissionSplitSchema).min(1),
  }),
  async handler({ env, builderId, splits }, { arrakis }): Promise<ToolResult<unknown>> {
    try {
      return ok(await arrakis.updateCommissionSplits(env, builderId, splits));
    } catch (err) {
      return fromError(err);
    }
  },
});

export const addCommissionPayerParticipant = defineTool({
  name: "add_commission_payer_participant",
  description:
    "Create the participant who will pay commission. US sale → role=TITLE. Canada sale → create both BUYERS_LAWYER + SELLERS_LAWYER (call twice). Lease → LANDLORD/TENANT/MANAGEMENT_COMPANY. After creation, call set_commission_payer with the participant id arrakis returns.",
  input: z.object({
    env: envSchema,
    builderId: z.string(),
    participant: addParticipantRequestSchema,
  }),
  async handler({ env, builderId, participant }, { arrakis }): Promise<ToolResult<unknown>> {
    try {
      return ok(await arrakis.addOtherParticipant(env, builderId, participant));
    } catch (err) {
      return fromError(err);
    }
  },
});

export const setCommissionPayer = defineTool({
  name: "set_commission_payer",
  description:
    "Point the draft at the commission-payer participant created by add_commission_payer_participant. Takes participantId + role.",
  input: z.object({
    env: envSchema,
    builderId: z.string(),
    payer: commissionPayerInfoSchema,
  }),
  async handler({ env, builderId, payer }, { arrakis }): Promise<ToolResult<unknown>> {
    try {
      return ok(await arrakis.setCommissionPayer(env, builderId, payer));
    } catch (err) {
      return fromError(err);
    }
  },
});
