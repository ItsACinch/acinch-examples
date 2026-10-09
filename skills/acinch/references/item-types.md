# Item type definitions

An item type is declared in the developer portal (*Item types* tab) with a lowercase slug (`^[a-z][a-z0-9_-]{0,39}$`)
and a JSON definition. Items keep the definition version they were pushed with: editing a type affects new pushes only.
The whole definition must be <= 32 KB. Pick one `render_mode`.

## card (recommended)

```json
{
  "render_mode": "card",
  "fields": [
    { "key": "env", "label": "Environment", "type": "text" },
    { "key": "version", "label": "Version", "type": "text" },
    { "key": "duration", "label": "Duration", "type": "duration" }
  ],
  "subtitle": "{{fields.env}} - v{{fields.version}}",
  "badge": { "field": "env", "tones": { "production": "danger", "staging": "info" } },
  "detail_fields": ["env", "version", "duration"],
  "actions": [
    { "id": "open", "label": "Open run", "kind": "link", "url": "{{url}}" },
    { "id": "rollback", "label": "Roll back", "kind": "callback" }
  ],
  "labels": { "de": { "env": "Umgebung" } }
}
```

- `fields`: up to 20. `key` matches `^[a-z][a-z0-9_]{0,39}$`, unique; `label` <= 60 chars; `type` is one of
  `text`, `number`, `date`, `datetime`, `user`, `url`, `currency`, `duration`. Pushed values must match
  (a `currency` looks like `12.50 USD`, `duration` is seconds, dates are ISO); `null` is always allowed.
- `subtitle` (<= 200 chars): placeholders `{{title}}`, `{{url}}`, `{{status}}`, `{{fields.<key>}}`.
- `badge`: `field` must be a declared key; `tones` maps a value to `success`, `warning`, `danger`, `info` or
  `neutral` (<= 20 entries). To colour by status, keep the status in a field too (the badge cannot read `status`).
- `detail_fields`: up to 8 declared keys shown in the detail view.
- `actions`: up to 3, unique `id` slugs, `label` <= 40 chars.
  - `link`: `url` must start with `https://` or a placeholder such as `{{url}}`; it renders only if the filled result is https.
  - `callback`: a button that sends an `item.action` event (with this `id` as `action_id`) to the app's event endpoint.
    Buttons stay on the card after a click, so make the handler idempotent (e.g. "first decision wins").
- `labels`: per-locale (`de`, `es`, `fr`, `fr-CA`) overrides of field labels, <= 20 per locale.

## html

```json
{
  "render_mode": "html",
  "fields": [{ "key": "amount", "label": "Amount", "type": "currency" }],
  "row_html": "<span class=\"font-semibold\">{{title}}</span>",
  "detail_html": "<div class=\"flex items-center justify-between gap-2 p-3 rounded-md bg-muted\"><span class=\"text-muted-foreground\">Amount due</span><strong>{{fields.amount}}</strong></div>",
  "actions": []
}
```

- `row_html` (<= 4000 chars, optional) is the list row; `detail_html` (<= 20 KB) is the detail view.
- Sanitized on save: only allowlisted tags (div, span, p, h3-h6, ul, ol, li, table parts, strong, em, a, img, time, ...)
  and attributes (`class`, `href`, `src`, `alt`, `title`, `datetime`, `colspan`, `rowspan`). No scripts, event
  handlers or inline styles. Classes must come from the allowlist at `/developers/docs/templates/classes`
  (theme tokens such as `bg-muted`, `text-muted-foreground`, not raw colours like `text-red-500`).
- The editor lists everything the sanitizer removed; aim for zero warnings. Placeholder values are HTML-escaped.

## builtin

Renders with ACinch's native card for a known kind, mapping your item onto it:

```json
{ "render_mode": "builtin", "kind": "task", "map": { "assignee": "fields.owner", "due_date": "fields.due", "state": "status" } }
```

- `kind`: `task`, `issue`, `pull_request` or `file`.
- `map` targets: `assignee`, `due_date`, `state`, `priority`, `repository`, `number`, `branch`, `file_type`, `size`.
  Sources: `fields.<key>`, `status`, `title` or `url`. Builtin types declare no field list and no actions.
