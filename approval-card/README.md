# Approval card

A deploy approval that lives in ACinch. `request.mjs` puts a card in each approver's feed with **View changes**,
**Approve** and **Reject** buttons. A click on Approve or Reject is delivered to `server.mjs` as a signed
`item.action` event; the server checks the signature, then calls the API back to mark the card approved or rejected.

```
request.mjs ──PUT item──▶ ACinch ──card──▶ approver clicks Approve
                            │
                            └──signed item.action──▶ server.mjs ──GET + PUT item──▶ ACinch (card turns green)
```

## Set up

1. In the developer portal, create an item type with the slug **`approval`** and paste [`item-type.json`](item-type.json):
   five fields, a badge that follows `state` (pending / approved / rejected), one link action and two callback actions.
2. Install the app in your workspace and set `ACINCH_CLIENT_ID`, `ACINCH_CLIENT_SECRET` and `ACINCH_INSTALLATION_ID`.
3. Start the server and give it a public https URL. Locally, a tunnel works:
   ```bash
   node server.mjs                                   # listening on http://localhost:3000/acinch/events
   cloudflared tunnel --url http://localhost:3000    # or ngrok http 3000
   ```
4. In the portal set the app's **event endpoint URL** to `https://<tunnel host>/acinch/events`, create a
   **signing secret** (`acinch_ss_...`), put it in `ACINCH_SIGNING_SECRET` and restart the server.

## Run

```bash
APPROVERS=alex@example.com,sam@example.com node request.mjs checkout 2.4.0 https://github.com/acme/checkout/compare/v2.3.0...v2.4.0
# requested approval-checkout-2.4.0
```

Alex clicks **Approve**. The server logs `approval-checkout-2.4.0: approved by alex@example.com` and the card's badge
turns green with "Decided by alex@example.com". If Sam clicks **Reject** afterwards, nothing changes: the first
decision wins.

## What to notice

- **Verify before you trust.** [`verify.mjs`](verify.mjs) checks `ACinch-Signature` (HMAC-SHA256 over
  `<timestamp>.<raw body>`) and rejects anything older than five minutes. Verify the raw bytes, never re-serialized JSON.
- **Delivery is at-least-once.** The server remembers `ACinch-Event-Id`s it has handled and acknowledges duplicates
  without acting. It records an event only after handling succeeds, and answers 500 on failure so ACinch retries.
  The example keeps ids in memory; use your database in production.
- **The event says which installation.** `data.installation_id` picks the token ([`acinch.mjs`](acinch.mjs) caches
  one per installation), so the same server works for every workspace that installs your app.
- **`PUT` replaces the whole item.** The server reads the item first and sends everything back, including its
  audience and link, with the decision filled in.
- `installation.created` and `installation.deleted` arrive at the same endpoint; the server just logs them.
