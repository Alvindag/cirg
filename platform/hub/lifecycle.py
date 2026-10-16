"""Joiner / leaver lifecycle (onboarding and offboarding). Leaver cases live in the Hub.

Visibility: HR, admin, IT and auditors see every case; a line manager sees only cases they raised or
are responsible for. A step can only be completed by its owner role. Three steps are system-verified
and cannot be ticked by hand when their integration is configured:
  assets   - ITAM shows nothing assigned to the person
  training - the person has no unfinished CyberShield training (it is cancelled when the last day arrives)
  ad       - the confirmed on-premise AD account has been disabled and read back as disabled
If an integration is not configured, its step falls back to a normal manual step.
"""
from datetime import date, datetime, timedelta
from . import connectors, db, directory, integration, ledger

REASONS = ['Resignation', 'End of contract', 'Retirement', 'Dismissal', 'Transfer out of company', 'Other']

# (title, owner, due offset in days from the last day, auto_key)
TEMPLATE = [
    ('Confirm last working day; hand over duties, shared files and approvals', 'manager', -5, None),
    ('HR clearance: exit interview, final pay and benefits, confidentiality reminder', 'hr', -3, None),
    ('Transfer ownership of the leaver\'s data, mailbox and shared resources', 'manager', -1, None),
    ('All company assets returned (verified automatically from ITAM)', 'it', 0, 'assets'),
    ('Unfinished security training cancelled in CyberShield (automatic on the last day)', 'hr', 0, 'training'),
    ('Disable the on-premise Active Directory account (confirmed, then verified)', 'it', 0, 'ad'),
    ('Disable or convert the mailbox (approved forwarding only)', 'it', 0, None),
    ('Revoke access to business systems (Business Central, VPN, ITAM, CyberShield, Hub)', 'it', 0, None),
    ('Wipe or re-image returned devices; record redeployment or disposal', 'it', 1, None),
    ('Final HR sign-off and file closure', 'hr', 7, None),
]
IT_ROLES = ('it_manager', 'it_staff')


def can_see(user, case):
    from .auth import can
    return can(user['role'], 'lifecycle_all') or (can(user['role'], 'lifecycle') and case['manager_username'] == user['username'])


def is_auto(step):
    return bool(step['auto_key']) and not step.get('manual_fallback')


def can_complete(user, case, step):
    if case['status'] != 'open' or is_auto(step):
        return False
    role = user['role']
    if role == 'admin':
        return True
    if role == 'hr':
        return step['owner_role'] in ('hr', 'manager')            # HR may act for a manager
    if role == 'line_manager':
        return step['owner_role'] == 'manager' and case['manager_username'] == user['username']
    if role in IT_ROLES:
        return step['owner_role'] == 'it'
    return False


def create_case(actor, person_name, employee_id, department, job_title, manager_username, last_day, reason, ad_username=''):
    ld = datetime.strptime(last_day, '%Y-%m-%d').date()          # raises ValueError if malformed
    conn = db.connect()
    try:
        conn.execute('BEGIN IMMEDIATE')
        n = conn.execute('SELECT COUNT(*) FROM lifecycle_cases').fetchone()[0] + 1
        ref = f'LVR-{date.today():%Y}-{n:04d}'
        cur = conn.execute('''INSERT INTO lifecycle_cases (ref,person_name,employee_id,department,job_title,manager_username,last_day,reason,created_by,ad_username)
                              VALUES (?,?,?,?,?,?,?,?,?,?)''',
                           (ref, person_name[:120], employee_id[:40], department[:80], job_title[:80], manager_username, last_day, reason, actor, ad_username[:64]))
        for i, (title, owner, off, auto) in enumerate(TEMPLATE, 1):
            conn.execute('INSERT INTO lifecycle_steps (case_id,seq,title,owner_role,due_date,auto_key) VALUES (?,?,?,?,?,?)',
                         (cur.lastrowid, i, title, owner, (ld + timedelta(days=off)).isoformat(), auto))
        ledger.append(conn, 'hub', actor, 'LEAVER_START', f'{ref} last_day={last_day} reason={reason}')
        conn.commit()
    finally:
        conn.close()
    return ref


def cases(user=None):
    conn = db.connect()
    rows = [dict(r) for r in conn.execute('SELECT * FROM lifecycle_cases ORDER BY status, last_day')]
    for c in rows:
        c['steps'] = [dict(s) for s in conn.execute('SELECT * FROM lifecycle_steps WHERE case_id=? ORDER BY seq', (c['id'],))]
        refresh(c)
    conn.close()
    return [c for c in rows if user is None or can_see(user, c)]


def get(ref, user=None):
    for c in cases(user):
        if c['ref'] == ref:
            return c
    return None


def refresh(c):
    """Derive live state: system-verified steps, overdue flags, assets still held."""
    today = date.today().isoformat()
    emp = c.get('employee_id') or None
    held = connectors.assets_held(c['person_name'], emp, c.get('ad_username') or None)
    c['assets_held'] = held                                       # None = ITAM unreachable or identity ambiguous
    c['open_training'] = connectors.open_training_count(c['person_name'], emp)
    for s in c['steps']:
        k = s['auto_key']
        if k == 'assets':
            s['done'] = int(held == [])
            s['note'] = 'No assigned assets in ITAM.' if held == [] else (
                'ITAM unavailable or the person\'s identity is ambiguous: confirm it on the Identity page.' if held is None else 'Still assigned: ' + ', '.join(held))
        elif k == 'training':
            if not integration.enabled():
                s['manual_fallback'] = True
            else:
                s['done'] = int(c['open_training'] == 0)
                s['note'] = 'No unfinished training.' if s['done'] else f"{c['open_training']} unfinished training record(s); cancelled automatically on the last day."
        elif k == 'ad':
            if not directory.configured():
                s['manual_fallback'] = True
            else:
                s['done'] = int(bool(c.get('ad_disabled_at')))
                s['note'] = ('Disabled ' + c['ad_disabled_at'][:16]) if s['done'] else (
                    f"Account confirmed: {c['ad_dn']}" if c.get('ad_dn') else 'Look up and confirm the leaver\'s AD account.')
        s['overdue'] = (not s['done']) and s['due_date'] < today
    c['open_steps'] = sum(not s['done'] for s in c['steps'])
    c['overdue_steps'] = sum(s['overdue'] for s in c['steps'])
    c['past_last_day'] = c['last_day'] < today
    c['at_risk'] = c['status'] == 'open' and c['past_last_day'] and (bool(held) or c['overdue_steps'] > 0)
    return c


def complete_step(user, ref, step_id, note=''):
    c = get(ref, user)
    if not c:
        return 'not_found'
    st = next((s for s in c['steps'] if s['id'] == step_id), None)
    if not st or st['done'] or not can_complete(user, c, st):
        return 'forbidden'
    conn = db.connect()
    conn.execute('BEGIN IMMEDIATE')
    conn.execute("UPDATE lifecycle_steps SET done=1, done_by=?, done_at=datetime('now'), note=? WHERE id=?", (user['username'], note[:300], step_id))
    ledger.append(conn, 'hub', user['username'], 'LEAVER_STEP', f"{ref} step {st['seq']}: {st['title'][:70]}")
    conn.commit(); conn.close()
    return 'ok'


def close_case(user, ref):
    c = get(ref, user)
    if not c or user['role'] not in ('hr', 'admin'):
        return 'forbidden'
    if c['open_steps']:
        return 'open_steps'
    conn = db.connect()
    conn.execute('BEGIN IMMEDIATE')
    conn.execute("UPDATE lifecycle_cases SET status='closed', closed_at=datetime('now') WHERE ref=?", (ref,))
    ledger.append(conn, 'hub', user['username'], 'LEAVER_CLOSE', ref)
    conn.commit(); conn.close()
    return 'ok'


# ── Active Directory (on-premise) ───────────────────────────────────────────
def _need(user, ref, roles):
    c = get(ref, user)
    if not c or c['status'] != 'open':
        return None, 'not_found'
    if user['role'] not in roles:
        return c, 'forbidden'
    if not directory.configured():
        return c, 'not_configured'
    return c, 'ok'


def ad_lookup(user, ref):
    c, r = _need(user, ref, IT_ROLES + ('admin',))
    if r != 'ok':
        return r, []
    try:
        found = directory.default().find(c.get('employee_id') or None, c.get('ad_username') or None, c['person_name'])
    except Exception as e:                                          # noqa: BLE001 - surface any directory error to IT
        return f'error: {type(e).__name__}: {e}', []
    ledger.log(user['username'], 'AD_LOOKUP', f"{ref} -> {len(found)} candidate(s)")
    return 'ok', found


def ad_confirm(user, ref, dn):
    c, r = _need(user, ref, IT_ROLES + ('admin',))
    if r != 'ok':
        return r
    status, found = ad_lookup(user, ref)
    cand = next((x for x in found if x['dn'] == dn), None)
    if status != 'ok' or not cand:
        return 'no_such_candidate'
    if cand['protected']:
        return 'protected'
    conn = db.connect()
    conn.execute('BEGIN IMMEDIATE')
    conn.execute('UPDATE lifecycle_cases SET ad_dn=?, ad_username=?, ad_confirmed_by=?, ad_disabled_at=NULL WHERE ref=?', (dn, cand['sam'], user['username'], ref))
    ledger.append(conn, 'hub', user['username'], 'AD_CONFIRM', f"{ref} account {cand['sam']} ({dn})")
    conn.commit(); conn.close()
    return 'ok'


def ad_disable(user, ref, dry_run=None):
    """Disable the confirmed account. Allowed on/after the last day (admin may do it earlier)."""
    c, r = _need(user, ref, ('it_manager', 'admin'))
    if r != 'ok':
        return r, {}
    if not c.get('ad_dn'):
        return 'not_confirmed', {}
    if c['last_day'] > date.today().isoformat() and user['role'] != 'admin':
        return 'too_early', {}
    return _do_disable(c, user['username'], dry_run)


def _do_disable(c, actor, dry_run=None):
    ref = c['ref']
    try:
        res = directory.default().disable(c['ad_dn'], directory.note_for(ref), expect_sam=c.get('ad_username') or None, dry_run=dry_run)
    except Exception as e:                                          # noqa: BLE001
        ledger.log(actor, 'AD_DISABLE_FAILED', f"{ref} {c['ad_dn']}: {type(e).__name__}: {e}")
        return f'error: {e}', {}
    ledger.log(actor, 'AD_DISABLE_DRYRUN' if res['dry_run'] else 'AD_DISABLE', f"{ref} {res['sam']} {res['dn']} {'; '.join(res['warnings'])}")
    if not res['dry_run']:
        conn = db.connect()
        conn.execute("UPDATE lifecycle_cases SET ad_disabled_at=datetime('now'), ad_dn=? WHERE ref=?", (res['dn'], ref))
        conn.commit(); conn.close()
    return 'ok', res


def ad_reenable(user, ref):
    c, r = _need(user, ref, ('admin',))
    if r != 'ok' or not c.get('ad_dn'):
        return r if r != 'ok' else 'not_confirmed'
    try:
        directory.default().enable(c['ad_dn'])
    except Exception as e:                                          # noqa: BLE001
        return f'error: {e}'
    conn = db.connect()
    conn.execute('UPDATE lifecycle_cases SET ad_disabled_at=NULL WHERE ref=?', (ref,))
    conn.commit(); conn.close()
    ledger.log(user['username'], 'AD_REENABLE', f"{ref} {c['ad_dn']}")
    return 'ok'


# ── Training cancellation ───────────────────────────────────────────────────
def cancel_training(actor, c, dry_run=False):
    """Cancel the leaver's unfinished CyberShield training (idempotent)."""
    if not integration.enabled() or not c['open_training']:
        return 0
    if dry_run:
        return c['open_training']
    code, body = integration.post_cybershield('/api/hub/cancel', {'name': c['person_name'], 'employee_id': c.get('employee_id') or ''})
    n = body.get('cancelled', 0) if code == 200 and body.get('ok') else 0
    if n:
        conn = db.connect()
        conn.execute("UPDATE lifecycle_cases SET training_cancelled_at=datetime('now') WHERE ref=?", (c['ref'],))
        conn.commit(); conn.close()
        ledger.log(actor, 'TRAINING_CANCELLED', f"{c['ref']} {c['person_name']}: {n} record(s)")
    return n
