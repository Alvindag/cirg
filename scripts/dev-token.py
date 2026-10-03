#!/usr/bin/env python3
"""Mint a development access token for the API (HS256, no dependencies).

Only works against an API running in Development/Testing with Auth:DevSigningKey set (see docker-compose.yml).
Example:  python3 scripts/dev-token.py --role Admin --tenant 11111111-1111-1111-1111-111111111111
"""
import argparse, base64, hashlib, hmac, json, time, uuid


def b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--key", default="dev-only-signing-key-change-me-0123456789abcdef")
    p.add_argument("--role", default="Admin", choices=["Rep", "AreaManager", "RegionalManager", "NationalSalesManager", "Marketing", "KeyAccountManager", "Executive", "Admin"])
    p.add_argument("--tenant", default=str(uuid.UUID(int=1)), help="tenant id (any GUID; create the Tenant row first if you use AI or ERP features)")
    p.add_argument("--user", default=str(uuid.UUID(int=2)), help="application user id")
    p.add_argument("--territory", default=None, help="territory id for reps and area managers")
    p.add_argument("--hours", type=float, default=8)
    a = p.parse_args()

    claims = {"das_tid": a.tenant, "das_uid": a.user, "http://schemas.microsoft.com/ws/2008/06/identity/claims/role": a.role,
              "exp": int(time.time() + a.hours * 3600)}
    if a.territory:
        claims["das_terr"] = a.territory
    head = b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    body = b64(json.dumps(claims, separators=(",", ":")).encode())
    sig = b64(hmac.new(a.key.encode(), f"{head}.{body}".encode(), hashlib.sha256).digest())
    print(f"{head}.{body}.{sig}")


if __name__ == "__main__":
    main()
