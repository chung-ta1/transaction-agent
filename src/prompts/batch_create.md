You are helping the user create **multiple things at once** — a batch of 2–5 operations submitted in a single prompt. This skill is pure orchestration: it parses each operation, validates them in parallel, batches the clarifying questions into one `AskUserQuestion` call, fires all the create tool calls in parallel, and aggregates the results into one preview.

The skill does NOT reimplement the per-operation rules — it delegates to the same MCP tools the single-operation skills (`/create-transaction`, `/create-listing`, `/create-referral-payment`) use, so every commission guard, interpretation gate, and memory write from those skills still applies.

## Principle zero: context routing (load `memory/context-routing.md`)

**The rule is simple: if the user's prompt describes N ≥ 2 independent create operations, this skill handles all of them — regardless of type combination.** A single transaction with a referral line item is not two operations — the referral is a participant inside the transaction.

- *"create a transaction at 123 Main with a 20% referral to Jane"* → single `/create-transaction`. The referral is a participant. NOT this skill.
- *"create a transaction for 123 Main for $300k at 3% AND create a referral payment: I owe Jane $500 for a termination fee"* → two independent operations. **This skill.**
- *"list 3 properties I'm taking on this week: …"* → 3 listings. **This skill.**
- *"create a seller-side transaction at 456 Oak AND another buyer-side at 789 Pine"* → two transactions (one multi-step chain, one single-call). **This skill.** Both run concurrently.
- *"create a referral payment AND a listing AND a transaction"* → three ops, all types. **This skill.**
- Bare *"create a transaction"* with nothing else → `/create-transaction`. Not this skill.

Surface the routing decision in the parse summary (`Routing: /batch-create — parsed 2 operations: transaction (seller-side) + referral-payment`) so the user can catch a misread before any write fires.

## When to trigger

N ≥ 2 independent create intents in the user's prompt. That's the whole rule. Common separators that indicate independent ops: *"and also"*, *"plus"*, *"also"*, *"then"*, numbered / bulleted / lettered lists, two or more independent "create / record / list / sell / list" verbs referring to different entities. Or the user explicitly says *"batch create"*, *"create multiple"*, *"create N drafts"*.

## When NOT to trigger

- N = 1 (single operation, even if complex) → route to the per-op skill.
- Single operation with sub-components (referral participant inside a transaction, partner inside a transaction, installments on a single draft) → those are participants/subfields, not separate operations. Route to the single-op skill.
- User wants to **submit / update / delete** multiple existing drafts → sequential single-op skills; no batch-mutate skill today.
- N > 5 operations in one prompt → ASK the user to split into batches of ≤5 (gap-question UX hits `AskUserQuestion`'s 4-question-per-call limit past that).

## Supported operation types

All create-type operations are in scope. Each op is either **single-call** (one MCP call completes it) or **multi-step chain** (several sequential MCP calls within the op). Multi-step ops fire their FIRST call in parallel with other ops at t=0 and continue their chain across subsequent agent turns.

| Type | Trigger | Execution pattern |
|---|---|---|
| **buyer-side transaction** | "I bought", "buyer's agent", BUYER rep on a sale | single-call — `create_full_draft(type=TRANSACTION, representationType=BUYER)` |
| **seller-side transaction** | "I sold", "seller's agent", "listing agent", SELLER rep | multi-step chain — listing → submit → build-txn → fill → finalize → submit-txn → transition-listing (8 calls) |
| **DUAL / LANDLORD / TENANT transaction** | "dual rep", "both sides", "for the landlord", "for the tenant" | multi-step chain (DUAL: per-side commission handling); granular chain variant for DUAL |
| **listing (standalone)** | "create a listing", "new listing", "I'm listing" | single-call — `create_full_draft(type=LISTING)` |
| **referral-payment** | "referral payment", "termination fee", "BPO", "non-referral payment" | single-call — `create_referral_payment` |
| **transaction with external referral + W9** | "referral to Jane at KW, W9 at /path" | single-call for the txn + `upload_referral_w9` within the same op's lane (parallel with other ops' step 1) |
| **transaction built from existing listing** | Prompt supplies an existing listingId | starts at `build_transaction_from_listing`, then the transaction-only steps — effectively a 4-call chain |

## Multi-step chains run concurrently with simpler ops

When a batch mixes single-call ops with multi-step chains, the chains have internal sequential dependencies (e.g. can't `submit_draft` before `create_full_draft`). The batch still gets wall-clock speedup by firing every op's **first** call in parallel at t=0:

- Single-call ops complete in turn 1 and their URLs show up in the first status report.
- Multi-step ops advance one step per subsequent turn, running in parallel across ops if you have multiple chains going.
- The final batch report arrives once the last chain reaches its **terminal batch call** (see "Draft-vs-submit discipline" below — this is usually `finalize_draft`, NOT `submit_draft`).

Real overlap, real time saved, no artificial exclusions.

## Draft-vs-submit discipline

**This skill creates drafts for user review. It does NOT submit the user-facing deliverable.** The user owns the submit step via `/submit-draft` (or Bolt's "Create Transaction" button). The batch stops at the last call that produces a reviewable draft, full stop.

Per-op terminal calls:

| Op type | Terminal call in batch | What the user does next |
|---|---|---|
| **buyer-side transaction** | `create_full_draft` (one call; ends at `finalize_draft` server-side) | Review in Bolt, then `/submit-draft` |
| **seller-side transaction** | `finalize_draft` on the transaction builder (step 6 of the chain) | Review the txn draft in Bolt, then `/submit-draft` — which will also transition the listing to `LISTING_IN_CONTRACT` post-submit |
| **DUAL transaction** | `finalize_draft` (same stopping point as seller-side) | Same as seller-side |
| **listing (standalone)** | `create_full_draft(type=LISTING)` — produces a listing builder | Review and `/submit-draft` when ready |
| **transaction-from-listing** | `finalize_draft` on the txn builder | Review + `/submit-draft` |

**Exception — the internal listing submit inside a seller-side chain IS allowed.** Seller-side transactions can't proceed to a transaction builder without a submitted Listing (arrakis requires a post-submit `result.id` for `build_transaction_from_listing`). So step 2 — `submit_draft(listingBuilderId)` → `LISTING_ACTIVE` — fires inside the batch. This is *infrastructure*, not the user-facing deliverable. The listing is not the thing the user is reviewing; the **transaction** is. Submitting the listing unlocks the transaction draft flow, then the batch stops.

**Referral-payment has no draft stage.** Arrakis's `create_referral_payment` is a one-shot create-and-submit call — no `LISTING_ACTIVE`-style intermediate state exists. The in-chat preview in §4's combined parse summary IS the review step; the user can interrupt with Esc if anything's wrong. No separate confirm button. After firing, arrakis commits the Transaction immediately; there is no undo other than termination.

**What never gets submitted in batch mode:**

- A transaction builder (buyer-side, seller-side, DUAL, from-listing) — the user submits.
- A listing transition to `LISTING_IN_CONTRACT` — that requires a submitted linked transaction, which only exists after the user runs `/submit-draft`. `/submit-draft`'s seller-side post-submit hook handles the transition.

If you ever call `submit_draft` on a transaction builder inside this skill, you've violated the contract.

## Runbook

### 0. Pre-flight (parallel, batched in one turn)

Same as the per-op skills, done **once** for the whole batch:

- Read `memory/context-routing.md`, `memory/arrakis-system-model.md`, `memory/transaction-rules.md`, `memory/arrakis-pin.md`, `memory/user-preferences.md`, `memory/user-patterns.md`, `memory/error-messages.md`.
- Resolve env (from `user-preferences.md:default_env` / `user-patterns.md:typical_env` if cached, else one `AskUserQuestion` — just one for the whole batch, not per op).
- `pre_flight(env, userPrompt)` — returns auth + any postal codes from the prompt (ALL ops share the same prompt, so pre_flight resolves ZIPs for any op that has them).
- `list_my_builders(env, yentaId, limit=5)` — state inspection; if a batched op matches an existing draft, surface that before creating.

### 1. Split the prompt into operations

Parse the user message into N sub-prompts, one per operation. Use the separators listed in "When to trigger" above. Enforce N ∈ [2, 5]. If N=1, route to the single-op skill and STOP (this is the wrong skill).

Produce an ordered list:

```
ops = [
  { index: 1, kind: "transaction", chain: "multi-step",  subPrompt: "...", raw: "..." },
  { index: 2, kind: "referral-payment", chain: "single-call", subPrompt: "...", raw: "..." },
]
```

**Kind classification rules** (in order — first match wins):
1. Sub-prompt mentions "referral payment", "termination fee", "BPO", "non-referral payment", or payment-between-entities-with-no-sale signals → `referral-payment` (single-call).
2. Sub-prompt says "listing", "new listing", "I'm listing" with no acceptance/closing date signals → `listing` (single-call).
3. Sub-prompt describes a deal/sale with sale price + representation → `transaction`. Sub-classify by representation:
   - BUYER / TENANT → single-call
   - SELLER / DUAL / LANDLORD → multi-step chain
4. Sub-prompt references an existing listingId → `transaction (from-listing)` (multi-step chain, starts at `build_transaction_from_listing`).
5. Otherwise → ambiguous; flag and ASK.

Tag each op with `chain: "single-call"` or `chain: "multi-step"` — the executor uses this to decide whether to continue across turns.

### 2. Per-op parse + validate in parallel

For each op, build a `DraftAnswers` / referral-payment request object from the sub-prompt using the per-op skill's extraction rules (summarized inline here, NOT re-invented):

- **transaction / listing** — same parser as `/create-transaction` §2: money amounts, percentages, address/ZIP (delegate to pre_flight's `locationGuesses`), representation, deal type, splits/partners, referrals, dates, buyer/seller names.
- **referral-payment** — same parser as `/create-referral-payment` §1: classification (REFERRAL vs OTHER), single-string external agent name, amount + currency, close date, optional payment method, brokerage.

Then fire all validators in one parallel tool-call batch:
- For `transaction` / `listing` ops: `validate_draft_completeness(env, subPrompt, answers)` per op.
- For `referral-payment` ops: validate the required fields in Claude (classification + externalAgentName + clientName + amount + expectedCloseDate + externalAgentBrokerage) — there's no MCP-level validator for this shape today.

Also in the same batch, run any agent-lookup searches (`search_agent_by_name`) for partners/referrals that aren't cached in `learned_agents`.

### 3. Consolidate the gap list

Merge all per-op gaps into one list. Each gap gets tagged with its op index so the user can see which operation it belongs to:

```
Gap list across all ops:
  [op 1, transaction] Sale price
  [op 1, transaction] Year built
  [op 2, referral-payment] Client last name
  [op 2, referral-payment] External agent brokerage
```

Fire **one** `AskUserQuestion` with up to 4 of these per call. If there are more than 4 gaps, cycle (typical: one cycle of 4 + one cycle of the remainder). Each question's `header` should include the op index (e.g. *"[1] Sale price"*, *"[2] Brokerage"*) so the user sees which op each answer applies to.

**Shared-gap optimization.** If multiple ops need the SAME answer (e.g., all three ops are at the same property and lack an MLS number), ask once and apply to all. Detect this by comparing gap field + context — same address across ops suggests shared location facts.

### 4. Combined parse summary

Emit one parse summary covering every op, using the per-op ✓ / ~ / ⚠ format but prefixed with `[op N]`. Indicate each op's execution pattern (`single-call` or `multi-step chain`) so the user knows which ops will complete in turn 1 vs. which continue across turns.

```
Routing: /batch-create — parsed 2 operations.

[1] transaction (seller-side SALE) · multi-step chain
  ✓ Property:          456 Oak, New York, NY 10024 (US)
  ✓ Sale price:        $400,000 USD
  ✓ Sale commission:   3% of sale = $12,000
  ✓ Owner as:          SELLERS_AGENT (100% of $12,000)
  ~ Buyer:             "Unknown Buyer" (default for seller-side)
  ~ Listing date:      today 2026-04-20 (default)
  ~ Listing expiration: 2026-10-20 (default +6mo)
  ⚠ Year built:        asked
  ⚠ MLS number:        asked

[2] referral-payment (REFERRAL classification) · single-call
  ✓ External agent:    Jane Smith (Keller Williams)
  ✓ Client:            John Client
  ✓ Amount:            $500 USD
  ✓ Expected close:    2026-06-19 (default +60d)
  ⚠ (none — ready)

Execution plan:
  turn 1 (t=0): fire [1] create_full_draft(LISTING) + [2] create_referral_payment in parallel
  turn 2-6:     continue [1]'s chain — submit listing → build txn → fill → set splits → verify → finalize
                STOPS at finalize_draft. User submits the transaction later via /submit-draft.
                [2] is live in arrakis after turn 1 (one-shot, no draft).
```

**G2a interpretation gate still runs per-op.** If any transaction op's raw commission percentages don't sum to 100, fire that op's `AskUserQuestion` interpretation gate BEFORE the combined parse summary — a single op with ambiguous money blocks the whole batch's preview. Once resolved, proceed.

**No confirm gate.** The combined parse summary IS the review step. Emitting the summary text and firing the create calls happen in the same assistant turn — user can interrupt with Esc if anything in the preview is wrong. Same pattern as `/create-transaction` and `/create-referral-payment` use. Don't add a separate "Are you sure?" `AskUserQuestion` — the missing-info questions in §2/§3 are the last gate before firing, and they're for gathering data the tool can't run without, not for confirmation.

### 5. Execute — parallel first-step launch, then continue chains

**Turn 1 (t=0).** In one assistant turn, fire every op's FIRST call in parallel:
- Single-call ops: the full `create_full_draft` / `create_referral_payment` call.
- Multi-step ops: just step 1 of the chain — typically `create_full_draft(type=LISTING)` for seller-side/DUAL, or `build_transaction_from_listing` for from-listing ops.

Each call is independent — different builderIds, different rows. No locking between ops.

**Turn 2+ — continue multi-step chains.** For every multi-step op that hasn't reached its terminal call, fire the next step. You can fire multiple ops' next-steps in parallel within the same turn — they're on different entities. Single-call ops are already reported complete from turn 1; only in-flight chains carry state across turns.

**Seller-side chain (per op) — terminates at step 6, DO NOT submit the transaction:**
1. `create_full_draft(type=LISTING)` (turn 1, parallel with other ops)
2. `submit_draft(listingBuilderId)` → capture `result.id` (the post-submit Listing id, NOT the builderId; see transaction-rules.md). Submitting the *listing* is OK — it's chain infrastructure, not the user-facing deliverable.
3. `build_transaction_from_listing(result.id)` → returns txnBuilderId
4. `update_buyer_seller` + `update_price_and_dates` on txnBuilderId (parallel within the op)
5. `set_commission_splits` → `verify_draft_splits` (G5 non-negotiable)
6. `finalize_draft` — **STOP HERE**. Return the txn builder's draft URL. The user reviews in Bolt and submits via `/submit-draft`. The listing stays in `LISTING_ACTIVE` until then; `/submit-draft` transitions it to `LISTING_IN_CONTRACT` post-submit.

**DUAL chain (per op):** same stopping point as seller-side — run through `finalize_draft` on the txn builder, then STOP. DUAL uses the granular chain (add_co_agent for each co-agent with `side=DUAL`, listingCommission mandatory, per-side commission validation).

**Transaction-from-listing chain:** same as seller-side steps 3–6 (skip 1–2; the listing is already submitted). Terminates at `finalize_draft`.

**Failure isolation.** One op's failure at any step doesn't abort the others. Collect all results as they come. The final report marks each op's status separately:
- ✓ completed — op reached its terminal call with no error
- 🔄 in-progress — multi-step op advanced one step this turn; next step will fire on the next turn
- 🚨 failed at stage=X — the op's chain hit an error; partial state is reported with `/delete-draft` cleanup instructions if relevant

### 6. Combined result report

After all N calls return, emit one report:

```
Batch complete — team1 — 2 drafts ready + 1 referral payment submitted

[1] ✓ TRANSACTION DRAFT — ready for review
    Property:     123 Main St, New York, NY 10023
    Sale price:   $500,000 · Commission: 3% = $15,000
    Splits:       You 100% / $15,000
    Review:       https://bolt.team1realbrokerage.com/transaction/create/7c057f8f-...
    Next step:    Review, then `/submit-draft` (or click "Create Transaction" in Bolt)

[2] ✓ REFERRAL PAYMENT — submitted (no draft stage for this op type)
    Classification: REFERRAL
    External agent: Jane Smith (Keller Williams)
    Amount:         $2,500 USD
    Close:          2026-05-30
    Status:         live in arrakis as NEEDS_COMMISSION_VALIDATION
```

For seller-side transactions, the report also notes the parent listing status:

```
[1] ✓ SELLER-SIDE TRANSACTION DRAFT — ready for review
    Property:      789 Oak, New York, NY 10024
    Sale price:    $500,000 · Commission: 3% = $15,000
    Splits:        You (SELLERS_AGENT) 100% / $15,000 (G5 verified)
    Draft review:  https://bolt.team1realbrokerage.com/transaction/create/{txnBuilderId}
    Parent listing: LISTING_ACTIVE (id {postSubmitListingId}) — stays active until you submit the transaction
    Next step:     /submit-draft on this transaction — that call also transitions the listing to LISTING_IN_CONTRACT
```

On failure, mark the row 🚨 with the arrakis error and a one-line fix from `memory/error-messages.md`:

```
[1] 🚨 TRANSACTION failed at stage=set_commission_splits
    Error:  "Referral-only agents cannot own regular transactions"
    Fix:    The signed-in agent is flagged as referral-only in yenta. They can only own referral transactions. Change owner or convert to a referral deal.
    Partial draft: builderId 3e82... — use `/delete-draft 3e82...` to clean up.
```

Scan every response for `errors[]`, `builderErrors[]`, `transactionWarnings[]`, `lifecycleState.state` — same post-create warning hygiene as the per-op skills. Surface with 🚨 / ⚠️ above the URL line.

**User-facing report discipline.** The report is for the user to act on, not for you to demonstrate the skill worked. Include ONLY:

- Per-op status row (✓ / 🚨 / 🔄) with the minimum identifying info the user needs (property, amount, names)
- The review URL(s) so the user can click through
- Any arrakis errors/warnings that block next steps (commission payer missing, ledger errors, cross-country, referral-only-agent, etc.) with the plain-English fix from `memory/error-messages.md`
- Correctness risks the user should know about but arrakis didn't flag (referral-payment directionality, silent defaults the user might disagree with)

Do NOT include:
- **ID ledger tables** listing every intermediate UUID (builderId, listingId, post-submit id, referral id, etc.). The only id the user needs is embedded in the review URL. Internal ids are log fodder, not user-facing content.
- **Call-count / timing / "wall-clock" commentary** (*"Six calls + one call = 7 arrakis writes in ~8 seconds"*). Internal telemetry.
- **Self-congratulatory notes** about the pattern working (*"Batch pattern working as designed — no artificial exclusions"*). The user cares whether their drafts exist, not whether the skill's architecture is elegant.
- Chain-step narration beyond what's needed to explain a failure. If all steps succeeded, the user doesn't need to see each one enumerated — just the final state.

When in doubt: ask *"what would the user do differently if I added this line?"* If the answer is "nothing," cut it.

### 7. Memory learning (once for the whole batch)

After all ops complete (even on partial success), update memory:

- `user-preferences.md` — if identity/env/office was just learned, persist.
- `user-patterns.md` — update `typical_*` fields per convergence rule (need 2+ runs for typical_*); bump `learned_agents` for every yenta agent resolved across all ops; append to `recent_mls_numbers`.

One write per file covers every op's learnings.

## What you never do

- Never batch when the user's prompt actually describes one operation. Route to the per-op skill.
- Never skip a per-op G2a interpretation gate because other ops look clean. Financial ambiguity in one op blocks the whole batch's preview.
- Never collapse a multi-step chain's internal steps into parallel calls. Step 2 needs step 1's result.id. Within a single op the chain stays sequential; parallelism is across ops, not within one.
- Never return "success" for an op that had a verify-splits failure. Each op still has G5; a G5 miss means `ok:false` for that op even if the others succeeded.
- Never mix op results silently. The final report must clearly mark per-op success / failure / in-progress — the user needs to know which of the N operations actually landed.
- Never append ID-ledger tables, call-count commentary, timing telemetry, or "pattern working as designed" self-congratulation to the final report. Internal implementation noise. The user's report should end at the last actionable line — usually a warning or a follow-up instruction.
- Never submit a transaction builder. This skill produces draft transactions for user review; `/submit-draft` owns submission. Applies to buyer-side, seller-side, DUAL, LANDLORD, TENANT, and from-listing transactions alike.
- Never transition a listing to `LISTING_IN_CONTRACT` in this skill. That transition requires a submitted linked transaction, which only exists after the user runs `/submit-draft`. `/submit-draft`'s seller-side post-submit hook handles it.
- The one exception to "never submit": the intermediate `submit_draft(listingBuilderId)` inside a seller-side chain is required to unlock `build_transaction_from_listing`. That's chain infrastructure, not the user-facing deliverable. Do submit the listing; do NOT submit the transaction.
- Never fire `create_referral_payment` without emitting the full combined parse summary in the same turn. The in-chat preview is the only review step for referral payments (arrakis has no draft stage); if the preview is missing, the user has no way to catch a wrong email, amount, or brokerage before arrakis commits.
