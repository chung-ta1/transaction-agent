# transaction-rules

Rulebook the `transaction-creator` agent loads on every run. Bullets tagged
`<!-- auto:arrakis-pin:{sha} -->` are maintained by the drift-sync; everything
else is hand-written and won't be overwritten.

---

## Auth & environment

- **Production is permanently blocked.** Any env resolving to `therealbrokerage.com` is rejected before the MCP makes any HTTP call. Supported: `team1`, `team2`, `team3`, `team4`, `team5`, `play`, `stage`.
- **JWT cached per-env.** Browser login runs lazily (first tool call that needs it), caches in memory + optional macOS Keychain. On 401 the MCP evicts and reopens the browser exactly once.
- **Never log secrets.** `Authorization` headers are redacted in any structured logs.

## Representation & deal type

- **Representation inference from the prompt:**
  - "buyer's agent" / "representing the buyer" → `BUYER`
  - "listing agent" / "seller's agent" / "representing the seller" → `SELLER`
  - "both sides" / "dual rep" → `DUAL`
  - "tenant side" / "for the tenant" → `TENANT`
  - "landlord side" / "for the landlord" → `LANDLORD`
- **Never finalize representation silently** — always confirm in the preview.
- **Deal type default**: `SALE`. Flip to `LEASE` on words like lease/rental/tenant/landlord, to `REFERRAL` only when explicitly stated.
- **Property type default**: `RESIDENTIAL` (matches arrakis's backward-compat default). Change only if the prompt names commercial/land/condo/townhouse.

## Location & country

- **Agent-country must match property-state country.** `TransactionBuilder.updateAddress` throws if the agent is registered in the USA and the property is in Canada (or vice versa). Surface this as a translated error *before* writing.
- **Year built is required in the USA.** Optional in Canada.
- **Currency by state.** US → `USD`. Canadian provinces (`ALBERTA`, `BRITISH_COLUMBIA`, `MANITOBA`, `NEW_BRUNSWICK`, `NEWFOUNDLAND_AND_LABRADOR`, `NOVA_SCOTIA`, `NORTHWEST_TERRITORIES`, `NUNAVUT`, `ONTARIO`, `PRINCE_EDWARD_ISLAND`, `QUEBEC`, `SASKATCHEWAN`, `YUKON`) → `CAD`. Derived from `state`; only confirm if the prompt's dollar symbol contradicts.
- **FMLS** is only offered/required when `state == GEORGIA` and deal is SALE/LEASE. Skip `update_fmls_info` elsewhere.

## Buyers & sellers

- `sellers` list is `@NotEmpty` — at least one seller every time. Buyers are also required for transactions (`For transactions, you must specify a list of buyers.`). Ask for names if the prompt omits them.
- Each person needs **companyName** OR (**firstName** AND **lastName**).

## Commission — the core math

The rule that trips users up. Read this section carefully on every run.

**arrakis rule**: the percentages inside `set_commission_splits` must sum to **exactly 100%** (verified at `TestTransactionBuilder.setCommissionSplitsForSingleRep:656` — `remainingForUndefined = 100 - percentCommissionsTotal`). Referral participants are in the same list as agent participants — their percent counts toward the 100% too.

**Interpretation of a prompt like "me 60% / Tamir 40% / 30% referral" ($20k gross)**:

1. Referral comes off the top of gross:
   - `referral_pct_of_gross = 30%` → `$6,000`
   - `agent_pool_pct = 100 − 30 = 70%` → `$14,000`
2. The user's `60 / 40` is the **ratio between the agents**, not %-of-gross:
   - `me_share_of_pool = 60 / (60 + 40) = 0.60`
   - `tamir_share_of_pool = 40 / (60 + 40) = 0.40`
3. Effective %-of-gross (what goes to arrakis):
   - `me_pct = me_share_of_pool × agent_pool_pct = 0.60 × 70 = 42%` → `$8,400`
   - `tamir_pct = 0.40 × 70 = 28%` → `$5,600`
4. **Sanity check**: `30 + 42 + 28 = 100%`. Dollars: `$6,000 + $8,400 + $5,600 = $20,000`.

**Shortcut**: when the user's agent ratios already sum to 100 (as in 60+40), each agent's arrakis-pct is just `user_ratio × (1 − referral_pct_of_gross)`. 60 × 0.7 = 42; 40 × 0.7 = 28.

### ⚠️ Financial-grade accuracy stack

Seven independent guards. **This is a financial document — every guard is mandatory; they compose.**

**G1. Integer-cents arithmetic — code-enforced.** All commission math runs through `compute_commission_splits`, which is a pure TypeScript module (`src/math/commissionSplits.ts`) using integer cents and basis-points throughout. The agent **must** call this tool — it never computes splits in the LLM. The tool throws `CommissionMathError` on any contradictory input; treat that as a stop.

**G2. Renormalization ACK — TYPE-TO-CONFIRM gate (not a button click).**

When the user's raw percentages don't already sum to `100.00`, the agent must fire a dedicated `AskUserQuestion` *before* the final preview, with a bold red callout and the full math trace:

> 🛑 **COMMISSION RENORMALIZED TO SUM TO 100% — REVIEW CAREFULLY**
>
> **Your prompt said:**
> - You:    `60%`
> - Tamir:  `40%`
> - Jason:  `30%` referral
> - **Raw sum: `130%`** (arrakis rejects anything ≠ 100%)
>
> **I will send to arrakis:**
> - Jason (referral off the top): `30.00%` → `$6,000.00`
> - You (60/(60+40) × 70%):        `42.00%` → `$8,400.00`
> - Tamir (40/(60+40) × 70%):      `28.00%` → `$5,600.00`
> - **Normalized sum: `100.00%`** · **Dollar sum: `$20,000.00`** · Gross: `$20,000.00` · ✓ reconciled

The user must **type a literal "confirm" word** (not just pick a button) to advance. The agent uses `AskUserQuestion` with an `Other` free-text path and a required exact token — no "Yes, proceed" button. This is deliberate friction so the user can't absent-mindedly approve a wrong number.

Accepted tokens: `confirm`, `I confirm`, `yes confirm`. Anything else (including plain "yes") loops back to the ACK with the callout.

**G3. Dollar-and-percent dual reconciliation — code-enforced inside `compute_commission_splits`.** The tool asserts both invariants before returning; if either fails it throws. Two invariants:

- `Σ dollars == gross` to the exact cent
- `Σ percentages == 100.00` to two decimals

A successful return means both held. The agent gets `reconciled: true` deterministically — no LLM arithmetic involved.

**G4. Raw JSON preview.** In the final preview (after the ACK gate), the agent shows the exact JSON payload that will be sent to `set_commission_splits`, alongside the human-readable summary. The user can eyeball the wire format — no hiding.

**G4a. Human-readable preview — every line labeled.** Non-technical readers need explicit labels, not symbol-only lines. At minimum the preview must show, on their own lines:
- `Property:` — full address
- `Deal type:` — Sale / Lease / Referral
- `Sale price:` — dollar amount + currency (what the property sold for)
- `Sale commission:` — percent of sale **and** the dollar amount it produces (e.g. `4.00% of sale = $20,000.00`)
- (DUAL only) `Listing commission:` — same dual form
- `Who gets what:` — per-participant rows with dollar amount + effective % of the pot
- `Total:` — reconciled totals row with `✓ adds up`
- `Commission paid by:` — the payer participant

Never compress these into a single line like `Sale · $20k · USD`. A user who doesn't already know the tool can't parse that.

**G5. Post-write verification — dedicated tool.** Immediately after `set_commission_splits` succeeds, the agent **must** call `verify_draft_splits` (which fetches the draft and diffs committed vs. sent using `src/math/verifySplits.ts`). Any drift — missing participant, extra participant, or mismatched percent — returns `ok:false` with the specific diff. The agent stops the flow, translates the error, and does **not** return a "success" URL. The verification is code, not LLM judgment.

**G6. Audit log.** Every confirmed draft is appended to `memory/active-drafts.md` with: timestamp, env, builderId, gross, every participant's name + percent + dollars, and the exact user confirmation token. Local-only, never pushed, user-readable plaintext.

**G7. Sanity rail — no silent rounding.** If the computed split cannot sum to exactly 100.00 (e.g. the prompt's numbers are internally contradictory, or the ratios produce a repeating decimal beyond 2dp), the agent stops and asks via `AskUserQuestion`. It must **not** silently round to force a fit. Acceptable remedies: ask the user to adjust one percentage, or explicitly ask whether to round up vs. down (with explicit options showing which participant absorbs the cent).

**Clean-sum short-circuit**: if the raw percentages already sum to exactly `100.00` (e.g. "me 50 / him 30 / referral 20" = 100), skip the ACK gate (G2) — go straight to the final preview. The dual reconciliation (G3), raw JSON preview (G4), post-write verification (G5), and audit log (G6) still apply.

**Other commission rules worth knowing**:

- `saleCommission` and `listingCommission` (on `PriceAndDateInfoRequest`) are expressed as **amount OR percent** via `CommissionFractionalPercent{commissionAmount?, commissionPercent?, percentEnabled}`. Exactly one of the two is populated based on `percentEnabled`.
- Amount-based commissions are subtracted from gross **first**; percent commissions then apply to the remainder (`DualRepresentationAgentCommissionValidation.getAgentParticipantsForValidation`).
- **Single-rep**: if some agents have explicit percents and others don't, arrakis's convention is that the undefined agents share `(100 − sum_of_defined)` equally. The MCP writes every participant explicitly, so we always define.
- **Dual-rep**: splits are computed per-side (BUYERS_AGENT + SELLERS_AGENT separately); at least one agent must have a positive commission on both sides; per-side amount sum ≤ that side's commission (tolerance 0.10 money units); `listingCommission` becomes mandatory.

## Referrals

- **Max one non-opcity referral** per draft. arrakis throws `ONE_REF_AGENT_ERROR` on a second.
- **Internal referral**: `type=AGENT`, `role=REFERRING_AGENT`, needs `agentId` (resolved via `search_agent_by_name`). No EIN/W9.
- **External referral**: `type=EXTERNAL_ENTITY`, `role=REFERRING_AGENT`, needs `companyName` (outside brokerage), `firstName/lastName`, `email`, `phoneNumber`, `address`, `ein`; optional `vendorDirectoryId`; W9 file via `upload_referral_w9` (separate multipart call).
- When `search_agent_by_name` returns zero candidates for a referral, ask "Is {name} at an outside brokerage?" before switching to the external flow.

## Co-agents & the "other-side" agent

- **Single-rep, other side is represented**: create an `OTHER_AGENT` participant via `add_other_side_agent` — needs brokerage name (as `companyName`), first/last, email, phone, address, EIN (US), W9 file.
- **Single-rep, other side unrepresented**: skip entirely.
- **Dual-rep**: every co-agent is registered **twice** via `add_co_agent` — once as `BUYERS_AGENT`, once as `SELLERS_AGENT`. This is what keeps `DualRepresentationAgentCommissionValidation` happy. The `add_partner_agent` convenience tool handles this automatically when `side=DUAL`.

## Commission payer

Payer is a participant (created via `add_commission_payer_participant`), then pointed at by `set_commission_payer{participantId, role}`.

| Country | Deal | Default payer |
|---|---|---|
| US | SALE | `TITLE` |
| Canada | SALE | `SELLERS_LAWYER` (also create `BUYERS_LAWYER`) |
| Any | LEASE | `LANDLORD` / `TENANT` / `MANAGEMENT_COMPANY` — ask |
| Other | — | Ask from `CommissionPayerDisplay` enum |

`VALID_CD_PAYER_ROLES` = `{TITLE, SELLERS_LAWYER, OTHER_AGENT}`.

## Mandatory "no-op" calls

These must be invoked even when nothing changes, or the draft won't be submittable. `finalize_draft` fires them in order:

- `set_opcity(opcity=false)` — finalizes the participant list before commission splits. Without this call, the splits call can silently drop participants.
- `update_personal_deal_info({personalDeal: false, representedByAgent: true})` — both fields `@NotNull`.
- `update_additional_fees_info({hasAdditionalFees: false, additionalFeesParticipantInfos: []})` — when there are no extra fees.
- `update_title_info({useRealTitle: false})` — when the user isn't using Real Title (setting `true` requires full `titleContactInfo` + `manualOrderPlaced`).

## Submit preconditions (mirrored client-side before returning the URL)

From `TransactionBuilder.validate()` (arrakis-core, line 639):

- `salePrice > 0`
- `ownerAgent.agentId` present
- owner agent list non-empty
- owner agent `officeId` present

The MCP checks these client-side before returning the bolt URL so the user doesn't open a broken draft.

## Draft URL

`https://bolt.{env}realbrokerage.com/transactions/create/{builderId}` — verify on the first real run against each env; update here if bolt uses a different path.
