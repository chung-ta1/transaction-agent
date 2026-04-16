import { z } from "zod";
import { defineTool, ok, type ToolResult } from "../Tool.js";
import { envSchema } from "../../types/schemas.js";
import { fromError } from "./init.js";

export const addInternalReferral = defineTool({
  name: "add_internal_referral",
  description:
    "Add an internal referral (another Real agent). Requires yentaId. Max one non-opcity referral per draft — a second will be rejected by arrakis.",
  input: z.object({
    env: envSchema,
    builderId: z.string(),
    agentId: z.string().uuid(),
    receivesInvoice: z.boolean().default(false),
  }),
  async handler({ env, builderId, agentId, receivesInvoice }, { arrakis }): Promise<ToolResult<unknown>> {
    try {
      return ok(
        await arrakis.addReferralInfo(env, builderId, {
          role: "REFERRING_AGENT",
          type: "AGENT",
          agentId,
          receivesInvoice,
        }),
      );
    } catch (err) {
      return fromError(err);
    }
  },
});

export const addExternalReferral = defineTool({
  name: "add_external_referral",
  description:
    "Add an external referral (agent at an outside brokerage). Requires companyName (their brokerage), first/last name, address, and EIN. Call upload_referral_w9 afterward to attach a W9 PDF.",
  input: z.object({
    env: envSchema,
    builderId: z.string(),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    companyName: z.string().min(1),
    address: z.string().min(1),
    ein: z.string().min(1),
    email: z.string().email().optional(),
    phoneNumber: z.string().optional(),
    receivesInvoice: z.boolean().default(true),
    vendorDirectoryId: z.string().uuid().optional(),
  }),
  async handler(args, { arrakis }): Promise<ToolResult<unknown>> {
    const { env, builderId, ...rest } = args;
    try {
      return ok(
        await arrakis.addReferralInfo(env, builderId, {
          role: "REFERRING_AGENT",
          type: "EXTERNAL_ENTITY",
          ...rest,
        }),
      );
    } catch (err) {
      return fromError(err);
    }
  },
});

export const uploadReferralW9 = defineTool({
  name: "upload_referral_w9",
  description:
    "Attach a W9 PDF to an external referral participant. Only used after add_external_referral returns its participantId.",
  input: z.object({
    env: envSchema,
    builderId: z.string(),
    participantId: z.string(),
    filePath: z.string().min(1),
  }),
  async handler({ env, builderId, participantId, filePath }, { arrakis }): Promise<ToolResult<unknown>> {
    try {
      return ok(await arrakis.uploadReferralW9(env, builderId, participantId, filePath));
    } catch (err) {
      return fromError(err);
    }
  },
});
