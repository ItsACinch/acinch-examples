# ACinch example apps

Small, dependency-free apps that push items into [ACinch](https://acinch.com) with the developer platform API.
Each folder stands alone: copy the one you need.

| Example | What it shows | Auth |
|---|---|---|
| [`hello-world`](hello-world) | Get a token, push one item, run it again to update it | Client credentials |
| [`webhook-push`](webhook-push) | Push alerts from any script or monitor; one key per card, so a repeat updates it | Incoming webhook URL |
| [`approval-card`](approval-card) | A rich card with Approve / Reject buttons; your server receives the click as a signed event and updates the card | Client credentials + signed event webhooks |

Everything runs on **Node 18+** with no packages to install.

## Before you start

1. Create an app in the [developer portal](https://app.acinch.com/developers) and install it (for yourself or your workspace).
2. Create a **client secret** on the app's *Credentials* tab. Note the client ID, the secret (shown once) and the installation ID.
3. Each example declares one **item type**: its `item-type.json`. In the portal open your app, *Item types*, create a type with the slug the example names and paste the JSON.

Then copy `.env.example` to `.env`, fill it in and run an example with `node --env-file=.env <file>` (Node 20.6+), or export the variables yourself.

## Test

```bash
npm test
```

Runs every example against a small in-process stand-in for the API (no credentials, no network). The stand-in
checks only what the examples rely on; the real API validates much more.

## Documentation

- [Developer docs](https://app.acinch.com/developers/docs): quickstart, webhooks, templates, limits
- [Example apps](https://app.acinch.com/developers/docs/examples): a walkthrough of this repository

## License

[MIT](LICENSE)
