/**
 * Deterministic commission-split math. Integer cents throughout; NO JavaScript
 * floats on money at the boundary. Enforces arrakis's sum-to-100% rule and
 * reconciles every dollar to the gross.
 *
 * This is the module behind the `compute_commission_splits` MCP tool — the
 * agent delegates arithmetic here so the numbers are deterministic, not the
 * LLM's guess.
 */

export interface AgentRatio {
  /** Stable identifier matching the participantId arrakis will assign. */
  key: string;
  /** Human-readable label (for preview rendering). */
  displayName?: string;
  /** Raw ratio the user typed (e.g. 60 in "60/40"). Must be > 0. */
  rawRatio: number;
}

export interface ReferralInput {
  key: string;
  displayName?: string;
  /** Raw referral percentage of gross (e.g. 30 means 30% off the top). 0 ≤ x < 100. */
  rawPercent: number;
}

export interface ComputeSplitsInput {
  /** Gross commission in integer cents (> 0). */
  grossCents: number;
  currency: "USD" | "CAD";
  /** Present only when there's a referral. */
  referral?: ReferralInput;
  /** At least one agent required. */
  agents: AgentRatio[];
}

export interface SplitLine {
  key: string;
  displayName?: string;
  /** Percentage to send to arrakis, exactly 2 decimal places (e.g. "42.00"). */
  percent: string;
  /** Integer cents. */
  amountCents: number;
  /** Dollar string with 2 decimal places (e.g. "8400.00"). */
  amount: string;
  /** Which category this line represents. */
  role: "agent" | "referral";
}

export interface ComputeSplitsResult {
  splits: SplitLine[];
  total: {
    percent: string; // always "100.00" on success
    amountCents: number; // always equal to grossCents
    amount: string;
  };
  gross: { amountCents: number; amount: string; currency: "USD" | "CAD" };
  /** True iff the raw user input had to be rescaled to fit the sum-to-100 rule. */
  renormalized: boolean;
  /**
   * Always true on a successful return — both invariants hold:
   *   Σ percent == "100.00"
   *   Σ amountCents == grossCents
   * If we can't reconcile we throw instead of returning `false`.
   */
  reconciled: true;
}

export class CommissionMathError extends Error {
  override readonly name = "CommissionMathError";
}

/**
 * Compute arrakis-ready commission splits.
 *
 * Throws `CommissionMathError` on any internally contradictory input
 * (e.g. referral ≥ 100%, zero/negative agent ratios). The caller should
 * surface the error via `AskUserQuestion` — never guess.
 */
export function computeCommissionSplits(input: ComputeSplitsInput): ComputeSplitsResult {
  assertPositiveInteger(input.grossCents, "grossCents");
  if (input.agents.length < 1) {
    throw new CommissionMathError("At least one agent is required.");
  }

  const referralPct = input.referral?.rawPercent ?? 0;
  if (referralPct < 0 || referralPct >= 100) {
    throw new CommissionMathError(
      `Referral percentage must be in [0, 100). Got ${referralPct}.`,
    );
  }

  const ratioSum = input.agents.reduce((s, a) => s + a.rawRatio, 0);
  if (ratioSum <= 0) {
    throw new CommissionMathError("Sum of agent ratios must be > 0.");
  }
  for (const a of input.agents) {
    if (a.rawRatio <= 0) {
      throw new CommissionMathError(`Agent ${a.key} has non-positive ratio ${a.rawRatio}.`);
    }
  }

  const agentPoolPct = 100 - referralPct;

  // Did we have to rescale the agents' numbers? If the user's raw agent ratios
  // already equal the post-referral pool (sum to agentPoolPct), no rescale.
  // Otherwise we treat the ratios as relative shares of the pool.
  const renormalized = !approxEqual(ratioSum, agentPoolPct, 0.00001);

  // Basis points = percent × 100 (so 42.00% → 4200 bp, 100% → 10000 bp).
  // Compute each agent's bp from the ratio; round to nearest int; adjust the
  // last element to make the basis-point sum exactly 10000.
  const TOTAL_BP = 10_000;
  const referralBp = Math.round(referralPct * 100);
  const agentBpsRaw = input.agents.map((a) => (a.rawRatio / ratioSum) * agentPoolPct * 100);
  const agentBps = agentBpsRaw.map((bp) => Math.round(bp));

  let bpSum = referralBp + agentBps.reduce((s, b) => s + b, 0);
  if (bpSum !== TOTAL_BP) {
    // Adjust the last agent to absorb the rounding drift. Drift should be ≤ agents.length
    // basis points so this is safe — we're never moving more than a cent of percent per
    // participant's worth of accumulated rounding.
    agentBps[agentBps.length - 1] += TOTAL_BP - bpSum;
    bpSum = TOTAL_BP;
  }

  // Convert basis points → cents. First N-1 rounded; the last element absorbs
  // the remainder so Σ cents == grossCents exactly.
  const lineCount = 1 + input.agents.length; // referral (maybe 0 bp) + agents, but we only include referral in splits if input.referral is set
  const bps = input.referral ? [referralBp, ...agentBps] : agentBps;
  const keys = input.referral
    ? [input.referral.key, ...input.agents.map((a) => a.key)]
    : input.agents.map((a) => a.key);
  const displayNames = input.referral
    ? [input.referral.displayName, ...input.agents.map((a) => a.displayName)]
    : input.agents.map((a) => a.displayName);
  const roles: SplitLine["role"][] = input.referral
    ? ["referral", ...input.agents.map(() => "agent" as const)]
    : input.agents.map(() => "agent");

  // If there's no referral, we still need the bp sum to be 10000 on the agents alone.
  const nonReferralBpSum = bps.reduce((s, b) => s + b, 0);
  if (nonReferralBpSum !== TOTAL_BP) {
    bps[bps.length - 1] += TOTAL_BP - nonReferralBpSum;
  }
  void lineCount;

  const cents = new Array<number>(bps.length);
  let runningCents = 0;
  for (let i = 0; i < bps.length - 1; i++) {
    // percent of gross = bp / 10000; cents = pct * grossCents
    cents[i] = Math.round((bps[i] * input.grossCents) / TOTAL_BP);
    runningCents += cents[i];
  }
  cents[bps.length - 1] = input.grossCents - runningCents;

  // Build SplitLine[]
  const splits: SplitLine[] = bps.map((bp, i) => ({
    key: keys[i]!,
    displayName: displayNames[i],
    percent: bpToPercentString(bp),
    amountCents: cents[i]!,
    amount: centsToDollarString(cents[i]!),
    role: roles[i]!,
  }));

  // Invariants — throw if they don't hold. They always should, but failing
  // loudly if anything drifts is cheap insurance.
  const percentSumBp = bps.reduce((s, b) => s + b, 0);
  const centsSum = cents.reduce((s, c) => s + c, 0);
  if (percentSumBp !== TOTAL_BP) {
    throw new CommissionMathError(
      `Percent sum failed to reconcile: ${bpToPercentString(percentSumBp)} (expected 100.00).`,
    );
  }
  if (centsSum !== input.grossCents) {
    throw new CommissionMathError(
      `Dollar sum failed to reconcile: ${centsToDollarString(centsSum)} (expected ${centsToDollarString(input.grossCents)}).`,
    );
  }

  return {
    splits,
    total: {
      percent: bpToPercentString(TOTAL_BP),
      amountCents: centsSum,
      amount: centsToDollarString(centsSum),
    },
    gross: {
      amountCents: input.grossCents,
      amount: centsToDollarString(input.grossCents),
      currency: input.currency,
    },
    renormalized,
    reconciled: true,
  };
}

/** Parse a decimal dollar string (e.g. "20000.00", "20000", "20000.5") into integer cents. */
export function dollarsToCents(amount: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
    throw new CommissionMathError(
      `Amount "${amount}" is not a valid decimal string (must be e.g. "20000" or "20000.00").`,
    );
  }
  const [whole, frac = ""] = amount.split(".");
  const paddedFrac = (frac + "00").slice(0, 2);
  return Number(whole) * 100 + Number(paddedFrac);
}

// ---- helpers ----

function assertPositiveInteger(n: number, name: string): void {
  if (!Number.isInteger(n) || n <= 0) {
    throw new CommissionMathError(`${name} must be a positive integer, got ${n}.`);
  }
}

function approxEqual(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol;
}

function bpToPercentString(bp: number): string {
  const whole = Math.trunc(bp / 100);
  const cents = Math.abs(bp % 100);
  return `${whole}.${cents.toString().padStart(2, "0")}`;
}

function centsToDollarString(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.trunc(abs / 100);
  const frac = abs % 100;
  return `${sign}${whole}.${frac.toString().padStart(2, "0")}`;
}
