import { z } from "zod";
import { defineTool, ok, type ToolResult } from "../Tool.js";
import {
  addParticipantRequestSchema,
  commissionPayerInfoSchema,
  envSchema,
} from "../../types/schemas.js";
import { buildDraftUrl } from "../../config.js";
import { fromError } from "../granular/init.js";

/**
 * Runs the mandatory "no-op" plumbing arrakis needs before a builder is
 * submittable:
 *   - set opcity(false)                       (finalizes participants)
 *   - personal-deal-info {false, true}        (both NotNull)
 *   - additional-fees-info {false, []}
 *   - add commission-payer participant
 *   - set commission-payer
 *   - title-info {useRealTitle: false}
 *   - (Georgia only) fmls-info
 * Caller passes the payer participant payload and an optional FMLS flag.
 */
export const finalizeDraft = defineTool({
  name: "finalize_draft",
  description:
    "Run the required end-of-flow calls in one shot: opcity(false), personal-deal, additional-fees(empty), create commission-payer participant, set commission-payer, title-info(useRealTitle:false), and (Georgia) fmls. Returns the bolt draftUrl.",
  input: z.object({
    env: envSchema,
    builderId: z.string(),
    commissionPayerParticipant: addParticipantRequestSchema,
    commissionPayer: commissionPayerInfoSchema.pick({ role: true, participantId: true }).partial({ role: true }),
    fmls: z.object({ propertyListedOnFmls: z.boolean() }).optional(),
  }),
  async handler(args, { arrakis }): Promise<ToolResult<{ draftUrl: string }>> {
    const { env, builderId, commissionPayerParticipant, commissionPayer, fmls } = args;
    try {
      await arrakis.setOpcity(env, builderId, false);
      await arrakis.updatePersonalDealInfo(env, builderId, {
        personalDeal: false,
        representedByAgent: true,
      });
      await arrakis.updateAdditionalFees(env, builderId, {
        hasAdditionalFees: false,
        additionalFeesParticipantInfos: [],
      });

      // If participantId is already known (e.g. existing participant), skip creating a new one.
      let payerId = commissionPayer.participantId;
      if (!payerId || payerId === "") {
        const created = (await arrakis.addOtherParticipant(
          env,
          builderId,
          commissionPayerParticipant,
        )) as { id?: string } | undefined;
        payerId = created?.id ?? "";
      }

      await arrakis.setCommissionPayer(env, builderId, {
        participantId: payerId,
        role: commissionPayer.role ?? commissionPayerParticipant.role,
      });

      await arrakis.updateTitleInfo(env, builderId, { useRealTitle: false });

      if (fmls) {
        await arrakis.updateFmlsInfo(env, builderId, fmls);
      }

      return ok({ draftUrl: buildDraftUrl(env, builderId) });
    } catch (err) {
      return fromError(err);
    }
  },
});
