# acinch.py - a minimal ACinch API client. Python 3.8+, standard library only.
# One token per installation: an app installed in three workspaces talks to each with its own token.
import base64
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get("ACINCH_BASE_URL", "https://app.acinch.com")
CLIENT_ID = os.environ.get("ACINCH_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("ACINCH_CLIENT_SECRET", "")

_tokens = {}  # installation id -> (token, renew_at)


def _token(installation_id):
    cached = _tokens.get(installation_id)
    if cached and time.time() < cached[1]:
        return cached[0]
    basic = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()
    form = urllib.parse.urlencode({"grant_type": "client_credentials", "installation_id": installation_id}).encode()
    req = urllib.request.Request(f"{BASE}/oauth/token", data=form, headers={"authorization": f"Basic {basic}"})
    with urllib.request.urlopen(req) as res:
        body = json.load(res)
    # Renew a minute early so a token never runs out mid-request.
    _tokens[installation_id] = (body["access_token"], time.time() + body["expires_in"] - 60)
    return body["access_token"]


def api(installation_id, method, path, body=None, allow_404=False, _retried=False):
    """Call /api/v1 as one installation. Returns the parsed body, or None for 204 and (with allow_404) 404."""
    headers = {"authorization": f"Bearer {_token(installation_id)}"}
    data = None
    if body is not None:
        headers["content-type"] = "application/json"
        data = json.dumps(body).encode()
    req = urllib.request.Request(f"{BASE}/api/v1{path}", data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req) as res:
            return None if res.status == 204 else json.load(res)
    except urllib.error.HTTPError as e:
        # 401: the token was revoked or expired early. Drop it, mint a new one and retry once.
        if e.code == 401 and not _retried:
            _tokens.pop(installation_id, None)
            return api(installation_id, method, path, body, allow_404, _retried=True)
        if e.code == 404 and allow_404:
            return None
        raise RuntimeError(f"{method} {path}: {e.code} {e.read().decode(errors='replace')}") from None


def item_path(external_id):
    return "/items/" + urllib.parse.quote(external_id, safe="")
