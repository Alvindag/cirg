"""Joiner and leaver automation across ITAM, CyberShield and (optionally) on-premise AD.

Joiners : auto-enrol new ITAM starters in CyberShield; sync their certificate back to the ITAM checklist.
Leavers : on the last day, cancel unfinished training; optionally disable the confirmed AD account.

Writes go through token-protected, idempotent endpoints (the Hub never edits either app's database).
Every action is sealed in the audit ledger. Disabled unless INTEGRATION_TOKEN (>= 32 chars) is set,
identically, for the Hub, ITAM and CyberShield. `run(dry_run=True)` reports what it WOULD do and changes nothing.
"""
import json, urllib.error, urllib.request
from datetime import date
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


def post_cybershield(path, payload):
    return _post(config.cybershield_internal_url(), path, payload)


def post_itam(path, payload):
    return _post(config.itam_internal_url(), path, payload)


def run(actor='system', dry_run=False):
    """Returns counts plus `plan`: a list of human-readable actions (performed, or proposed when dry_run)."""
    from . import directory, lifecycle                    # lazy: lifecycle imports this module
    out = {'enabled': enabled(), 'dry_run': dry_run, 'enrolled': 0, 'synced': 0, 'cancelled': 0, 'ad_disabled': 0, 'errors': 0, 'plan': []}
    if not out['enabled']:
        return out
    plan = out['plan']
    for j in connectors.joiners():
        if j['itam_status'] in SKIP_STATUS:
            continue
        if j['training'] == 'not_enrolled':
            plan.append(f"ENROL {j['name']} ({j['ref']}) in CyberShield [match: {j['quality']}]")
            if dry_run:
                out['enrolled'] += 1
                continue
            code, body = post_cybershield('/api/hub/enrol', {'name': j['name'], 'employee_id': j.get('employee_id') or '',
                                                               'department': j['department'] or '', 'track': 'onboarding'})
            if code == 200 and body.get('ok'):
                if body.get('created'):
                    out['enrolled'] += 1
                    ledger.log(actor, 'AUTO_ENROL', f"{j['ref']} {j['name']} enrolled in CyberShield")
            else:
                out['errors'] += 1
        elif j['training'] == 'completed' and connectors.onboarding_training_item_done(j['ref']) is False:
            cert = connectors.completed_certificate(j['name'], j.get('employee_id'))
            if not cert:
                continue
            plan.append(f"SYNC certificate {cert['cert_ref']} for {j['name']} -> ITAM checklist {j['ref']}")
            if dry_run:
                out['synced'] += 1
                continue
            code, body = post_itam('/api/hub/onboarding/training-complete', {'onb_ref': j['ref'], **cert})
            if code == 200 and body.get('ok'):
                if body.get('changed'):
                    out['synced'] += 1
                    ledger.log(actor, 'CERT_SYNC', f"{j['ref']} {j['name']} certificate {cert['cert_ref']} -> ITAM checklist")
            else:
                out['errors'] += 1
    today = date.today().isoformat()
    for c in lifecycle.cases():
        if c['status'] != 'open' or c['last_day'] > today:
            continue
        if c['open_training']:
            plan.append(f"CANCEL {c['open_training']} unfinished training record(s) for leaver {c['person_name']} ({c['ref']})")
            n = lifecycle.cancel_training(actor, c, dry_run)
            out['cancelled'] += n
            if not dry_run and not n:
                out['errors'] += 1
        s = directory.settings()
        if s['auto'] and directory.configured() and c.get('ad_dn') and not c.get('ad_disabled_at'):
            plan.append(f"DISABLE AD account {c['ad_dn']} for leaver {c['person_name']} ({c['ref']})" + (' [AD dry-run mode]' if s['dry_run'] else ''))
            status, res = lifecycle._do_disable(c, actor, dry_run=True if dry_run else None)
            if status == 'ok' and not res['dry_run']:
                out['ad_disabled'] += 1
            elif status != 'ok':
                out['errors'] += 1
    return out
