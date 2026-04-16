import { z } from "zod";
import { defineTool, ok, type ToolResult } from "../Tool.js";
import { envSchema } from "../../types/schemas.js";
import { fromError } from "../granular/init.js";

/**
 * One referral tool that picks the right arrakis call based on whether the
 * referrer is a Real agent (internal) or outside (external), and optionally
 * uploads the W9 when provided.
 */
export const addReferral = defineTool({
  name: "add_referral",
  description:
    "Add a referral to the draft. Pass `kind: \"internal\"` with a Real agent yentaId, or `kind: \"external\"` with full external-entity fields (company/first/last/address/ein + optional W9 path). Max one non-opcity referral per draft.",
  input: z.union([
    z.object({
      env: envSchema,
      builderId: z.string(),
      kind: z.literal("internal"),
      agentId: z.string().uuid(),
      receivesInvoice: z.boolean().default(false),
    }),
    z.object({
      env: envSchema,
      builderId: z.string(),
      kind: z.literal("external"),
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      companyName: z.string().min(1),
      address: z.string().min(1),
      ein: z.string().min(1),
      email: z.string().email().optional(),
      phoneNumber: z.string().optional(),
      receivesInvoice: z.boolean().default(true),
      vendorDirectoryId: z.string().uuid().optional(),
      w9FilePath: z.string().optional(),
    }),
  ]),
  async handler(args, { arrakis }): Promise<ToolResult<{ participantId?: string }>> {
    try {
      if (args.kind === "internal") {
        const result = (await arrakis.addReferralInfo(args.env, args.builderId, {
          role: "REFERRING_AGENT",
          type: "AGENT",
          agentId: args.agentId,
          receivesInvoice: args.receivesInvoice,
        })) as { id?: string } | undefined;
        return ok({ participantId: result?.id });
      }

      const { env, builderId, kind: _k, w9FilePath, ...rest } = args;
      const result = (await arrakis.addReferralInfo(env, builderId, {
        role: "REFERRING_AGENT",
        type: "EXTERNAL_ENTITY",
        ...rest,
      })) as { id?: string } | undefined;

      const participantId = result?.id;
      if (w9FilePath && participantId) {
        await arrakis.uploadReferralW9(env, builderId, participantId, w9FilePath);
      }
      return ok({ participantId });
    } catch (err) {
      return fromError(err);
    }
  },
});
