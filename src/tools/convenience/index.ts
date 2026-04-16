import type { Tool } from "../Tool.js";
import { createDraftWithEssentials } from "./create_draft_with_essentials.js";
import { finalizeDraft } from "./finalize_draft.js";
import { addReferral } from "./add_referral.js";
import { addPartnerAgent } from "./add_partner_agent.js";
import { computeCommissionSplitsTool } from "./compute_commission_splits.js";

export const convenienceTools: Tool[] = [
  createDraftWithEssentials,
  addPartnerAgent,
  addReferral,
  computeCommissionSplitsTool,
  finalizeDraft,
];
