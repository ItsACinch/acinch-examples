# hello.py - push one item into ACinch. Python 3.8+, standard library only. Run: python hello.py
import base64
import json
import os
import time
import urllib.parse
import urllib.request

BASE = os.environ.get("ACINCH_BASE_URL", "https://app.acinch.com")
CLIENT_ID = os.environ["ACINCH_CLIENT_ID"]
CLIENT_SECRET = os.environ["ACINCH_CLIENT_SECRET"]
INSTALLATION_ID = os.environ["ACINCH_INSTALLATION_ID"]

# 1. Trade the app's credentials for a token that acts as one installation. It is valid for an hour.
basic = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()
form = urllib.parse.urlencode({"grant_type": "client_credentials", "installation_id": INSTALLATION_ID}).encode()
req = urllib.request.Request(f"{BASE}/oauth/token", data=form, headers={"authorization": f"Basic {basic}"})
with urllib.request.urlopen(req) as res:  # raises urllib.error.HTTPError on 4xx/5xx
    access_token = json.load(res)["access_token"]

# 2. PUT an item under an ID you choose. The first run creates it (201); every later run updates it (200).
#    No audience, so only the person who installed the app sees it.
item = {
    "type": "hello",
    "title": "Hello, world!",
    "body": f"Sent at {time.strftime('%H:%M:%S')} by the hello-world example.",
}
req = urllib.request.Request(
    f"{BASE}/api/v1/items/hello-world",
    data=json.dumps(item).encode(),
    method="PUT",
    headers={"authorization": f"Bearer {access_token}", "content-type": "application/json"},
)
with urllib.request.urlopen(req) as res:
    print("created" if res.status == 201 else "updated", json.load(res)["external_id"])
