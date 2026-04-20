import { z } from "zod";
import { defineTool, ok, type ToolResult } from "../Tool.js";
import { envSchema } from "../../types/schemas.js";
import { ApiError } from "../../services/BaseApi.js";

/**
 * Pre-write status lint for a batch of yenta agents. Fetches each id and
 * returns their AgentStatus (CANDIDATE / ACTIVE / INACTIVE / …). The caller
 * uses this BEFORE any arrakis write to avoid `InvalidAgentStatusException:
 * Cannot initialize a CANDIDATE agent` at stage 6 of 12 — that error cost
 * us three round-trips on draft c99ce417 (2026-04-20).
 *
 * Returns { ok, issues[] } where `issues[]` names each yentaId whose status
 * isn't ACTIVE, with the specific reason. Empty issues[] means all agents
 * are OK to reference on a transaction.
 *
 * Not a guarantee of success — arrakis may still reject for other reasons
 * (referral-only agent on a regular transaction, cross-country, etc.). But
 * it closes the single most common "fail halfway through" mode.
 */
export const validateAgents = defineTool({
  name: "validate_agents",
  description:
    "Lint a batch of yenta agent IDs for status=ACTIVE before any arrakis write. Returns { ok, issues[] } where each issue names a yentaId whose status blocks participation (CANDIDATE, INACTIVE, REJECTED). Call this as a pre-flight for any flow that adds partners or referrals to a transaction — catches at turn zero what arrakis would otherwise reject at stage 6 of 12 of create_full_draft.",
  input: z.object({
    env: envSchema,
    yentaIds: z
      .array(z.string().uuid())
      .min(1)
      .describe(
        "yentaIds of every partner + referral agent the caller plans to add.",
      ),
  }),
  async handler(
    { env, yentaIds },
    { yenta },
  ): Promise<
    ToolResult<{
      ok: boolean;
      issues: Array<{ yentaId: string; status: string | undefined; reason: string }>;
      statuses: Record<string, string | undefined>;
    }>
  > {
    const results = await Promise.all(
      yentaIds.map(async (id) => {
        try {
          const agent = await yenta.getAgent(env, id);
          if (!agent) return { id, status: undefined, reason: `no yenta record for ${id}` };
          const status = agent.agentStatus;
          if (!status || status === "ACTIVE") {
            return { id, status, reason: "" };
          }
          return {
            id,
            status,
            reason: `${agent.firstName ?? ""} ${agent.lastName ?? ""}`.trim() +
              ` is ${status} (only ACTIVE agents can be added to a transaction)`,
          };
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) {
            return { id, status: undefined, reason: `yentaId ${id} not found (404)` };
          }
          const message = err instanceof Error ? err.message : String(err);
          return { id, status: undefined, reason: `lookup failed: ${message}` };
        }
      }),
    );

    const issues = results
      .filter((r) => r.reason.length > 0)
      .map((r) => ({ yentaId: r.id, status: r.status, reason: r.reason }));
    const statuses = Object.fromEntries(results.map((r) => [r.id, r.status]));
    return ok({ ok: issues.length === 0, issues, statuses });
  },
});
