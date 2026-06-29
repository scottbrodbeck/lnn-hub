# Edge Function Secrets

These are set as **Supabase Edge Function secrets** in the project we deploy to —
NOT in the frontend `.env` (those secrets would be exposed in the browser). Set them
with the dashboard (Project → Edge Functions → Secrets) or the CLI:

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-... SLACK_BOT_TOKEN=xoxb-...
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically by the platform — you don't set those by hand.

> Status note: this list reflects the de-Lovable migration. Items marked **NEW** were
> introduced when we repointed functions off the Lovable gateways.

## AI (Claude) — NEW
| Secret | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Key from the Anthropic console. Used by `generate-social-posts`, `generate-post-interview`, `review-post`, `analyze-subject-line` (via `_shared/claude.ts`). |
| `ANTHROPIC_MODEL` | optional | Defaults to `claude-sonnet-4-6`. Set to override the model for all AI functions. |

## Slack — NEW
| Secret | Required | Notes |
|---|---|---|
| `SLACK_BOT_TOKEN` | ✅ | Slack **bot** token (`xoxb-…`). Scopes: `chat:write`, `channels:read`, `groups:read`, `channels:join`. Used by `slack-notify`, `slack-list-channels`. (Replaces the old `SLACK_API_KEY` + `LOVABLE_API_KEY` gateway pair.) |

## HubSpot
| Secret | Required | Notes |
|---|---|---|
| `HUBSPOT_API_KEY` | ✅ | Now a HubSpot **Private App access token** (`pat-…`), sent as `Authorization: Bearer`. Scopes: CRM read/write for contacts, companies, deals, engagements, owners, pipelines, products + associations. Used by all `crm-hubspot-*`, `hubspot-diagnostics` (via `_shared/hubspot.ts` + 3 inline copies). (No longer needs `LOVABLE_API_KEY`.) |

## Auth / email
| Secret | Required | Notes |
|---|---|---|
| `SITE_URL` | ✅ | Canonical app URL for magic-link + notification links, e.g. `https://client.lnn.co` (staging: `https://staging.lnn.co`). Fallback in code is `https://client.lnn.co`. Used by `send-custom-otp`, `broadstreet-api`. |
| `SENDGRID_API_KEY` | ✅ | SendGrid key for transactional email (`send-custom-otp`, etc.). |
| `SEND_EMAIL_HOOK_SECRET` | ✅ | Supabase Auth `email-hook` verification secret. |

## Display ads (Broadstreet)
| Secret | Required | Notes |
|---|---|---|
| `BROADSTREET_ACCESS_TOKEN` | ✅ | Broadstreet API token. |
| `BROADSTREET_NETWORK_ID` | ✅ | Broadstreet network id. |

## Billing (QuickBooks / Intuit)
| Secret | Required | Notes |
|---|---|---|
| `QBO_CLIENT_ID` | ✅ | Intuit OAuth client id. |
| `QBO_CLIENT_SECRET` | ✅ | Intuit OAuth client secret. |
| `QBO_REFRESH_TOKEN` | ✅ | Long-lived QBO refresh token. |
| `QBO_REALM_ID` | ✅ | QBO company (realm) id. |
| `QBO_ENVIRONMENT` | ✅ | `sandbox` or `production`. |
| `QBO_CRON_SECRET` | ✅ | Shared secret guarding QBO cron endpoints. |

## Polls (Crowdsignal)
| Secret | Required | Notes |
|---|---|---|
| `CROWDSIGNAL_API_KEY` | ✅ | Crowdsignal API key. |
| `CROWDSIGNAL_USER_CODE` | ✅ | Crowdsignal user code. |
| `CROWDSIGNAL_FOLDER_ID` / `CROWDSIGNAL_PACK_ID` / `CROWDSIGNAL_STYLE_ID` | ✅ | Crowdsignal poll config ids. |

## MCP
| Secret | Required | Notes |
|---|---|---|
| `MCP_AUTH_TOKEN` | ✅ | Bearer token for the `mcp-server` edge function (Claude Connectors). |

## Lovable (being retired)
| Secret | Required | Notes |
|---|---|---|
| `LOVABLE_API_KEY` | ⚠️ legacy | Only still referenced by `seed-test-drafts` (AI image generation — **deferred**, see its header comment). Drop this once that function is repointed to a real image provider. Every production path is off Lovable. |

## Not secrets — stored in the database
- **Beehiiv** (`beehiiv_config`) and **Mailchimp** (`mailchimp_config`) credentials are stored
  per-site in the database, not as env secrets. They migrate with the data, so there is nothing
  to set here for them.
