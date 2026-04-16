import { z } from "zod";
import { defineTool, ok, type ToolResult } from "../Tool.js";
import { envSchema } from "../../types/schemas.js";
import { buildDraftUrl } from "../../config.js";
import { fromError } from "./init.js";

export const getDraft = defineTool({
  name: "get_draft",
  description:
    "Fetch the current state of a draft transaction by id. Returns the raw TransactionBuilderResponse plus a draftUrl the user can open in bolt.",
  input: z.object({
    env: envSchema,
    builderId: z.string(),
  }),
  async handler({ env, builderId }, { arrakis }): Promise<ToolResult<{ draft: unknown; draftUrl: string }>> {
    try {
      const draft = await arrakis.getDraft(env, builderId);
      return ok({ draft, draftUrl: buildDraftUrl(env, builderId) });
    } catch (err) {
      return fromError(err);
    }
  },
});
