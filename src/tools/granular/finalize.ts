import { z } from "zod";
import { defineTool, ok, type ToolResult } from "../Tool.js";
import {
  additionalFeesSchema,
  envSchema,
  fmlsInfoSchema,
  personalDealInfoSchema,
  titleInfoSchema,
} from "../../types/schemas.js";
import { fromError } from "./init.js";

export const updatePersonalDealInfo = defineTool({
  name: "update_personal_deal_info",
  description:
    "Set personalDeal + representedByAgent on the draft. Both fields are @NotNull. Normal non-personal deal: {personalDeal:false, representedByAgent:true}.",
  input: z.object({
    env: envSchema,
    builderId: z.string(),
    info: personalDealInfoSchema,
  }),
  async handler({ env, builderId, info }, { arrakis }): Promise<ToolResult<unknown>> {
    try {
      return ok(await arrakis.updatePersonalDealInfo(env, builderId, info));
    } catch (err) {
      return fromError(err);
    }
  },
});

export const updateAdditionalFeesInfo = defineTool({
  name: "update_additional_fees_info",
  description:
    "Set additional-fees on the draft. Send {hasAdditionalFees:false, additionalFeesParticipantInfos:[]} when there are none.",
  input: z.object({
    env: envSchema,
    builderId: z.string(),
    fees: additionalFeesSchema,
  }),
  async handler({ env, builderId, fees }, { arrakis }): Promise<ToolResult<unknown>> {
    try {
      return ok(await arrakis.updateAdditionalFees(env, builderId, fees));
    } catch (err) {
      return fromError(err);
    }
  },
});

export const updateTitleInfo = defineTool({
  name: "update_title_info",
  description:
    "Set title info. Must be called. {useRealTitle:false} is the safe default; true requires titleContactInfo + manualOrderPlaced.",
  input: z.object({
    env: envSchema,
    builderId: z.string(),
    title: titleInfoSchema,
  }),
  async handler({ env, builderId, title }, { arrakis }): Promise<ToolResult<unknown>> {
    try {
      return ok(await arrakis.updateTitleInfo(env, builderId, title));
    } catch (err) {
      return fromError(err);
    }
  },
});

export const updateFmlsInfo = defineTool({
  name: "update_fmls_info",
  description:
    "Georgia only: set whether the property is listed on FMLS. Skip on non-Georgia states.",
  input: z.object({
    env: envSchema,
    builderId: z.string(),
    fmls: fmlsInfoSchema,
  }),
  async handler({ env, builderId, fmls }, { arrakis }): Promise<ToolResult<unknown>> {
    try {
      return ok(await arrakis.updateFmlsInfo(env, builderId, fmls));
    } catch (err) {
      return fromError(err);
    }
  },
});
