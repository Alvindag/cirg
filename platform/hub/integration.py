"""Joiner automation: auto-enrol new starters in CyberShield, then sync their certificate back to ITAM.

Writes go through two token-protected endpoints (one per app); the Hub never edits either database
directly. Every action is sealed in the audit ledger. Idempotent: running it twice changes nothing.
Disabled unless INTEGRATION_TOKEN (>= 32 chars) is set, identically, for Hub, ITAM and CyberShield.
"""
import json, urllib.error, urllib.request
from . import config, connectors, ledger

SKIP_STATUS = {'Completed', 'Cancelled'}


def token():
    t = config.env('INTEGRATION_TOKEN', '')
    return t if len(t) >= 32 else None


def enabled():
    return token() is not None


def _post(base, path, payload):
    """HTTP call to an app. Tests replace this function."""
    req = urllib.request.Request(base.rstrip('/') + path, data=json.dumps(payload).encode(), method='POST',
                                 headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token()})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:       # nosec B310 - operator-configured http(s) URL
            return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, {}
    except (urllib.error.URLError, TimeoutError, OSError):
        return 0, {}


def run(actor='system'):
    out = {'enabled': enabled(), 'enrolled': 0, 'synced': 0, 'errors': 0}
    if not out['enabled']:
        return out
    for j in connectors.joiners():
        if j['itam_status'] in SKIP_STATUS:
            continue
        if j['training'] == 'not_enrolled':
            code, body = _post(config.cybershield_internal_url(), '/api/hub/enrol',
                               {'name': j['name'], 'department': j['department'] or '', 'track': 'onboarding'})
            if code == 200 and body.get('ok'):
                if body.get('created'):
                    out['enrolled'] += 1
                    ledger.log(actor, 'AUTO_ENROL', f"{j['ref']} {j['name']} enrolled in CyberShield")
            else:
                out['errors'] += 1
        elif j['training'] == 'completed' and connectors.onboarding_training_item_done(j['ref']) is False:
            cert = connectors.completed_certificate(j['name'])
            if not cert:
                continue
            code, body = _post(config.itam_internal_url(), '/api/hub/onboarding/training-complete',
                               {'onb_ref': j['ref'], **cert})
            if code == 200 and body.get('ok'):
                if body.get('changed'):
                    out['synced'] += 1
                    ledger.log(actor, 'CERT_SYNC', f"{j['ref']} {j['name']} certificate {cert['cert_ref']} -> ITAM checklist")
            else:
                out['errors'] += 1
    return out
