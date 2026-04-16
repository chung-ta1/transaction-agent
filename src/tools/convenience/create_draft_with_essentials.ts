import { z } from "zod";
import { defineTool, ok, type ToolResult } from "../Tool.js";
import {
  agentParticipantInfoSchema,
  buyerSellerSchema,
  envSchema,
  locationInfoSchema,
  priceAndDatesSchema,
} from "../../types/schemas.js";
import { fromError } from "../granular/init.js";

/**
 * Stand up the draft skeleton in one tool call: empty builder → owner →
 * location → price-dates → buyer/seller → (single-rep) owner-info.
 * The agent prefers this to the six granular calls for the happy path.
 */
export const createDraftWithEssentials = defineTool({
  name: "create_draft_with_essentials",
  description:
    "Happy-path: create the draft, set owner/location/price/dates/buyers/sellers, and (for single-rep) attach the owner agent in one call. Returns builderId. Prefer this over the 6 individual calls when all essentials are known up front.",
  input: z.object({
    env: envSchema,
    transactionOwnerId: z.string().uuid(),
    location: locationInfoSchema,
    priceAndDates: priceAndDatesSchema,
    buyerSeller: buyerSellerSchema,
    ownerAgent: agentParticipantInfoSchema.optional(),
    officeId: z.string().uuid().optional(),
    teamId: z.string().uuid().optional(),
  }),
  async handler(args, { arrakis }): Promise<ToolResult<{ builderId: string }>> {
    const {
      env,
      transactionOwnerId,
      location,
      priceAndDates,
      buyerSeller,
      ownerAgent,
      officeId,
      teamId,
    } = args;
    try {
      const builderId = await arrakis.initializeDraft(env, "TRANSACTION");
      await arrakis.setTransactionOwner(env, builderId, transactionOwnerId);
      await arrakis.updateLocationInfo(env, builderId, location);
      await arrakis.updatePriceAndDateInfo(env, builderId, priceAndDates);
      await arrakis.updateBuyerAndSellerInfo(env, builderId, buyerSeller);

      const isDual = priceAndDates.representationType === "DUAL";
      if (!isDual && ownerAgent) {
        await arrakis.updateOwnerAgentInfo(env, builderId, {
          ownerAgent,
          ...(officeId ? { officeId } : {}),
          ...(teamId ? { teamId } : {}),
        });
      }
      return ok({ builderId });
    } catch (err) {
      return fromError(err);
    }
  },
});
