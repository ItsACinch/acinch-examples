# Hello world

The smallest ACinch app: trade your app's credentials for a token, then `PUT` one item.

## Set up

1. In the developer portal, create an item type with the slug **`hello`** and paste [`item-type.json`](item-type.json)
   (a plain card: title and body, nothing else).
2. Set `ACINCH_CLIENT_ID`, `ACINCH_CLIENT_SECRET` and `ACINCH_INSTALLATION_ID` (see the [top-level README](../README.md)).

## Run

```bash
node hello.mjs
# created hello-world
node hello.mjs
# updated hello-world
```

A "Hello, world!" card appears in your ACinch feed. Run it again and the same card updates: the item ID
(`hello-world`) is yours, so `PUT /api/v1/items/hello-world` creates it the first time (201) and replaces it after (200).

## What to notice

- **One token per installation.** `POST /oauth/token` with `grant_type=client_credentials` and the `installation_id`
  returns a bearer token valid for an hour. Reuse it rather than minting one per request
  (see [`approval-card/acinch.mjs`](../approval-card/acinch.mjs) for a cached client).
- **No audience means the installer.** Add `"audience": { "users": ["alex@example.com"] }` to show it to someone else
  in the workspace.
