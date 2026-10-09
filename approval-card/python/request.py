# request.py - ask for a deploy approval. Python 3.8+, standard library only.
#
#   APPROVERS=alex@example.com,sam@example.com python request.py checkout 2.4.0 https://github.com/acme/checkout/compare/v2.3.0...v2.4.0
#
# Puts an "approval" card in each approver's ACinch feed with Approve and Reject buttons. A click is delivered to
# server.py as a signed item.action event; the server then updates this same card.
import os
import sys

from acinch import api, item_path

if len(sys.argv) < 3:
    sys.exit("usage: python request.py <service> <version> [changes-url]")
service, version = sys.argv[1], sys.argv[2]
changes_url = sys.argv[3] if len(sys.argv) > 3 else None
approvers = [a.strip() for a in os.environ.get("APPROVERS", "").split(",") if a.strip()]

item = {
    "type": "approval",
    "title": f"Deploy {service} {version} to production?",
    "status": "pending",
    "fields": {"state": "pending", "service": service, "version": version,
               "requested_by": os.environ.get("REQUESTED_BY", "request.py"), "decided_by": None},
}
if changes_url:
    item["url"] = changes_url
if approvers:  # no approvers named: only the person who installed the app sees the card
    item["audience"] = {"users": approvers}

saved = api(os.environ["ACINCH_INSTALLATION_ID"], "PUT", item_path(f"approval-{service}-{version}"), item)
print("requested", saved["external_id"])
