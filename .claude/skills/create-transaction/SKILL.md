---
name: create-transaction
description: Create a Real Brokerage draft transaction from a plain-English prompt. Triggers when the user says "create a transaction", "new draft transaction", "build a transaction for me", "start a draft for ...", or similar phrasing that describes a real-estate deal (commission, agents, referral, address). Use this skill as the entry point — it delegates to the `transaction-creator` subagent which handles parsing, env selection, clarifying questions, commission math, preview + confirm, and the arrakis API calls.
---

# /create-transaction

Use the `transaction-creator` subagent to turn the user's prompt into a draft
transaction on arrakis. The subagent owns the full multi-turn flow: drift-check,
env selection, prompt parsing, clarifying questions (`AskUserQuestion`), commission
math with the financial-grade accuracy stack, preview + confirm gate, tool calls,
post-write verification, and returning the bolt URL.

## What this skill does (at a glance)

1. Delegates to the `transaction-creator` subagent with the user's prompt verbatim.
2. The subagent:
   - Reads `memory/user-preferences.md`, `memory/known-agents.md`, `memory/transaction-rules.md`, `memory/arrakis-pin.md`, `memory/error-messages.md`.
   - Runs a throttled drift-check against `github.com/Realtyka/arrakis` and updates the rulebook if needed.
   - Asks for the env (or uses the stored default).
   - Parses the prompt, asks clarifying questions (batched up to 4 at a time).
   - Computes commission splits per the accuracy stack in `memory/transaction-rules.md`.
   - Fires a renormalization ACK (type-to-confirm) when applicable, then the final preview.
   - Executes the MCP tools (convenience-first), verifies post-write.
   - Returns the bolt URL + a summary.
3. Surfaces the subagent's final answer as the skill output.

## Usage

```
/create-transaction <english-prompt>
/create-transaction --env <team1|team2|team3|team4|team5|play|stage> <english-prompt>
```

## Inputs

- The user's raw prompt (anything that describes a transaction).
- Optional `--env <env>` flag overrides `memory/user-preferences.md:default_env` for this run only.

## Tools available to the subagent

- All MCP tools under `mcpServers.transaction-builder` (22 granular + 4 convenience).
- `AskUserQuestion` for every ambiguity.
- Read/Write access to `memory/*.md`.

## Output

A markdown message with every line labeled (no symbol-only shorthand):

- **Property** — full address.
- **Deal type** — Sale / Lease / Referral.
- **Sale price** — what the property sold for, with currency.
- **Sale commission** — shown as a percentage of sale AND the dollar amount it produces (e.g. `4.00% of sale = $20,000.00`).
- **Who gets what** — each participant's label, dollar amount, and effective % of the full commission pot.
- **Total row** — `100.00%` / full pot / `✓ adds up` when reconciled.
- **Commission paid by** — the commission-payer participant.
- **`draftUrl`** — clickable link to review + submit in Real (bolt).
- Any warnings flagged by the post-write verification.
