#!/usr/bin/env python3
"""Sets up a local test environment through the API, and can be run again safely (it only adds what is missing).

Creates: a territory, an area manager and a test rep, a few customers, products with sample batches, stock in the central warehouse,
and sample stock issued to the test rep (so samples can be given out from the phone). Prints the rep token to paste into the phone.

Needs the API running in Development mode. Example:
    python scripts/dev-seed.py                       # against http://localhost:5111
    python scripts/dev-seed.py --api http://localhost:5111 --key <signing key>
"""
import argparse, base64, hashlib, hmac, json, sys, time, urllib.error, urllib.request, uuid

ADMIN_ID = str(uuid.UUID(int=2)); MANAGER_ID = str(uuid.UUID(int=4)); REP_ID = str(uuid.UUID(int=3)); TENANT = str(uuid.UUID(int=1))


def b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def token(key: str, role: str, user: str, territory: str | None = None, hours: float = 72) -> str:
    claims = {"das_tid": TENANT, "das_uid": user, "http://schemas.microsoft.com/ws/2008/06/identity/claims/role": role, "exp": int(time.time() + hours * 3600)}
    if territory:
        claims["das_terr"] = territory
    head = b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    body = b64(json.dumps(claims, separators=(",", ":")).encode())
    return f"{head}.{body}.{b64(hmac.new(key.encode(), f'{head}.{body}'.encode(), hashlib.sha256).digest())}"


class Api:
    def __init__(self, base: str, tok: str):
        self.base, self.tok = base.rstrip("/") + "/api/v1", tok

    def call(self, method: str, path: str, body=None):
        req = urllib.request.Request(self.base + path, method=method, data=None if body is None else json.dumps(body).encode(),
                                     headers={"Authorization": f"Bearer {self.tok}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                text = r.read().decode()
                return json.loads(text) if text else None
        except urllib.error.HTTPError as e:
            raise SystemExit(f"{method} {path} failed: {e.code} {e.read().decode()[:300]}")
        except urllib.error.URLError as e:
            raise SystemExit(f"Cannot reach the API at {self.base}: {e.reason}. Is it running (scripts\\dev-api-lan.ps1)?")

    get = lambda self, p: self.call("GET", p)
    post = lambda self, p, b=None: self.call("POST", p, b)
    put = lambda self, p, b: self.call("PUT", p, b)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default="http://localhost:5111")
    ap.add_argument("--key", default="dev-only-signing-key-change-me-0123456789abcdef")
    a = ap.parse_args()
    admin = Api(a.api, token(a.key, "Admin", ADMIN_ID))

    # the admin user the dashboard asks about (/me)
    users = {u["externalId"]: u for u in admin.get("/admin/users?includeInactive=true")}
    if "dev-admin" not in users:
        admin.post("/admin/users", {"id": ADMIN_ID, "externalId": "dev-admin", "fullName": "Dev Admin", "email": "admin@example.test", "role": "Admin"})
        print("created: Dev Admin")

    terr = next((t for t in admin.get("/admin/territories") if t["name"] == "Accra Central"), None)
    if not terr:
        terr = admin.post("/admin/territories", {"name": "Accra Central", "region": "Greater Accra", "district": "Accra"}); print("created: territory Accra Central")
    if "am-test-1" not in users:
        admin.post("/admin/users", {"id": MANAGER_ID, "externalId": "am-test-1", "fullName": "Test Area Manager", "email": "am@test.local", "role": "AreaManager", "territoryId": terr["id"]}); print("created: Test Area Manager")
    if "rep-test-1" not in users:
        admin.post("/admin/users", {"id": REP_ID, "externalId": "rep-test-1", "fullName": "Test Rep", "email": "rep@test.local", "role": "Rep", "managerId": MANAGER_ID, "territoryId": terr["id"]}); print("created: Test Rep")
    elif users["rep-test-1"].get("territoryId") != terr["id"]:
        u = users["rep-test-1"]
        admin.put(f"/admin/users/{u['id']}", {"id": u["id"], "externalId": u["externalId"], "fullName": u["fullName"], "email": u["email"], "role": u["role"], "managerId": u.get("managerId") or MANAGER_ID, "territoryId": terr["id"], "isActive": True}); print("updated: Test Rep territory")

    have = {c["name"] for c in admin.get(f"/customers?pageSize=200&territoryId={terr['id']}")["items"]}
    for name, kind, seg, city, target in [("Ernest Chemists Osu", "Pharmacy", "B", "Accra", 2), ("Korle Bu Teaching Hospital", "Hospital", "A", "Accra", 4),
                                          ("Dr Ama Boateng", "Doctor", "A", "Accra", 4), ("Quiet Pharmacy", "Pharmacy", "C", "Tema", 1)]:
        if name not in have:
            admin.post("/customers", {"type": kind, "name": name, "segment": seg, "territoryId": terr["id"], "city": city, "targetVisitsPerMonth": target}); print(f"created: customer {name}")

    # products, batches, warehouse stock
    products = {p["code"]: p for p in admin.get("/admin/products")}
    for code, name, area, cost in [("AMX500", "Amoxil 500 mg", "Anti-infectives", 2.5), ("CRD10", "Cardiostat 10 mg", "Cardiology", 4.0), ("PCM500", "Paracetamol 500 mg", "Pain", 0.8)]:
        if code not in products:
            products[code] = admin.post("/admin/products", {"name": name, "code": code, "therapeuticArea": area, "standardCost": cost, "reorderLevel": 50}); print(f"created: product {name}")
    expiry = time.strftime("%Y-%m-%d", time.gmtime(time.time() + 400 * 86400))
    batches = admin.get("/samples/batches")
    batch_for = {}
    for code, p in products.items():
        existing = next((b for b in batches if b["productId"] == p["id"] and b["batchNumber"] == f"{code}-TEST1"), None)
        if not existing:
            existing = admin.post("/samples/batches", {"productId": p["id"], "batchNumber": f"{code}-TEST1", "expiryDate": expiry})
            admin.post("/samples/receipts", {"batchId": existing["id"], "quantity": 500, "note": "Test stock"}); print(f"created: batch {code}-TEST1 with 500 units in the warehouse")
        batch_for[code] = existing

    # give the test rep some stock through the normal request -> approve -> issue route
    rep = Api(a.api, token(a.key, "Rep", REP_ID, terr["id"]))
    held = {s["productId"] for s in rep.get("/samples/my-stock") if s.get("quantity", 0) > 0}
    for code, p in products.items():
        if p["id"] in held:
            continue
        req = rep.post("/samples/requests", {"productId": p["id"], "quantity": 30, "notes": "Test stock"})
        admin.post(f"/samples/requests/{req['id']}/approve", {"quantity": 30, "note": "Test"})
        admin.post(f"/samples/requests/{req['id']}/fulfil", {"allocations": None, "allowPartial": False}); print(f"issued: 30 x {p['name']} to Test Rep")

    print("\nDone. Paste this token into the phone (valid 72 hours):\n")
    print(token(a.key, "Rep", REP_ID, terr["id"]))
    print("\nFor the web dashboard use an Admin token:  python scripts\\dev-token.py --role Admin")


if __name__ == "__main__":
    sys.exit(main())
