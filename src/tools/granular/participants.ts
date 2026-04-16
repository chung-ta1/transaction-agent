import { z } from "zod";
import { defineTool, ok, type ToolResult } from "../Tool.js";
import {
  addParticipantRequestSchema,
  agentParticipantInfoSchema,
  buyerSellerSchema,
  envSchema,
  ownerAgentInfoSchema,
} from "../../types/schemas.js";
import { fromError } from "./init.js";

export const updateBuyerSeller = defineTool({
  name: "update_buyer_seller",
  description:
    "Set buyer(s) and seller(s) on the draft. Sellers list must not be empty. Each person needs company OR (first + last).",
  input: z.object({
    env: envSchema,
    builderId: z.string(),
    buyerSeller: buyerSellerSchema,
  }),
  async handler({ env, builderId, buyerSeller }, { arrakis }): Promise<ToolResult<unknown>> {
    try {
      return ok(await arrakis.updateBuyerAndSellerInfo(env, builderId, buyerSeller));
    } catch (err) {
      return fromError(err);
    }
  },
});

export const setOwnerAgentInfo = defineTool({
  name: "set_owner_agent_info",
  description:
    "For single-rep deals: set the owner agent (agentId + role) + officeId + optional team/lead-source. Address must be set before calling. officeId becomes mandatory at submit.",
  input: z.object({
    env: envSchema,
    builderId: z.string(),
    ownerInfo: ownerAgentInfoSchema,
  }),
  async handler({ env, builderId, ownerInfo }, { arrakis }): Promise<ToolResult<unknown>> {
    try {
      return ok(await arrakis.updateOwnerAgentInfo(env, builderId, ownerInfo));
    } catch (err) {
      return fromError(err);
    }
  },
});

export const addCoAgent = defineTool({
  name: "add_co_agent",
  description:
    "Add one co-agent on the owner's side. For DUAL rep, call twice per agent (once with BUYERS_AGENT, once with SELLERS_AGENT).",
  input: z.object({
    env: envSchema,
    builderId: z.string(),
    agent: agentParticipantInfoSchema,
  }),
  async handler({ env, builderId, agent }, { arrakis }): Promise<ToolResult<unknown>> {
    try {
      return ok(await arrakis.addCoAgent(env, builderId, agent));
    } catch (err) {
      return fromError(err);
    }
  },
});

export const addOtherSideAgent = defineTool({
  name: "add_other_side_agent",
  description:
    "Single-rep, other side represented: add the OTHER_AGENT participant (brokerage name, first/last, email, phone, address, EIN for US, optional W9 file). Skip if the other side is unrepresented.",
  input: z.object({
    env: envSchema,
    builderId: z.string(),
    participant: addParticipantRequestSchema.extend({
      role: z.literal("OTHER_AGENT").default("OTHER_AGENT"),
    }),
  }),
  async handler({ env, builderId, participant }, { arrakis }): Promise<ToolResult<unknown>> {
    try {
      return ok(await arrakis.addOtherParticipant(env, builderId, participant));
    } catch (err) {
      return fromError(err);
    }
  },
});

export const addTransactionCoordinator = defineTool({
  name: "add_transaction_coordinator",
  description: "Attach a Transaction Coordinator (by yentaId) to the draft. Optional, zero or more.",
  input: z.object({
    env: envSchema,
    builderId: z.string(),
    yentaId: z.string().uuid(),
  }),
  async handler({ env, builderId, yentaId }, { arrakis }): Promise<ToolResult<unknown>> {
    try {
      return ok(await arrakis.addTransactionCoordinator(env, builderId, yentaId));
    } catch (err) {
      return fromError(err);
    }
  },
});
