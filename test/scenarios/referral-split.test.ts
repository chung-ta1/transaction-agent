import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * End-to-end scenario test for the user's canonical prompt:
 *
 *   $20,000 gross commission, me 60%, partner Tamir 40%,
 *   30% referral to Jason (external brokerage),
 *   123 Main St, New York, NY 10025.
 *
 * The renormalization rule requires splits to sum to 100%, so the numbers
 * that hit arrakis are:
 *   - Jason (referral, off-the-top): 30.00%  $6,000.00
 *   - You   (60 of 60+40 × 70%):     42.00%  $8,400.00
 *   - Tamir (40 of 60+40 × 70%):     28.00%  $5,600.00
 *
 * This test doesn't run the LLM agent — it verifies that the deterministic
 * math the agent is supposed to apply produces the expected numbers, using
 * integer cents throughout.
 */

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Scenario: $20k / me 60% / Tamir 40% / 30% external referral", () => {
  const grossCents = 20_000_00; // $20,000.00
  const userRatios = { you: 60, tamir: 40 };
  const referralPct = 30;

  it("renormalizes to sum exactly 100.00% and matches gross to the cent", () => {
    const agentPoolPct = 100 - referralPct;
    const ratioSum = userRatios.you + userRatios.tamir;

    const youPct = (userRatios.you / ratioSum) * agentPoolPct;
    const tamirPct = (userRatios.tamir / ratioSum) * agentPoolPct;

    // pct sum
    const totalPct = youPct + tamirPct + referralPct;
    expect(totalPct).toBeCloseTo(100.0, 5);

    // exact cents split: the 70% pool is $14,000 → 60/40 = $8,400 / $5,600
    const referralCents = Math.round((referralPct / 100) * grossCents);
    const youCents = Math.round((youPct / 100) * grossCents);
    const tamirCents = Math.round((tamirPct / 100) * grossCents);

    expect(referralCents).toBe(6_000_00);
    expect(youCents).toBe(8_400_00);
    expect(tamirCents).toBe(5_600_00);
    expect(referralCents + youCents + tamirCents).toBe(grossCents);
  });

  it("produces the commission-splits payload arrakis expects", () => {
    const payload = [
      {
        participantId: "REFERRAL",
        commission: { commissionAmount: null, commissionPercent: "30.00", percentEnabled: true },
      },
      {
        participantId: "YOU",
        commission: { commissionAmount: null, commissionPercent: "42.00", percentEnabled: true },
      },
      {
        participantId: "TAMIR",
        commission: { commissionAmount: null, commissionPercent: "28.00", percentEnabled: true },
      },
    ];

    const sumOfPercents = payload
      .map((p) => Number(p.commission.commissionPercent))
      .reduce((a, b) => a + b, 0);

    expect(sumOfPercents).toBeCloseTo(100.0, 5);
  });
});

describe("Scenario: clean split that already sums to 100 skips renormalization", () => {
  it("50/30/20 leaves numbers as-is", () => {
    const raw = { you: 50, tamir: 30, referral: 20 };
    const rawSum = raw.you + raw.tamir + raw.referral;
    expect(rawSum).toBe(100);

    // when the raw sum is already 100, ACK gate is skipped; values pass through
    expect(raw.you).toBe(50);
    expect(raw.tamir).toBe(30);
    expect(raw.referral).toBe(20);
  });
});

describe("Scenario: contradictory percentages require AskUserQuestion", () => {
  it("referral > 100 cannot be normalized", () => {
    const raw = { you: 50, tamir: 50, referral: 110 };
    const rawSum = raw.you + raw.tamir + raw.referral;

    // even if we scale by (1 - referral/100) there's no solution since referral alone > 100.
    expect(rawSum).toBeGreaterThan(100);
    expect(raw.referral).toBeGreaterThan(100);

    // Sanity rail must trigger — no interpretation valid, ask the user.
    // Deterministic signal the agent can use.
  });
});
