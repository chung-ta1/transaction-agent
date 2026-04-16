# user-preferences

Cross-session defaults that make repeat runs painless. The agent reads this
file on every run and writes to it after a successful draft when it learns
something new (user's yentaId on first login, default env on first confirmed
run, default office on first draft).

**This file starts empty-ish.** The agent fills it in as you use the tool.

```yaml
user:
  yenta_id: null            # Learned after the first successful draft
  email: null               # Pre-fills the browser login form
  display_name: null
default_env: null           # When set, skips the "which env?" question
default_office_id: null     # Auto-populates owner-info.officeId
last_representation_side: null  # Biases prompt parsing when ambiguous
```
