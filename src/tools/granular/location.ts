import { z } from "zod";
import { defineTool, ok, type ToolResult } from "../Tool.js";
import { envSchema, locationInfoSchema, priceAndDatesSchema } from "../../types/schemas.js";
import { fromError } from "./init.js";

export const updateLocation = defineTool({
  name: "update_location",
  description:
    "Set the property address on the draft. Required for subsequent steps. Year built is required in the USA; agent's registered country must match the property state's country.",
  input: z.object({
    env: envSchema,
    builderId: z.string(),
    location: locationInfoSchema,
  }),
  async handler({ env, builderId, location }, { arrakis }): Promise<ToolResult<unknown>> {
    try {
      return ok(await arrakis.updateLocationInfo(env, builderId, location));
    } catch (err) {
      return fromError(err);
    }
  },
});

export const updatePriceAndDates = defineTool({
  name: "update_price_and_dates",
  description:
    "Set deal type, sale price, sale commission, representation type, property type and any known dates. `listingCommission` is mandatory when representationType=DUAL. `salePrice` must be > 0.",
  input: z.object({
    env: envSchema,
    builderId: z.string(),
    priceAndDates: priceAndDatesSchema,
  }),
  async handler({ env, builderId, priceAndDates }, { arrakis }): Promise<ToolResult<unknown>> {
    try {
      return ok(await arrakis.updatePriceAndDateInfo(env, builderId, priceAndDates));
    } catch (err) {
      return fromError(err);
    }
  },
});
