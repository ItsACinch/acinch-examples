# server.py - receive ACinch events and answer Approve / Reject clicks. Python 3.8+, standard library only.
# Run: python server.py
#
# Set your app's event endpoint URL to https://<your host>/acinch/events. Locally, expose this port with a tunnel
# (for example `cloudflared tunnel --url http://localhost:3000`) and use the https URL it prints.
import json
import os
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from acinch import api, item_path
from verify import verify_acinch_signature

SECRET = os.environ.get("ACINCH_SIGNING_SECRET")
if not SECRET:
    raise SystemExit("set ACINCH_SIGNING_SECRET (the acinch_ss_... secret from the developer portal)")
DECISIONS = {"approve": "approved", "reject": "rejected"}

# Delivery is at-least-once, so the same event can arrive twice.
# ponytail: in-memory, so it forgets on restart and is per process; keep event ids in your database in production.
handled = set()
lock = threading.Lock()  # ponytail: one lock for every event; per-item locks if throughput matters


def handle(event):
    kind, data = event["type"], event["data"]
    if kind == "installation.created":
        return print("installed:", data["installation_id"], f"({data['target_kind']})", flush=True)
    if kind == "installation.deleted":
        return print("uninstalled:", data["installation_id"], flush=True)
    if kind != "item.action":
        return  # ignore event types added later

    decision = DECISIONS.get(data["action_id"])
    if not decision:
        return
    inst, ext, email = data["installation_id"], data["external_id"], data["user"]["email"]
    item = api(inst, "GET", item_path(ext), allow_404=True)
    # Deleted, or already decided by someone else: the first click wins, later ones change nothing.
    if not item or item["fields"].get("state") != "pending":
        return print(f"{ext}: ignored {data['action_id']} from {email}", flush=True)

    # PUT replaces the whole item, so send everything back with the decision filled in.
    aud = item["audience"]
    audience = {k: aud[k] for k in ("users", "boards", "tenant") if aud.get(k)}
    update = {
        "type": item["type"],
        "title": item["title"],
        "body": f"{decision.capitalize()} by {email} at {datetime.now(timezone.utc).isoformat()}.",
        "occurred_at": item["occurred_at"],
        "status": decision,
        "fields": {**item["fields"], "state": decision, "decided_by": email},
        "audience": audience,
    }
    if item.get("url"):
        update["url"] = item["url"]
    api(inst, "PUT", item_path(ext), update)
    print(f"{ext}: {decision} by {email}", flush=True)


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/acinch/events":
            return self._reply(404)
        raw = self.rfile.read(int(self.headers.get("content-length") or 0))  # verify the exact bytes
        if not verify_acinch_signature(SECRET, self.headers.get("ACinch-Signature"), raw):
            return self._reply(401)
        event_id = self.headers.get("ACinch-Event-Id")
        with lock:
            if event_id in handled:
                return self._reply(200)  # duplicate: acknowledge, do nothing
            try:
                handle(json.loads(raw))
                handled.add(event_id)  # only once it worked, so a retry of a failed event runs again
                self._reply(200)
            except Exception as e:  # noqa: BLE001 - any failure: answer 500 so ACinch retries
                print(f"event {event_id} failed: {e}", flush=True)
                self._reply(500)

    def _reply(self, status):
        self.send_response(status)
        self.send_header("content-length", "0")
        self.end_headers()

    def log_message(self, *args):  # keep the console to our own lines
        pass


server = ThreadingHTTPServer(("", int(os.environ.get("PORT", "3000"))), Handler)
print(f"listening on http://localhost:{server.server_address[1]}/acinch/events", flush=True)
server.serve_forever()
