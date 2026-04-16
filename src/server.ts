import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { AuthService } from "./auth/AuthService.js";
import { TokenCache } from "./auth/TokenCache.js";
import { TransactionBuilderApi } from "./services/TransactionBuilderApi.js";
import { YentaAgentApi } from "./services/YentaAgentApi.js";
import { allTools } from "./tools/index.js";
import type { Tool, ToolContext } from "./tools/Tool.js";

export function createServer(): Server {
  const auth = new AuthService(new TokenCache());
  const ctx: ToolContext = {
    auth,
    arrakis: new TransactionBuilderApi(auth),
    yenta: new YentaAgentApi(auth),
  };

  const byName = new Map<string, Tool>(allTools.map((t) => [t.name, t]));

  const server = new Server(
    { name: "transaction-agent", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.input, { target: "jsonSchema7" }),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = byName.get(req.params.name);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }],
      };
    }

    const parsed = tool.input.safeParse(req.params.arguments);
    if (!parsed.success) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Invalid arguments for ${tool.name}: ${parsed.error.message}`,
          },
        ],
      };
    }

    try {
      const result = await tool.handler(parsed.data, ctx);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: "text", text: `${tool.name} failed: ${message}` }],
      };
    }
  });

  return server;
}
