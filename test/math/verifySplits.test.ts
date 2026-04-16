import { describe, expect, it } from "vitest";
import { diffSplits, extractCommittedSplits } from "../../src/math/verifySplits.js";

describe("diffSplits", () => {
  it("returns ok when sent and committed match exactly", () => {
    const d = diffSplits(
      [
        { participantId: "A", percent: "42.00" },
        { participantId: "B", percent: "28.00" },
      ],
      [
        { participantId: "A", percent: "42.00" },
        { participantId: "B", percent: "28.00" },
      ],
    );
    expect(d.ok).toBe(true);
    expect(d.issues).toEqual([]);
  });

  it("tolerates equivalent percent strings (42 vs 42.00)", () => {
    const d = diffSplits(
      [{ participantId: "A", percent: "42.00" }],
      [{ participantId: "A", percent: "42" }],
    );
    expect(d.ok).toBe(true);
  });

  it("flags a percent mismatch", () => {
    const d = diffSplits(
      [{ participantId: "A", percent: "42.00" }],
      [{ participantId: "A", percent: "41.99" }],
    );
    expect(d.ok).toBe(false);
    expect(d.mismatches).toEqual([
      { participantId: "A", sent: "42.00", committed: "41.99" },
    ]);
  });

  it("flags missing participants", () => {
    const d = diffSplits(
      [
        { participantId: "A", percent: "50.00" },
        { participantId: "B", percent: "50.00" },
      ],
      [{ participantId: "A", percent: "50.00" }],
    );
    expect(d.ok).toBe(false);
    expect(d.missing).toEqual(["B"]);
  });

  it("flags unexpected extras in the draft", () => {
    const d = diffSplits(
      [{ participantId: "A", percent: "100.00" }],
      [
        { participantId: "A", percent: "100.00" },
        { participantId: "C", percent: "0.00" },
      ],
    );
    expect(d.ok).toBe(false);
    expect(d.extra).toEqual(["C"]);
  });
});

describe("extractCommittedSplits", () => {
  it("returns [] on null", () => {
    expect(extractCommittedSplits(null)).toEqual([]);
  });

  it("reads commissionSplitsInfo with participantId + commission.commissionPercent", () => {
    const draft = {
      commissionSplitsInfo: [
        { participantId: "A", commission: { commissionPercent: "42.00" } },
        { participantId: "B", commission: { commissionPercent: "28.00" } },
      ],
    };
    expect(extractCommittedSplits(draft)).toEqual([
      { participantId: "A", percent: "42.00" },
      { participantId: "B", percent: "28.00" },
    ]);
  });

  it("reads commissionSplits as an alternative key", () => {
    const draft = {
      commissionSplits: [{ id: "X", commissionPercent: "100.00" }],
    };
    expect(extractCommittedSplits(draft)).toEqual([
      { participantId: "X", percent: "100.00" },
    ]);
  });
});
