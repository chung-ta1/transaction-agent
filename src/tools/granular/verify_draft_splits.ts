import { z } from "zod";
import { defineTool, fail, ok, type ToolResult } from "../Tool.js";
import { envSchema } from "../../types/schemas.js";
import {
  diffSplits,
  extractCommittedSplits,
  type SplitDiff,
} from "../../math/verifySplits.js";
import { ApiError } from "../../services/BaseApi.js";

/**
 * Post-write check: refetch the draft and diff arrakis's committed commission
 * splits against what we sent. Any drift is a HARD FAIL — the caller must
 * treat this as a blocking error, not a warning.
 */
export const verifyDraftSplits = defineTool({
  name: "verify_draft_splits",
  description:
    "After calling set_commission_splits, verify arrakis actually stored what was sent. Fetches the draft by id and diffs the committed commission-splits against the payload you pass in. MUST be called immediately after set_commission_splits — any drift (missing participant, mismatched percent) is a HARD FAIL; do not return a success URL to the user if verification fails.",
  input: z.object({
    env: envSchema,
    builderId: z.string(),
    sent: z
      .array(
        z.object({
          participantId: z.string(),
          percent: z.string(),
        }),
      )
      .min(1),
  }),
  async handler({ env, builderId, sent }, { arrakis }): Promise<ToolResult<SplitDiff>> {
    try {
      const draft = await arrakis.getDraft(env, builderId);
      const committed = extractCommittedSplits(draft);
      const diff = diffSplits(sent, committed);
      if (!diff.ok) {
        return fail(
          `Draft splits did not match what was sent: ${diff.issues.join("; ")}`,
          { code: "SPLITS_DRIFT", body: diff },
        );
      }
      return ok(diff);
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.message, { status: err.status, body: err.body });
      }
      if (err instanceof Error) return fail(err.message);
      return fail(String(err));
    }
  },
});
