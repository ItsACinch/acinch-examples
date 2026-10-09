# Webhook push

Push messages into ACinch from anything that can make an HTTP request: a monitor, a cron job, a shell script.
No OAuth and no token: an **incoming webhook URL** is the whole credential.

## Set up

1. In the developer portal, create an item type with the slug **`alert`** and paste [`item-type.json`](item-type.json):
   a card whose badge colour follows the `level` field.
2. In ACinch open *Admin, Apps* (workspace install) or *Settings, Apps* (personal install), find your app and choose
   *Incoming webhooks*. Name it, pick `alert` as the default type and choose who sees the items.
3. Copy the URL (`https://app.acinch.com/api/v1/hooks/acinch_hk_...`, shown once) into `ACINCH_HOOK_URL`.
   Anyone with the URL can push, so keep it secret; regenerate it in the same screen if it leaks.

## Run

```bash
node node/push.mjs "Disk 91% full on db-1" --level danger --source db-1 --key disk-db-1
# created disk-db-1
node node/push.mjs "Disk back to 60% on db-1" --level success --source db-1 --key disk-db-1
# updated disk-db-1
```

The same arguments work with `node typescript/push.ts` and `python python/push.py`.

The second push turns the same red card green instead of adding a second one, because both use the same `--key`
(sent as the `Idempotency-Key` header). Leave `--key` out and every push is a new card.

The same thing with curl:

```bash
curl -sS -X POST "$ACINCH_HOOK_URL" \
  -H "content-type: application/json" \
  -H "Idempotency-Key: disk-db-1" \
  -d '{ "title": "Disk 91% full on db-1", "fields": { "level": "danger", "source": "db-1" } }'
```

## What to notice

- The body is an item. `type` and `audience` default to the hook's settings; an `audience` you send may only
  narrow the hook's, never widen it.
- Items pushed through a hook live in their own ID space, so a leaked hook URL can never overwrite items your app
  pushed with its token.
