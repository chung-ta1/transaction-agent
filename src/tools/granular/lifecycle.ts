import { z } from "zod";
import { defineTool, ok, type ToolResult } from "../Tool.js";
import { envSchema } from "../../types/schemas.js";
import { fromError } from "./init.js";

/**
 * Lifecycle tools — submit a draft, transition an active listing, or build
 * a transaction builder from a listing. Together these enable the end-to-end
 * seller-side flow entirely through the MCP:
 *
 *   create_draft_with_essentials(type=LISTING) → (fill fields)
 *     → submit_draft (listing goes LISTING_ACTIVE; capture result.id)
 *     → build_transaction_from_listing(result.id) (arrakis allows this on ACTIVE,
 *                                                   despite the "in-contract"
 *                                                   naming — contrary to older
 *                                                   docs)
 *     → (fill buyer + remaining tx fields)
 *     → finalize_draft + submit_draft (transaction → NEW)
 *     → transition_listing(result.id, LISTING_IN_CONTRACT)
 *        (only works AFTER the linked transaction is submitted; arrakis's
 *         ListingInContractEvent requires an "open transaction" to fire)
 *
 * Id rule: `submit_draft` returns a separate post-submit `result.id` that
 * identifies the Listing/Transaction row. Use THAT id (not the original
 * builderId) for `transition_listing` and `build_transaction_from_listing`.
 */

export const submitDraft = defineTool({
  name: "submit_draft",
  description:
    "Submit the builder to arrakis (POST /transaction-builder/{id}/submit) — turns a draft into a real Transaction (or active Listing if type=LISTING was used at creation). Runs the full server-side `validate()` chain. On failure, arrakis returns the specific rule violation; map via memory/error-messages.md.",
  input: z.object({
    env: envSchema,
    builderId: z.string(),
  }),
  async handler({ env, builderId }, { arrakis }): Promise<ToolResult<unknown>> {
    try {
      const result = await arrakis.submitDraft(env, builderId);
      return ok({ submitted: true, builderId, result });
    } catch (err) {
      return fromError(err);
    }
  },
});

export const transitionListing = defineTool({
  name: "transition_listing",
  description:
    "Transition a submitted Listing to a new lifecycle state (PUT /listings/{id}/transition/{state}). States: `LISTING_ACTIVE` (auto after submit), `LISTING_IN_CONTRACT`, `LISTING_CLOSED`, plus termination states. Two caller gotchas: (1) `listingId` must be the post-submit `result.id` returned by `submit_draft`, NOT the original builderId — passing the builder id 404s. (2) Transitioning to `LISTING_IN_CONTRACT` raises a ListingInContractEvent that requires an 'open Transaction' (submitted, not a builder) already linked to the listing. So the working order is: submit listing → build_transaction_from_listing → fill + finalize + submit the transaction → THEN transition to IN_CONTRACT.",
  input: z.object({
    env: envSchema,
    listingId: z.string().describe("Post-submit Listing id from submit_draft's result.id. Not the pre-submit builderId."),
    lifecycleState: z.enum([
      "LISTING_ACTIVE",
      "LISTING_IN_CONTRACT",
      "LISTING_CLOSED",
      "TERMINATION_REQUESTED",
      "TERMINATED",
    ]),
  }),
  async handler({ env, listingId, lifecycleState }, { arrakis }): Promise<ToolResult<unknown>> {
    try {
      const result = await arrakis.transitionListing(env, listingId, lifecycleState);
      return ok({ transitioned: true, listingId, lifecycleState, result });
    } catch (err) {
      return fromError(err);
    }
  },
});

export const buildTransactionFromListing = defineTool({
  name: "build_transaction_from_listing",
  description:
    "Given a submitted Listing, create a new TransactionBuilder that inherits the listing's property/price/seller/commission data. Use when the seller-side agent wants to create the transaction that pairs with an active listing. Works on listings in `LISTING_ACTIVE` state — arrakis does NOT require LISTING_IN_CONTRACT here (the name is misleading; the in-contract transition happens AFTER this transaction is submitted). Returns the new transaction builderId — caller populates buyer info, finalizes, and submits.",
  input: z.object({
    env: envSchema,
    listingId: z.string().describe("Post-submit Listing id from submit_draft's result.id. Not the pre-submit builderId."),
  }),
  async handler({ env, listingId }, { arrakis }): Promise<ToolResult<{ builderId: string }>> {
    try {
      const builderId = await arrakis.buildTransactionFromListing(env, listingId);
      return ok({ builderId });
    } catch (err) {
      return fromError(err);
    }
  },
});
