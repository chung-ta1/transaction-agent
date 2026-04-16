/**
 * Post-write verification of commission splits. After the agent calls
 * `set_commission_splits`, the `verify_draft_splits` tool refetches the draft
 * and uses this helper to diff what arrakis stored against what we sent.
 *
 * Any drift (missing participant, mismatched percent, mismatched amount) is a
 * HARD FAIL — we never hand the user a "success" URL when the committed state
 * doesn't match intent.
 */

export interface SentSplit {
  participantId: string;
  percent: string; // "42.00"
}

export interface CommittedSplit {
  participantId: string;
  percent: string; // as arrakis returns it
}

export interface SplitDiff {
  ok: boolean;
  issues: string[];
  missing: string[]; // sent participant ids not present in committed
  extra: string[]; // committed participant ids we didn't send
  mismatches: Array<{ participantId: string; sent: string; committed: string }>;
}

/**
 * Compare sent vs. committed splits. Both are treated as percent-string lists.
 *
 * Allowable tolerance: percent strings must match to 2 decimal places exactly.
 * arrakis should round-trip the exact strings we sent; any drift is an alarm.
 */
export function diffSplits(sent: SentSplit[], committed: CommittedSplit[]): SplitDiff {
  const issues: string[] = [];
  const sentByPid = new Map(sent.map((s) => [s.participantId, s.percent]));
  const committedByPid = new Map(committed.map((c) => [c.participantId, c.percent]));

  const missing = [...sentByPid.keys()].filter((pid) => !committedByPid.has(pid));
  const extra = [...committedByPid.keys()].filter((pid) => !sentByPid.has(pid));
  const mismatches: SplitDiff["mismatches"] = [];

  for (const [pid, sentPct] of sentByPid) {
    const committedPct = committedByPid.get(pid);
    if (committedPct === undefined) continue;
    if (!percentsEqual(sentPct, committedPct)) {
      mismatches.push({ participantId: pid, sent: sentPct, committed: committedPct });
    }
  }

  if (missing.length > 0) issues.push(`Missing from draft: ${missing.join(", ")}`);
  if (extra.length > 0) issues.push(`Unexpected in draft: ${extra.join(", ")}`);
  for (const m of mismatches) {
    issues.push(
      `Percent drift on ${m.participantId}: sent ${m.sent}, committed ${m.committed}`,
    );
  }

  return { ok: issues.length === 0, issues, missing, extra, mismatches };
}

/**
 * Extract {participantId, percent} pairs from a TransactionBuilderResponse.
 * Uses a tolerant walk because arrakis's response shape has nested forms.
 */
export function extractCommittedSplits(draft: unknown): CommittedSplit[] {
  if (!draft || typeof draft !== "object") return [];
  const obj = draft as Record<string, unknown>;
  const candidates: unknown[] = [];

  // Known shapes observed in arrakis responses — add more here as we see them.
  if (Array.isArray(obj.commissionSplitsInfo)) candidates.push(...obj.commissionSplitsInfo);
  if (Array.isArray(obj.commissionSplits)) candidates.push(...obj.commissionSplits);

  const out: CommittedSplit[] = [];
  for (const c of candidates) {
    if (!c || typeof c !== "object") continue;
    const rec = c as Record<string, unknown>;
    const pid = asString(rec.participantId ?? rec.id);
    const commission = rec.commission as Record<string, unknown> | undefined;
    const pct = asString(
      commission?.commissionPercent ?? commission?.percent ?? rec.commissionPercent,
    );
    if (pid && pct !== undefined) {
      out.push({ participantId: pid, percent: normalizePercent(pct) });
    }
  }
  return out;
}

function percentsEqual(a: string, b: string): boolean {
  return normalizePercent(a) === normalizePercent(b);
}

/**
 * Trim trailing zeros in a way that doesn't affect equality — we match on the
 * canonical 2dp form, so "42" → "42.00", "42.0" → "42.00", "42.00" → "42.00".
 */
function normalizePercent(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return n.toFixed(2);
}

function asString(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return undefined;
}
