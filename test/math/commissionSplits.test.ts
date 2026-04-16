import { describe, expect, it } from "vitest";
import {
  CommissionMathError,
  computeCommissionSplits,
  dollarsToCents,
} from "../../src/math/commissionSplits.js";

describe("computeCommissionSplits", () => {
  describe("canonical scenario: $20k · me 60 / Tamir 40 · 30% referral", () => {
    const result = computeCommissionSplits({
      grossCents: 20_000_00,
      currency: "USD",
      referral: { key: "R", displayName: "Jason Smith", rawPercent: 30 },
      agents: [
        { key: "A", displayName: "You", rawRatio: 60 },
        { key: "B", displayName: "Tamir", rawRatio: 40 },
      ],
    });

    it("produces three lines with the expected percents and dollars", () => {
      expect(result.splits).toHaveLength(3);
      const [ref, you, tamir] = result.splits;
      expect(ref).toMatchObject({ key: "R", percent: "30.00", amountCents: 6_000_00, amount: "6000.00", role: "referral" });
      expect(you).toMatchObject({ key: "A", percent: "42.00", amountCents: 8_400_00, amount: "8400.00", role: "agent" });
      expect(tamir).toMatchObject({ key: "B", percent: "28.00", amountCents: 5_600_00, amount: "5600.00", role: "agent" });
    });

    it("reports renormalized=true", () => {
      expect(result.renormalized).toBe(true);
    });

    it("reconciles totals exactly", () => {
      expect(result.total.percent).toBe("100.00");
      expect(result.total.amountCents).toBe(20_000_00);
      expect(result.total.amount).toBe("20000.00");
      expect(result.reconciled).toBe(true);
    });
  });

  describe("clean scenario: raw percents already sum to 100", () => {
    it("passes 50/30/20 through without renormalizing", () => {
      const r = computeCommissionSplits({
        grossCents: 10_000_00,
        currency: "USD",
        referral: { key: "R", rawPercent: 20 },
        agents: [
          { key: "A", rawRatio: 50 },
          { key: "B", rawRatio: 30 },
        ],
      });
      expect(r.renormalized).toBe(false);
      expect(r.splits.map((s) => s.percent)).toEqual(["20.00", "50.00", "30.00"]);
      expect(r.splits.map((s) => s.amountCents)).toEqual([2_000_00, 5_000_00, 3_000_00]);
      expect(r.total.amountCents).toBe(10_000_00);
    });
  });

  describe("no referral", () => {
    it("splits agents across the full 100%", () => {
      const r = computeCommissionSplits({
        grossCents: 20_000_00,
        currency: "USD",
        agents: [
          { key: "A", rawRatio: 60 },
          { key: "B", rawRatio: 40 },
        ],
      });
      expect(r.splits).toHaveLength(2);
      expect(r.splits.map((s) => s.percent)).toEqual(["60.00", "40.00"]);
      expect(r.splits.map((s) => s.amountCents)).toEqual([12_000_00, 8_000_00]);
      expect(r.renormalized).toBe(false); // 60+40 = 100 = agentPool
    });
  });

  describe("integer-cents exactness", () => {
    it("handles odd gross amounts without sub-cent drift ($333.33 / 3 agents)", () => {
      const r = computeCommissionSplits({
        grossCents: 333_33,
        currency: "USD",
        agents: [
          { key: "A", rawRatio: 1 },
          { key: "B", rawRatio: 1 },
          { key: "C", rawRatio: 1 },
        ],
      });
      expect(r.total.amountCents).toBe(333_33);
      const sum = r.splits.reduce((s, line) => s + line.amountCents, 0);
      expect(sum).toBe(333_33);
    });

    it("handles gross that doesn't divide evenly ($1.00 / 3 agents)", () => {
      const r = computeCommissionSplits({
        grossCents: 1_00,
        currency: "USD",
        agents: [
          { key: "A", rawRatio: 1 },
          { key: "B", rawRatio: 1 },
          { key: "C", rawRatio: 1 },
        ],
      });
      const sum = r.splits.reduce((s, line) => s + line.amountCents, 0);
      expect(sum).toBe(1_00);
      expect(r.total.percent).toBe("100.00");
    });
  });

  describe("error paths (the agent should surface these via AskUserQuestion)", () => {
    it("rejects referral >= 100", () => {
      expect(() =>
        computeCommissionSplits({
          grossCents: 10_000_00,
          currency: "USD",
          referral: { key: "R", rawPercent: 100 },
          agents: [{ key: "A", rawRatio: 1 }],
        }),
      ).toThrow(CommissionMathError);
    });

    it("rejects zero gross", () => {
      expect(() =>
        computeCommissionSplits({
          grossCents: 0,
          currency: "USD",
          agents: [{ key: "A", rawRatio: 1 }],
        }),
      ).toThrow(CommissionMathError);
    });

    it("rejects non-positive agent ratio", () => {
      expect(() =>
        computeCommissionSplits({
          grossCents: 10_000_00,
          currency: "USD",
          agents: [{ key: "A", rawRatio: 0 }],
        }),
      ).toThrow(CommissionMathError);
    });

    it("rejects empty agents list", () => {
      expect(() =>
        computeCommissionSplits({
          grossCents: 10_000_00,
          currency: "USD",
          agents: [],
        }),
      ).toThrow(CommissionMathError);
    });
  });
});

describe("dollarsToCents", () => {
  it.each([
    ["0", 0],
    ["20000", 20_000_00],
    ["20000.00", 20_000_00],
    ["20000.5", 20_000_50],
    ["20000.50", 20_000_50],
    ["0.99", 99],
    ["0.01", 1],
  ])("converts %s to %d cents", (input, expected) => {
    expect(dollarsToCents(input)).toBe(expected);
  });

  it("rejects scientific notation", () => {
    expect(() => dollarsToCents("2e4")).toThrow(CommissionMathError);
  });

  it("rejects too many decimal places", () => {
    expect(() => dollarsToCents("1.234")).toThrow(CommissionMathError);
  });
});
