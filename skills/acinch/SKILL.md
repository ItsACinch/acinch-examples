---
name: acinch
description: Build apps on the ACinch developer platform - push items (cards) into ACinch feeds with the REST API or an incoming webhook URL, design item types (card, html, builtin templates), add link and callback buttons, and receive signed event webhooks. Use when the user mentions ACinch, an ACinch app, pushing items or notifications to ACinch, an acinch_hk_ hook URL, acinch_ss_ signing secrets, ACinch-Signature, or item.action events.
---

# Building ACinch apps

ACinch is a collaboration hub: it shows *items* (cards) from many tools in people's feeds. An **app** pushes items
into the feeds of the people who **installed** it. Docs: `https://app.acinch.com/developers/docs`. Working examples in
Node, TypeScript and Python: `https://github.com/ItsACinch/acinch-examples` (hello-world, webhook-push, approval-card).

Base URL: `https://app.acinch.com` (keep it configurable as `ACINCH_BASE_URL`). Never hardcode credentials; read
`ACINCH_CLIENT_ID`, `ACINCH_CLIENT_SECRET`, `ACINCH_INSTALLATION_ID`, `ACINCH_HOOK_URL`, `ACINCH_SIGNING_SECRET`
from the environment.

## Choose the integration style

| The user wants | Use |
|---|---|
| A script, CI step or monitor to post messages; no server, no OAuth | **Incoming webhook URL** (`POST` the item to the URL) |
| An app that creates, updates, lists or deletes its items | **Client credentials** token + `/api/v1/items` |
| Buttons on a card that call the user's own code | Item type with `callback` actions + an **event endpoint** that verifies signatures |

## Setup the person does in the portal (you cannot do it through the API)

1. Create the app at `/developers` and install it (personal, or for a workspace by an owner/admin).
2. *Credentials* tab: create a client secret (shown once). Client ID + secret + installation ID are the API credentials.
3. *Item types* tab: declare every `type` slug the app pushes, with its JSON definition. **Pushing an undeclared type
   is rejected** (422, `not declared`). Write the definition into an `item-type.json` for them to paste.
4. Incoming webhooks: *Admin, Apps* (workspace install) or *Settings, Apps* (personal) → the app → *Incoming webhooks*.
   Pick a name, default type and default audience; the URL is shown once.
5. Event webhooks: *Settings* tab → event endpoint URL (public **https**); *Credentials* tab → create a signing
   secret (`acinch_ss_...`).

Tell the person which of these steps their code depends on.

## Token (client credentials)

```
POST /oauth/token
Authorization: Basic base64(client_id:client_secret)
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&installation_id=<uuid>
→ 200 { "access_token": "...", "token_type": "Bearer", "expires_in": 3600 }
```

- One token per **installation**. An app installed in several workspaces mints one per installation id.
- Cache it; renew ~60 s before `expires_in`. On a 401 from `/api/v1`, drop the token, mint a new one, retry once.
- The secret goes only in the Basic header; a `client_secret` form field is never read (401 `invalid_client`).

## Items API (Bearer token)

| Call | Does |
|---|---|
| `PUT /api/v1/items/{externalId}` | Create (201) or **fully replace** (200) the item with your ID |
| `GET /api/v1/items/{externalId}` | Read one (404 if absent) |
| `DELETE /api/v1/items/{externalId}` | Remove (204) |
| `GET /api/v1/items?limit=1..100&cursor=` | List; follow `next_cursor` until null |
| `POST /api/v1/items/batch` `{ "items": [{ "external_id": ..., ...item }] }` | Up to 100; one result per item: `{ external_id, status: created/updated/error, errors? }` |
| `GET /api/v1/installation` | The installation the token acts as |

`externalId`: 1-200 chars, URL-encode it; `batch` and anything starting `hook:` are reserved. Choose stable IDs from
the source system (`deploy-1042`, `ticket-88`) so retries update instead of duplicating.

Item body (unknown keys are rejected):

```jsonc
{
  "type": "deploy",                      // required on the API; lowercase slug declared in the portal
  "title": "Deploy api to production",   // required, <= 500 chars
  "body": "optional text, <= 20000 chars",
  "url": "https://...",                  // http(s)
  "occurred_at": "2026-10-09T14:03:11Z", // ISO with offset; defaults to now (bumps the item in feeds)
  "actor": { "name": "Alex", "email": "alex@example.com", "avatar_url": "https://..." },
  "status": "succeeded",                 // free text <= 40
  "fields": { "env": "production", "duration": 312, "ok": true, "note": null },
  "audience": { "users": ["alex@example.com"], "boards": ["<board uuid>"], "tenant": true }
}
```

- **PUT replaces everything.** To change one field, GET the item, then PUT it back complete. The GET shape has
  `null`s (`body`, `url`, `actor`) that must be **omitted**, not sent as null, and `audience` arrays that may be empty:
  send only the non-empty parts. Send the original `occurred_at` to avoid bumping it.
- **Audience:** no audience = the installer only. `users` are emails or user ids of active workspace members (<=100),
  `boards` are board uuids (<=20), `tenant: true` = whole workspace. A personal install can only address its installer.
- `fields` values are string, number, boolean or null and must match the field types declared in the item type.

## Incoming webhook URL

`POST <ACINCH_HOOK_URL>` with an item as the JSON body. No Authorization header: the URL is the credential (treat as
a secret; never commit it).

- `type` is optional (the hook's default type). `audience` may only **narrow** the hook's default (422 if wider).
- `Idempotency-Key: <1-200 chars>` (or `external_id` in the body) makes repeats update one item. Without either,
  every POST creates a new item. 201 created, 200 updated; response `external_id` is your key.
- Hook items are stored as `hook:<hookId>:<key>`: they appear in `GET /api/v1/items` but a token cannot address them.

## Event webhooks (callbacks)

ACinch POSTs JSON to the app's event endpoint:

```json
{ "id": "evt_...", "type": "item.action", "created_at": "...",
  "data": { "installation_id": "...", "external_id": "deploy-1042", "action_id": "rollback",
            "user": { "id": "...", "email": "alex@example.com" } } }
```

Types: `item.action` (someone clicked a `callback` action), `installation.created` (`installation_id`, `target_kind`),
`installation.deleted` (`installation_id`). Ignore unknown types and unknown fields.

Every receiver must:

1. **Verify the signature over the raw body bytes** before parsing. Header
   `ACinch-Signature: t=<unix seconds>,v1=<hex>` where `v1 = HMAC-SHA256(signing_secret, "<t>.<raw body>")`.
   Reject if malformed, if `|now - t| > 300`, or on mismatch (constant-time compare). Do not re-serialize JSON first
   (e.g. Express needs `express.raw({ type: 'application/json' })`).
2. **Dedupe on `ACinch-Event-Id`**: delivery is at-least-once. Record the id only after handling succeeds.
3. Answer **2xx** when done; any other status (or >10 s) is retried with exponential backoff, up to 12 attempts.
   The portal's *Deliveries* tab shows attempts and can redeliver.
4. Use `data.installation_id` to pick the token when calling the API back (e.g. PUT the item with the outcome).

Endpoints must be public https; for local development use a tunnel (`cloudflared tunnel --url http://localhost:3000`).

## Item types

Read [references/item-types.md](references/item-types.md) when writing an item type definition. Short version: `card`
(fields, subtitle, badge, detail fields, up to 3 actions) covers most needs; `html` is for custom markup with an
allowlist of classes; `builtin` maps onto ACinch's native task / issue / pull_request / file cards.

## Limits and errors

- Item <= 256 KB; batch <= 100 items and 4 MB; 600 items/minute and 20,000/day per installation (a batch of N costs N).
  429 carries `Retry-After` seconds: wait, then retry.
- `/api/v1` errors are `application/problem+json`: `{ "type": "about:blank", "title", "status", "detail"?, "errors"?: [{ "path", "message" }] }`.
  400 malformed body, 401 bad/expired token, 403 uninstalled/suspended/missing scope, 404 unknown item,
  413 too large, 422 well-formed but refused (`not declared`, field type `must be ...`, audience not a member).
- Token endpoint errors are OAuth style `{ "error": "invalid_client" | "invalid_grant" | ... }`.

## Checklist before you hand code over

- Credentials and hook URL come from env vars; `.env` is gitignored.
- Every `type` pushed has an `item-type.json` and the person knows to declare it.
- External IDs are stable, so re-runs update.
- Tokens are cached per installation and refreshed on 401.
- Event receivers verify the raw-body signature, dedupe by event id, and return non-2xx on failure.
- Updates GET then PUT the whole item, omitting nulls.
