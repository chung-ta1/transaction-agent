import { z } from "zod";
import { defineTool, fail, ok, type ToolResult } from "../Tool.js";
import {
  buyerSellerSchema,
  envSchema,
  fmlsInfoSchema,
  locationInfoSchema,
  moneyValueSchema,
  priceAndDatesSchema,
} from "../../types/schemas.js";
import {
  computeCommissionSplits,
  dollarsToCents,
  CommissionMathError,
} from "../../math/commissionSplits.js";
import {
  diffSplits,
  extractCommittedSplits,
} from "../../math/verifySplits.js";
import { buildDraftUrl } from "../../config.js";
import { ApiError } from "../../services/BaseApi.js";

/**
 * Consolidated happy-path: arrakis's full transaction/listing create sequence
 * in a single MCP call. Replaces the 7-step Claude orchestration of
 * create_draft_with_essentials → add_partner_agent × N → add_referral →
 * compute_commission_splits → set_commission_splits → verify_draft_splits →
 * finalize_draft with one server-side sequence.
 *
 * Claude still owns policy (parsing, gap analysis, G2 interpretation gate,
 * type-to-confirm, preview, audit log). Workflow (writes, participant-id
 * plumbing, post-write verification) lives here in code.
 *
 * Failure model: returns {ok:false, error:{code, body:{builderId, completedSteps,
 * nextStage}}}. When builderId is present the caller can offer /resume-draft or
 * /delete-draft. No auto-retry — the caller decides.
 *
 * Scope: single-rep (BUYER, SELLER, TENANT, LANDLORD) transactions and
 * listings. DUAL representation falls back to the granular chain.
 */

const STAGES = [
  "validate_agents",
  "initialize",
  "location",
  "price_dates",
  "buyer_seller",
  "owner",
  "partners",
  "referral",
  "resolve_participants",
  "compute_splits",
  "set_splits",
  "verify_splits",
  "finalize",
] as const;

type Stage = typeof STAGES[number];

const partnerSchema = z.object({
  kind: z.literal("internal"),
  agentId: z.string().uuid(),
  ratio: z
    .number()
    .positive()
    .describe("Partner's raw ratio in the agent split (e.g. 40 for 'me 60 / partner 40')."),
  side: z
    .enum(["BUYERS_AGENT", "SELLERS_AGENT", "TENANT_AGENT"])
    .optional()
    .describe("Override the inferred side. Default matches the owner's side."),
  receivesInvoice: z.boolean().default(false),
});

const referralSchema = z
  .object({
    kind: z.enum(["internal", "external"]),
    percent: z
      .number()
      .min(0)
      .max(99.99)
      .describe("Referral's off-the-top percent of gross (0 ≤ x < 100)."),
    agentId: z.string().uuid().optional(),
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    companyName: z.string().min(1).optional(),
    address: z.string().min(1).optional(),
    ein: z.string().min(1).optional(),
    email: z.string().email().optional(),
    phoneNumber: z.string().optional(),
    vendorDirectoryId: z.string().uuid().optional(),
    w9FilePath: z.string().optional(),
    receivesInvoice: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "internal" && !v.agentId) {
      ctx.addIssue({
        code: "custom",
        path: ["agentId"],
        message: "agentId required for internal referral",
      });
    }
    if (v.kind === "external") {
      for (const f of ["firstName", "lastName", "companyName", "address"] as const) {
        if (!v[f])
          ctx.addIssue({
            code: "custom",
            path: [f],
            message: `${f} required for external referral`,
          });
      }
    }
  });

const commissionPayerShape = z.object({
  role: z.enum([
    "TITLE",
    "SELLERS_LAWYER",
    "BUYERS_LAWYER",
    "OTHER_AGENT",
    "LANDLORD",
    "TENANT",
    "MANAGEMENT_COMPANY",
  ]),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  companyName: z.string().min(1),
  email: z.string().email(),
  phoneNumber: z.string().min(1),
});

export const createFullDraft = defineTool({
  name: "create_full_draft",
  description:
    "End-to-end draft creation in ONE MCP round-trip. Sequences arrakis writes server-side (create → location → price/dates → buyer+seller → owner → partners → referral → compute splits → set splits → verify → finalize) and returns { builderId, draftUrl, splits, participants, renormalized }. On mid-chain failure, returns { ok:false, error:{ stage, builderId, completedSteps } } so the caller can offer /resume-draft or /delete-draft. Covers single-rep transactions (BUYER, SELLER, TENANT, LANDLORD) and listings. DUAL rep falls back to the granular tool chain.",
  input: z.object({
    env: envSchema,
    type: z.enum(["TRANSACTION", "LISTING"]).default("TRANSACTION"),
    owner: z.object({
      yentaId: z.string().uuid(),
      officeId: z.string().uuid(),
      teamId: z.string().uuid().optional(),
      ratio: z
        .number()
        .positive()
        .describe("Owner's raw ratio in the agent split (e.g. 60 for 'me 60 / partner 40')."),
    }),
    location: locationInfoSchema,
    priceAndDates: priceAndDatesSchema,
    buyerSeller: buyerSellerSchema,
    partners: z.array(partnerSchema).default([]),
    referral: referralSchema.optional(),
    commission: z
      .object({ gross: moneyValueSchema })
      .describe(
        "Gross commission on which to compute splits. Caller resolves this from saleCommission (+ listingCommission for DUAL) BEFORE calling this tool.",
      ),
    commissionPayer: commissionPayerShape
      .optional()
      .describe(
        "All 6 fields or OMIT entirely. Partial payloads fail CommissionPayerInfoRequestValidator; arrakis tolerates a null payer at submit.",
      ),
    fmls: fmlsInfoSchema.optional().describe("Georgia only."),
  }),
  async handler(args, { arrakis, yenta }): Promise<ToolResult<unknown>> {
    const completed: Stage[] = [];
    let builderId: string | undefined;
    const rep = args.priceAndDates.representationType;

    try {
      // ---- 0. validate_agents ----
      // Lint every partner + referral yentaId for ACTIVE status BEFORE any
      // arrakis write. Catches CANDIDATE / INACTIVE / REJECTED at turn zero
      // instead of stage 6 of 12 (see c99ce417 2026-04-20).
      const agentIdsToCheck: string[] = [];
      for (const p of args.partners) {
        if (p.kind === "internal" && p.agentId) agentIdsToCheck.push(p.agentId);
      }
      if (args.referral?.kind === "internal" && args.referral.agentId) {
        agentIdsToCheck.push(args.referral.agentId);
      }
      if (agentIdsToCheck.length > 0) {
        const issues: Array<{ yentaId: string; status?: string; reason: string }> = [];
        await Promise.all(
          agentIdsToCheck.map(async (id) => {
            try {
              const agent = await yenta.getAgent(args.env, id);
              if (!agent) {
                issues.push({ yentaId: id, reason: `yentaId ${id} not found (404)` });
                return;
              }
              const status = agent.agentStatus;
              if (status && status !== "ACTIVE") {
                const name = `${agent.firstName ?? ""} ${agent.lastName ?? ""}`.trim() || id;
                issues.push({
                  yentaId: id,
                  status,
                  reason: `${name} is ${status} in yenta — arrakis blocks non-ACTIVE agents from being added to a transaction`,
                });
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              issues.push({ yentaId: id, reason: `yenta lookup failed: ${message}` });
            }
          }),
        );
        if (issues.length > 0) {
          return fail(
            `One or more agents can't be added to the draft: ${issues.map((i) => i.reason).join("; ")}`,
            {
              code: "AGENT_STATUS_INVALID",
              body: { builderId: undefined, completedSteps: completed, nextStage: "validate_agents", issues },
            },
          );
        }
      }
      completed.push("validate_agents");

      // ---- 1. initialize ----
      builderId = await arrakis.initializeDraft(args.env, args.type);
      completed.push("initialize");

      await arrakis.updateLocationInfo(args.env, builderId, args.location);
      completed.push("location");

      await arrakis.updatePriceAndDateInfo(args.env, builderId, args.priceAndDates);
      completed.push("price_dates");

      const bs =
        args.type === "LISTING" ? { ...args.buyerSeller, buyers: [] } : args.buyerSeller;
      await arrakis.updateBuyerAndSellerInfo(args.env, builderId, bs);
      completed.push("buyer_seller");

      const ownerRole = inferOwnerRole(rep);
      await arrakis.updateOwnerAgentInfo(args.env, builderId, {
        ownerAgent: { agentId: args.owner.yentaId, role: ownerRole },
        officeId: args.owner.officeId,
        ...(args.owner.teamId ? { teamId: args.owner.teamId } : {}),
      });

      // For DUAL: register the owner a second time as BUYERS_AGENT so they
      // satisfy arrakis's "≥1 agent with positive commission on both sides"
      // rule. Sequential — never fire this in parallel with price/dates or
      // buyer/seller updates (the c48855ad race on 2026-04-20 produced 4
      // duplicate owner participants because arrakis auto-created a slot
      // during the rep flip while we were also addCoAgent-ing).
      if (rep === "DUAL") {
        await arrakis.addCoAgent(args.env, builderId, {
          agentId: args.owner.yentaId,
          role: "BUYERS_AGENT",
          receivesInvoice: false,
        });
      }
      completed.push("owner");

      // For DUAL-with-partners, splits get ambiguous (which side does the
      // partner belong on, and how do they share across two roles?). Punt
      // cleanly to the granular chain rather than guess.
      if (rep === "DUAL" && args.partners.length > 0) {
        return fail(
          "DUAL representation with partners isn't yet handled by create_full_draft — splits are ambiguous (which side does each partner work, and how does their ratio apply across both roles?). Use the granular chain: add each partner via add_partner_agent with side=DUAL (registers twice) or explicit side, then set_commission_splits per participantId.",
          {
            code: "NOT_IMPLEMENTED_DUAL_WITH_PARTNERS",
            body: { builderId, completedSteps: completed, nextStage: "partners" },
          },
        );
      }

      const defaultPartnerSide = inferOwnerRole(rep);
      for (const p of args.partners) {
        await arrakis.addCoAgent(args.env, builderId, {
          agentId: p.agentId,
          role: p.side ?? defaultPartnerSide,
          receivesInvoice: p.receivesInvoice,
        });
      }
      completed.push("partners");

      let referralParticipantId: string | undefined;
      if (args.referral) {
        if (args.referral.kind === "internal") {
          const r = (await arrakis.addReferralInfo(args.env, builderId, {
            role: "REFERRING_AGENT",
            type: "AGENT",
            agentId: args.referral.agentId!,
            receivesInvoice: args.referral.receivesInvoice ?? false,
          })) as { id?: string } | undefined;
          referralParticipantId = r?.id;
        } else {
          const r = (await arrakis.addReferralInfo(args.env, builderId, {
            role: "REFERRING_AGENT",
            type: "EXTERNAL_ENTITY",
            firstName: args.referral.firstName!,
            lastName: args.referral.lastName!,
            companyName: args.referral.companyName!,
            address: args.referral.address!,
            ein: args.referral.ein,
            email: args.referral.email,
            phoneNumber: args.referral.phoneNumber,
            vendorDirectoryId: args.referral.vendorDirectoryId,
            receivesInvoice: args.referral.receivesInvoice ?? true,
          })) as { id?: string } | undefined;
          referralParticipantId = r?.id;
          if (args.referral.w9FilePath && referralParticipantId) {
            await arrakis.uploadReferralW9(
              args.env,
              builderId,
              referralParticipantId,
              args.referral.w9FilePath,
            );
          }
        }
      }
      completed.push("referral");

      const draft = (await arrakis.getDraft(args.env, builderId)) as Record<string, unknown>;
      const agentsInfo = draft?.agentsInfo as Record<string, unknown> | undefined;
      const ownerArray = agentsInfo?.ownerAgent as Array<{ id?: string }> | undefined;
      const ownerParticipantId = ownerArray?.[0]?.id;
      const coAgentsRaw =
        (agentsInfo?.coAgents as Array<{ id?: string; agentId?: string; yentaId?: string; role?: string }>) ??
        [];
      const coAgentParticipants = coAgentsRaw
        .map((c) => ({
          id: c.id ?? "",
          agentId: c.agentId ?? c.yentaId ?? "",
          role: c.role ?? "",
        }))
        .filter((c) => c.id);
      if (!referralParticipantId) {
        const referralInfo = draft?.referralInfo as Record<string, unknown> | undefined;
        const all = referralInfo?.allReferralParticipantInfo as Array<{ id?: string }> | undefined;
        referralParticipantId = all?.[0]?.id;
      }
      if (!ownerParticipantId) {
        return fail("Couldn't resolve owner participantId from draft after owner update.", {
          code: "RESOLVE_FAILED",
          body: { builderId, completedSteps: completed, nextStage: "resolve_participants" },
        });
      }
      completed.push("resolve_participants");

      const agentInputs: Array<{ key: string; displayName: string; rawRatio: number }> = [];
      if (rep === "DUAL") {
        // Solo DUAL: owner has two participantIds — SELLERS_AGENT (from
        // ownerAgent slot) and BUYERS_AGENT (from the co-agent we added
        // above). Split owner's ratio 50/50 across both so that per-side
        // commission amounts match listingCommission + saleCommission.
        const ownerBuyerSide = coAgentParticipants.find(
          (c) => c.agentId === args.owner.yentaId && c.role === "BUYERS_AGENT",
        );
        if (!ownerBuyerSide) {
          return fail(
            "DUAL draft: couldn't locate the owner's BUYERS_AGENT participant record after adding it — arrakis may not have persisted the co-agent write.",
            {
              code: "DUAL_OWNER_BUYER_PARTICIPANT_MISSING",
              body: { builderId, completedSteps: completed, nextStage: "compute_splits" },
            },
          );
        }
        const halfRatio = args.owner.ratio / 2;
        agentInputs.push({
          key: ownerParticipantId,
          displayName: "owner (seller-side)",
          rawRatio: halfRatio,
        });
        agentInputs.push({
          key: ownerBuyerSide.id,
          displayName: "owner (buyer-side)",
          rawRatio: halfRatio,
        });
      } else {
        agentInputs.push({
          key: ownerParticipantId,
          displayName: "owner",
          rawRatio: args.owner.ratio,
        });
        for (let i = 0; i < args.partners.length; i++) {
          const p = args.partners[i];
          const match = coAgentParticipants.find((c) => c.agentId === p.agentId);
          if (!match) {
            return fail(
              `Couldn't match partner agent ${p.agentId} to a co-agent participant in the draft.`,
              { code: "PARTNER_MATCH_FAILED", body: { builderId, completedSteps: completed } },
            );
          }
          agentInputs.push({ key: match.id, displayName: `partner-${i}`, rawRatio: p.ratio });
        }
      }
      const computed = computeCommissionSplits({
        grossCents: dollarsToCents(args.commission.gross.amount),
        currency: args.commission.gross.currency,
        agents: agentInputs,
        referral:
          args.referral && referralParticipantId
            ? {
                key: referralParticipantId,
                displayName: "referral",
                rawPercent: args.referral.percent,
              }
            : undefined,
      });
      completed.push("compute_splits");

      const splitsPayload = computed.splits.map((s) => ({
        participantId: s.key,
        commission: { percentEnabled: true, commissionPercent: s.percent },
      }));
      await arrakis.updateCommissionSplits(args.env, builderId, splitsPayload);
      completed.push("set_splits");

      const postWriteDraft = await arrakis.getDraft(args.env, builderId);
      const committed = extractCommittedSplits(postWriteDraft);
      const sent = computed.splits.map((s) => ({ participantId: s.key, percent: s.percent }));
      const diff = diffSplits(sent, committed);
      if (!diff.ok) {
        return fail(`Commission splits drifted after write: ${diff.issues.join("; ")}`, {
          code: "SPLITS_DRIFT",
          body: { builderId, completedSteps: completed, diff },
        });
      }
      completed.push("verify_splits");

      await arrakis.setOpcity(args.env, builderId, false);
      await arrakis.updatePersonalDealInfo(args.env, builderId, {
        personalDeal: false,
        representedByAgent: true,
      });
      await arrakis.updateAdditionalFees(args.env, builderId, {
        hasAdditionalFees: false,
        additionalFeesParticipantInfos: [],
      });
      let payerSet = false;
      if (args.commissionPayer) {
        const created = (await arrakis.addOtherParticipant(args.env, builderId, {
          role: args.commissionPayer.role,
          firstName: args.commissionPayer.firstName,
          lastName: args.commissionPayer.lastName,
          companyName: args.commissionPayer.companyName,
          email: args.commissionPayer.email,
          phoneNumber: args.commissionPayer.phoneNumber,
        })) as { id?: string } | undefined;
        if (created?.id) {
          await arrakis.setCommissionPayer(args.env, builderId, {
            participantId: created.id,
            role: args.commissionPayer.role,
          });
          payerSet = true;
        }
      }
      await arrakis.updateTitleInfo(args.env, builderId, { useRealTitle: false });
      if (args.fmls) {
        await arrakis.updateFmlsInfo(args.env, builderId, args.fmls);
      }
      completed.push("finalize");

      // systemModifications: diff what we asked for vs what arrakis committed.
      // Closes the "how is this selected?" question the user asked on
      // ca181852 (team auto-switched, TC auto-added).
      const finalDraft = (await arrakis.getDraft(args.env, builderId)) as Record<string, unknown>;
      const systemModifications = diffSystemModifications({
        requestedTeamId: args.owner.teamId,
        requestedOwnerYentaId: args.owner.yentaId,
        requestedPartnerIds: args.partners.map((p) => p.agentId),
        draft: finalDraft,
      });

      return ok({
        builderId,
        draftUrl: buildDraftUrl(args.env, builderId),
        type: args.type,
        splits: computed.splits,
        total: computed.total,
        gross: computed.gross,
        renormalized: computed.renormalized,
        payerSet,
        systemModifications,
        participants: {
          owner: { participantId: ownerParticipantId, yentaId: args.owner.yentaId },
          partners: coAgentParticipants.map((c) => ({
            participantId: c.id,
            agentId: c.agentId,
            role: c.role,
          })),
          referral: referralParticipantId
            ? { participantId: referralParticipantId, kind: args.referral?.kind ?? null }
            : null,
        },
      });
    } catch (err) {
      const nextStage = STAGES.find((s) => !completed.includes(s));
      const code =
        err instanceof CommissionMathError
          ? "COMMISSION_MATH_ERROR"
          : err instanceof ApiError
            ? "ARRAKIS_ERROR"
            : "CREATE_FULL_DRAFT_FAILED";
      const message = err instanceof Error ? err.message : String(err);
      return fail(message, {
        code,
        status: err instanceof ApiError ? err.status : undefined,
        body: {
          builderId,
          completedSteps: completed,
          nextStage,
          detail: err instanceof ApiError ? err.body : undefined,
        },
      });
    }
  },
});

/**
 * After create + finalize, diff what the caller requested against what
 * arrakis committed. Team and transactionCoordinator are the two fields
 * arrakis is known to override post-POST based on server-side rules
 * (user's team memberships, default TC assignments). Surfacing these as
 * a structured list lets the skill explain "arrakis changed X" in plain
 * English rather than leaving the user to spot the differences in Bolt.
 */
function diffSystemModifications(args: {
  requestedTeamId: string | undefined;
  requestedOwnerYentaId: string;
  requestedPartnerIds: string[];
  draft: Record<string, unknown>;
}): Array<{ field: string; requested: unknown; actual: unknown; note: string }> {
  const out: Array<{ field: string; requested: unknown; actual: unknown; note: string }> = [];
  const agentsInfo = args.draft?.agentsInfo as Record<string, unknown> | undefined;
  const actualTeamId = asString(agentsInfo?.teamId);
  if (args.requestedTeamId && actualTeamId && actualTeamId !== args.requestedTeamId) {
    out.push({
      field: "teamId",
      requested: args.requestedTeamId,
      actual: actualTeamId,
      note: "arrakis reassigned the transaction's team. Commission splits/caps will apply per the new team's config. Likely source: the owner belongs to that team in yenta, and arrakis auto-prefers it over the requested teamId.",
    });
  }
  const tcs = (args.draft?.transactionCoordinators ?? []) as Array<{ yentaId?: string; id?: string; firstName?: string; lastName?: string }>;
  if (Array.isArray(tcs) && tcs.length > 0) {
    out.push({
      field: "transactionCoordinators",
      requested: [],
      actual: tcs.map((t) => ({ id: t.id, name: `${t.firstName ?? ""} ${t.lastName ?? ""}`.trim() })),
      note: `arrakis auto-attached ${tcs.length} Transaction Coordinator(s). Likely source: the owner's team or office has a default TC; arrakis pulls them onto new transactions. Remove in Bolt's "Other Participants" section if unwanted.`,
    });
  }
  const ownerAgents = (agentsInfo?.ownerAgent ?? []) as Array<{ yentaId?: string; agentId?: string }>;
  const actualOwnerYentaId = ownerAgents[0]?.yentaId ?? ownerAgents[0]?.agentId;
  if (actualOwnerYentaId && actualOwnerYentaId !== args.requestedOwnerYentaId) {
    out.push({
      field: "ownerAgent.yentaId",
      requested: args.requestedOwnerYentaId,
      actual: actualOwnerYentaId,
      note: "arrakis changed the owner agent. Unexpected — investigate.",
    });
  }
  return out;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function inferOwnerRole(rep: string): "BUYERS_AGENT" | "SELLERS_AGENT" | "TENANT_AGENT" {
  if (rep === "BUYER") return "BUYERS_AGENT";
  if (rep === "SELLER" || rep === "LANDLORD" || rep === "DUAL") return "SELLERS_AGENT";
  if (rep === "TENANT") return "TENANT_AGENT";
  return "BUYERS_AGENT";
}
