# CLAUDE.md — in-repo guidance

This file is loaded by Claude Code when it opens the `transaction-agent` repo. It supplements the project's public README with the internal map a coding assistant needs.

## Project shape at a glance

```
transaction-agent/
├── .claude/
│   ├── settings.json                     # registers the MCP
│   ├── skills/
│   │   ├── create-transaction/SKILL.md
│   │   └── resync-arrakis-rules/SKILL.md
│   └── agents/
│       └── transaction-creator.md        # the specialized runbook
├── memory/                               # read + written by the agent
│   ├── transaction-rules.md              # arrakis rulebook + accuracy stack
│   ├── arrakis-pin.md                    # drift-check pin
│   ├── user-preferences.md               # per-user smart defaults
│   ├── known-agents.md                   # name → yentaId cache
│   ├── error-messages.md                 # arrakis error → plain-English fix
│   └── active-drafts.md                  # append-only audit log
├── src/
│   ├── index.ts                          # stdio bootstrap
│   ├── server.ts                         # MCP tool registry
│   ├── config.ts                         # env → URL + prod block
│   ├── auth/                             # browser login + token cache
│   ├── services/                         # arrakis + yenta axios clients
│   ├── tools/
│   │   ├── granular/                     # 22 tools, one per arrakis endpoint
│   │   ├── convenience/                  # 4 batched happy-path tools
│   │   ├── Tool.ts                       # common types + result shape
│   │   └── index.ts                      # combined registry (convenience first)
│   ├── types/
│   │   ├── enums.ts                      # mirrors arrakis enums
│   │   └── schemas.ts                    # zod schemas per tool input
│   └── openapi/{arrakis,keymaker,yenta}  # generated clients (run `npm run generate`)
├── test/                                 # vitest
├── package.json, tsconfig.json, openapitools.json
├── Dockerfile, docker-compose.yml
└── .github/workflows/{build,drift-sync}.yml
```

## Where to add things

- **New arrakis endpoint** (e.g., arrakis adds `/{id}/flex-team`): add a method to `src/services/TransactionBuilderApi.ts`, add a granular tool in `src/tools/granular/`, register it in `src/tools/granular/index.ts`. The agent will pick it up automatically via the tools registry.
- **New convenience composition**: add a file in `src/tools/convenience/`, register in `src/tools/convenience/index.ts`. Convenience tools are thin wrappers around the granular ones + arrakis endpoints directly.
- **New edge case to capture** (e.g., arrakis adds a new required field in DUAL rep): edit `memory/transaction-rules.md`. The agent loads it on every run.
- **New error → fix mapping**: edit `memory/error-messages.md`. The agent also appends new stubs on unmapped errors automatically.
- **New env-wide rule** (e.g., a new env `team6`): add to `SUPPORTED_ENVS` in `src/config.ts`, update the env enum in `src/types/schemas.ts:envSchema`.

## Conventions

- **TypeScript, ESM, Node ≥18.** No CommonJS. Imports end with `.js` (Node 16 module resolution).
- **Zod first.** Every tool input runs through zod; invalid LLM output becomes a structured error, never a malformed HTTP call.
- **Money as integer cents.** Never JS floats for dollar amounts. Decimal strings at the JSON boundary, integer math in between.
- **Axios with `validateStatus: () => true`.** HTTP status branches happen in `BaseApi.request`, not in axios's try/catch.
- **No direct Anthropic SDK use.** All LLM reasoning lives in the Claude Code agent (`.claude/agents/transaction-creator.md`). The MCP server is mechanical.
- **Prod block (`therealbrokerage.com`) is enforced in `src/config.ts` before any HTTP call.** Don't add a bypass.

## When arrakis changes

Two layers catch drift:

1. **Memory drift-check** (throttled 24h, runs on every `/create-transaction`): compares `memory/arrakis-pin.md:last-synced-sha` against `github.com/Realtyka/arrakis` default branch. On drift in watched paths, updates `memory/transaction-rules.md` (tagged bullets only) and advances the pin.
2. **OpenAPI codegen** (`npm run generate`): pulls types from arrakis stage's live spec. Schema drift = TypeScript compile error. Nightly CI opens a `arrakis-drift` PR automatically.

## Testing

- `npm test` → unit + scenario tests against mocked HTTP.
- `npm run test:contract` → opt-in hits team1 for a real round-trip; requires being on the Real VPN + a valid user session.

## Financial-grade accuracy stack

Read `memory/transaction-rules.md` → "Financial-grade accuracy stack". Seven guards (G1–G7) apply to commission math. If you're touching `src/tools/convenience/finalize_draft.ts`, `src/tools/granular/commission.ts`, or anything in the agent runbook that writes splits — **don't weaken a guard**. Discuss in a PR first.

## Reuse notes

- Structurally modeled on [Realtyka/rezen-mcp](https://github.com/Realtyka/rezen-mcp): same SDK, axios, dotenv, `bin` via `dist/index.js`, stdio transport.
- **NOT** reused: `@faker-js/faker` autofill (rezen-mcp fabricates data for tests; we take real data from users). Fixed `REZEN_BASE_URL` (we take `env` per tool call so the agent can switch mid-session).
