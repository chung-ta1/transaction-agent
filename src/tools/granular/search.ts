import { defineTool, ok, type ToolResult } from "../Tool.js";
import { searchAgentSchema } from "../../types/schemas.js";
import type { AgentCandidate } from "../../services/YentaAgentApi.js";
import { fromError } from "./init.js";

export const searchAgentByName = defineTool({
  name: "search_agent_by_name",
  description:
    "Search yenta for Real agents by first name, last name, email, or a free-form query. Returns up to 10 candidates. Used by the agent to resolve named partners and internal referrals to yentaIds.",
  input: searchAgentSchema,
  async handler(args, { yenta }): Promise<ToolResult<{ candidates: AgentCandidate[] }>> {
    const { env, ...query } = args;
    try {
      const candidates = await yenta.searchAgents(env, query);
      return ok({ candidates });
    } catch (err) {
      return fromError(err);
    }
  },
});
