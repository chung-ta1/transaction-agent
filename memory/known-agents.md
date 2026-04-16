# known-agents

Name → yentaId cache for Real agents and external-entity details for outside
brokers. The agent checks this file before calling `search_agent_by_name` —
a cache hit less than 30 days old is used silently (and confirmed in the
preview). A miss or a stale entry triggers a fresh search.

**Starts empty.** The agent appends entries as you use names in prompts.

```yaml
agents: []
# Example entries the agent writes after a successful draft:
# - first_name: Tamir
#   last_name: Malchizadi
#   yenta_id: 00000000-0000-0000-0000-000000000000
#   brokerage: Real
#   added_at: 2026-04-16
# - first_name: Jason
#   last_name: Smith
#   external: true
#   brokerage: Smith Realty
#   address: 200 W. Broker St
#   ein: "00-0000000"
#   added_at: 2026-04-10
```

**Privacy note**: this file stays local to your machine. External-entity details
like EINs sit here plaintext — don't commit this file to a shared repo.
