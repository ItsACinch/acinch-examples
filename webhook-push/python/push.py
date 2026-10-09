# push.py - send a message to ACinch through an incoming webhook URL. Python 3.8+, standard library only.
#
#   python push.py "Disk 91% full on db-1" --level danger --source db-1 --key disk-db-1
#   python push.py "Disk back to 60% on db-1" --level success --source db-1 --key disk-db-1   (updates the same card)
#
# The hook URL is the only credential: no OAuth, no token. Keep it in ACINCH_HOOK_URL, never in code.
import argparse
import json
import os
import urllib.request

parser = argparse.ArgumentParser(description="Push a message to ACinch through an incoming webhook.")
parser.add_argument("message", nargs="+")
parser.add_argument("--level", default="info", choices=["info", "warning", "danger", "success"], help="badge colour")
parser.add_argument("--source", default="push.py")
parser.add_argument("--key", help="same key = same card, updated in place")
parser.add_argument("--url", help="optional link on the card")
args = parser.parse_args()

# No "type": the hook's default type (alert) is used. No "audience": the hook's default audience is used.
item = {"title": " ".join(args.message), "fields": {"level": args.level, "source": args.source}}
if args.url:
    item["url"] = args.url

headers = {"content-type": "application/json"}
if args.key:
    # Without a key every push is a new card. With one, a repeat updates the card it made before.
    headers["Idempotency-Key"] = args.key

req = urllib.request.Request(os.environ["ACINCH_HOOK_URL"], data=json.dumps(item).encode(), method="POST", headers=headers)
with urllib.request.urlopen(req) as res:  # raises urllib.error.HTTPError on 4xx/5xx
    print("created" if res.status == 201 else "updated", json.load(res)["external_id"])
