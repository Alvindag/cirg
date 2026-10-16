"""Joiner / leaver lifecycle. Leaver cases live in the Hub; ITAM and CyberShield are only read.

Visibility: HR, admin, IT and auditors see every case; a line manager sees only cases they raised or
are responsible for. A step can only be completed by its owner role. The "all assets returned"
step is verified from ITAM and cannot be ticked by hand.
"""
from datetime import date, datetime, timedelta
from . import connectors, db, ledger

REASONS = ['Resignation', 'End of contract', 'Retirement', 'Dismissal', 'Transfer out of company', 'Other']

# (title, owner, due offset in days from the last day, auto_key)
TEMPLATE = [
    ('Confirm last working day; hand over duties, shared files and approvals', 'manager', -5, None),
    ('HR clearance: exit interview, final pay and benefits, confidentiality reminder', 'hr', -3, None),
    ('Transfer ownership of the leaver\'s data, mailbox and shared resources', 'manager', -1, None),
    ('All company assets returned (verified automatically from ITAM)', 'it', 0, 'assets'),
    ('Disable Active Directory / Entra account and reset passwords', 'it', 0, None),
    ('Disable or convert the mailbox (approved forwarding only)', 'it', 0, None),
    ('Revoke access to business systems (Business Central, VPN, ITAM, CyberShield, Hub)', 'it', 0, None),
    ('Wipe or re-image returned devices; record redeployment or disposal', 'it', 1, None),
    ('Final HR sign-off and file closure', 'hr', 7, None),
]


def can_see(user, case):
    from .auth import can
    return can(user['role'], 'lifecycle_all') or (can(user['role'], 'lifecycle') and case['manager_username'] == user['username'])


def can_complete(user, case, step):
    if case['status'] != 'open' or step['auto_key']:
        return False
    role = user['role']
    if role == 'admin':
        return True
    if role == 'hr':
        return step['owner_role'] in ('hr', 'manager')            # HR may act for a manager
    if role == 'line_manager':
        return step['owner_role'] == 'manager' and case['manager_username'] == user['username']
    if role in ('it_manager', 'it_staff'):
        return step['owner_role'] == 'it'
    return False


def create_case(actor, person_name, employee_id, department, job_title, manager_username, last_day, reason):
    ld = datetime.strptime(last_day, '%Y-%m-%d').date()          # raises ValueError if malformed
    conn = db.connect()
    try:
        conn.execute('BEGIN IMMEDIATE')
        n = conn.execute('SELECT COUNT(*) FROM lifecycle_cases').fetchone()[0] + 1
        ref = f'LVR-{date.today():%Y}-{n:04d}'
        cur = conn.execute('''INSERT INTO lifecycle_cases (ref,person_name,employee_id,department,job_title,manager_username,last_day,reason,created_by)
                              VALUES (?,?,?,?,?,?,?,?,?)''',
                           (ref, person_name[:120], employee_id[:40], department[:80], job_title[:80], manager_username, last_day, reason, actor))
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
    """Derive live state: auto-verified steps, overdue flags, assets still held."""
    today = date.today().isoformat()
    held = connectors.assets_held(c['person_name'])
    c['assets_held'] = held                                       # None = ITAM unreachable
    for s in c['steps']:
        if s['auto_key'] == 'assets':
            s['done'] = int(held == [])
            s['note'] = 'No assigned assets in ITAM.' if held == [] else (
                'ITAM unavailable.' if held is None else 'Still assigned: ' + ', '.join(held))
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
