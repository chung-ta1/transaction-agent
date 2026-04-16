import type { Tool } from "./Tool.js";
import { granularTools } from "./granular/index.js";
import { convenienceTools } from "./convenience/index.js";

/**
 * The agent prefers convenience tools for the happy path. Granular tools are
 * available for corrections and edge cases.
 */
export const allTools: Tool[] = [...convenienceTools, ...granularTools];
