---
name: resync-arrakis-rules
description: Force a full re-read of every watched arrakis path and rebuild memory/transaction-rules.md from scratch. Ignores the 24h drift-check throttle and the last-synced SHA. Use when the rulebook feels stale, after a long hiatus, or when the user knows arrakis changed and wants to refresh before creating a draft.
---

# /resync-arrakis-rules

Escape hatch for the memory-driven drift sync. Normally the
`transaction-creator` agent runs a throttled drift-check on every
`/create-transaction` invocation (once per 24 hours by default) and updates
`memory/transaction-rules.md` when watched paths have changed. This skill
ignores the throttle and rebuilds from scratch.

## What this skill does

1. Reads `memory/arrakis-pin.md` to get `watched-paths` and the default branch.
2. Fetches the full contents of every watched path at `HEAD` of the default branch via `gh api`.
3. Re-derives every section of `memory/transaction-rules.md` that has `<!-- auto:arrakis-pin:{sha} -->` tagged bullets, replacing stale content.
4. Leaves hand-written bullets (untagged) untouched.
5. Updates `memory/arrakis-pin.md` with the new `last-synced-sha`, `last-synced-at`, and `last-checked-at`.
6. Writes a short summary of what changed to the chat.

## Usage

```
/resync-arrakis-rules
```

No arguments. No user interaction unless a novel concept in the diff can't be
classified — then the skill falls back to `AskUserQuestion` for that specific
change only.

## When to use

- After an arrakis release the user knows about.
- After a long period of not running `/create-transaction`.
- When a previous run hit an unmapped error that hinted at behavior change.
- Before shipping a production draft, for peace of mind.
