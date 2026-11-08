"""Minimal signed-ticket SSO shared by the Hub, ITAM and CyberShield.

The Hub authenticates a user (password + optional TOTP) and mints a short-lived,
audience-bound, single-use ticket signed with HMAC-SHA256 using SSO_SECRET.
A downstream app verifies the ticket and opens its own local session.

Disabled automatically when SSO_SECRET is unset, so the standalone apps keep
working exactly as before.
"""
import base64, hashlib, hmac, json, os, secrets, threading, time

_used = {}
_lock = threading.Lock()


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b'=').decode()


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + '=' * (-len(s) % 4))


def secret() -> bytes | None:
    s = os.environ.get('SSO_SECRET', '')
    return s.encode() if len(s) >= 32 else None


def sign(sub: str, role: str, aud: str, ttl: int = 60, key: bytes | None = None) -> str:
    key = key or secret()
    if not key:
        raise RuntimeError('SSO_SECRET missing or shorter than 32 characters')
    body = {'sub': sub, 'role': role, 'aud': aud,
            'exp': int(time.time()) + ttl, 'jti': secrets.token_hex(8)}
    raw = _b64(json.dumps(body, separators=(',', ':')).encode())
    sig = _b64(hmac.new(key, raw.encode(), hashlib.sha256).digest())
    return f'{raw}.{sig}'


def verify(token: str, aud: str, key: bytes | None = None) -> dict | None:
    """Return the claims if the ticket is authentic, unexpired, for `aud`, unused."""
    key = key or secret()
    if not key or not token or '.' not in token:
        return None
    raw, _, sig = token.partition('.')
    good = _b64(hmac.new(key, raw.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, good):
        return None
    try:
        claims = json.loads(_unb64(raw))
    except Exception:
        return None
    now = time.time()
    if claims.get('aud') != aud or claims.get('exp', 0) < now:
        return None
    with _lock:
        for k in [k for k, v in _used.items() if v < now]:
            del _used[k]
        if claims['jti'] in _used:
            return None
        _used[claims['jti']] = claims['exp']
    return claims
