# error-messages

Lookup table for translating arrakis / yenta error strings into plain-English
fixes. When a tool call fails, the agent substrings the error against `match`
and surfaces the matching `fix` instead of the raw backend message. If no
entry matches, the agent shows the raw message **and** appends a stub to this
file so future runs can do better.

```yaml
- match: "ownerAgent's office can't be empty"
  fix: "Your agent profile is missing an office assignment. Ask your broker to set it in yenta, or pick a different env where it's already set."

- match: "Sale price must be greater than 0"
  fix: "The sale price in the prompt was zero or negative. Please re-state the price."

- match: "ownerAgent info can't be empty"
  fix: "The draft doesn't have an owner agent yet. Run set_owner_agent_info (or create_draft_with_essentials with ownerAgent set) before finalizing."

- match: "ownerAgent's id is missing"
  fix: "The owner agent was set but without a yentaId. Re-run set_owner_agent_info with the agent's yentaId."

- match: "For transactions, you must specify a list of buyers"
  fix: "Add at least one buyer (company name OR first + last name) before calling update_buyer_seller."

- match: "Address is required to update owner agent"
  fix: "Set the property address via update_location before set_owner_agent_info."

- match: "Agent already exists on referral"
  fix: "A referral has already been added. Remove the existing one via delete_referral before adding a new one."

- match: "Agent already exists on referral"
  fix: "arrakis only allows one non-opcity referral per draft. Remove the existing referral before adding a new one."

- match: "MISSING_DUAL_REPRESENTATION_COMMISSION"
  fix: "Dual rep requires at least one agent (usually you) with positive commission on BOTH BUYERS_AGENT and SELLERS_AGENT. Adjust the splits and try again."

- match: "DUAL_REPRESENTATION_SPLIT_TO_COMMISSION_CHECK"
  fix: "The per-side commission totals exceed what's available on that side of the deal. Lower the per-side amounts so they're ≤ that side's commission (0.10 tolerance)."

- match: "ONE_REF_AGENT_ERROR"
  fix: "arrakis only allows one non-opcity referral per draft. Remove the existing referral before adding a new one."

- match: "Sale Commission is necessary for Dual Representation"
  fix: "Set saleCommission on the draft (via update_price_and_dates) — required for DUAL rep."

- match: "Listing Commission is necessary for Dual Representation"
  fix: "Set listingCommission on the draft (via update_price_and_dates) — required for DUAL rep."

- match: "Year built is required in the USA"
  fix: "Add yearBuilt to update_location — arrakis requires it for US properties."

- match: "You cannot create a transaction in a country where your account is not registered"
  fix: "This property is in a different country than your agent profile. Pick a property in your country, or ask Real to enable cross-country rights on your account."

- match: "Property slug is not available"
  fix: "That propertySlug is taken. Try another or omit propertySlug to have arrakis generate one."

- match: "salePrice cannot be empty"
  fix: "Sale price is missing from update_price_and_dates. Add it and retry."

- match: "commissionSplitsInfo cannot be empty"
  fix: "No commission splits were written. Call set_commission_splits with the participant ids + percentages before finalize."

- match: "Commission document payer role must be one of"
  fix: "The commission-document payer role must be TITLE, SELLERS_LAWYER, or OTHER_AGENT (VALID_CD_PAYER_ROLES). Adjust add_commission_payer_participant."

- match: "Unauthorized"
  fix: "Your session expired. The MCP will reopen the browser to sign in again."
```
