# verify.py - check the ACinch-Signature header on an event delivery.
import hashlib
import hmac
import re
import time


def verify_acinch_signature(secret, header, raw_body, now=None, tolerance=300):
    """secret: your signing secret (acinch_ss_...); header: the ACinch-Signature header,
    "t=<unix seconds>,v1=<hex HMAC-SHA256>"; raw_body: the request body exactly as received (bytes)."""
    m = re.fullmatch(r"t=(\d{1,12}),v1=([0-9a-f]{64})", header or "")
    if not m:
        return False
    t = int(m.group(1))
    if abs((time.time() if now is None else now) - t) > tolerance:
        return False  # a replayed old delivery
    expected = hmac.new(secret.encode(), f"{t}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, m.group(2))
