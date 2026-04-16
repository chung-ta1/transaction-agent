# active-drafts

Append-only audit log of every draft the agent has created, with the exact
commission math the user confirmed. The agent writes one entry per successful
run. **Never modify past entries** — this is a receipt, not a cache.

Format: one YAML document per draft.

```yaml
# --- example (delete after first real run) ---
# - created_at: 2026-04-16T15:34:00Z
#   env: team1
#   builder_id: 8c4f00000000000000000000000000000000e1b3
#   draft_url: https://bolt.team1realbrokerage.com/transactions/create/8c4f…e1b3
#   gross_commission:
#     amount_cents: 2000000
#     currency: USD
#   participants:
#     - role: REFERRING_AGENT
#       display: Jason Smith (external, Smith Realty)
#       percent: "30.00"
#       amount_cents: 600000
#     - role: BUYERS_AGENT
#       display: You (owner)
#       percent: "42.00"
#       amount_cents: 840000
#     - role: BUYERS_AGENT
#       display: Tamir Malchizadi (partner)
#       percent: "28.00"
#       amount_cents: 560000
#   totals:
#     percent_sum: "100.00"
#     amount_cents_sum: 2000000
#   user_ack:
#     renormalized: true
#     raw_user_intent: "me 60% / Tamir 40% / Jason 30% referral"
#     confirmation_token: "confirm"
#   post_write_verification: passed
```

Entries the agent appends during live runs go below this line:

---
