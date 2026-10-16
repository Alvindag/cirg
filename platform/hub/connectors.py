"""Read-only views onto the ITAM and CyberShield databases.

The Hub never writes to either application's database: connections are opened
with SQLite's `mode=ro`, so integration cannot corrupt or alter source records.
"""
import os, re, sqlite3
from datetime import date, datetime, timedelta
from . import config


def _ro(path):
    if not path or not os.path.exists(path):
        return None
    conn = sqlite3.connect(f'file:{path}?mode=ro', uri=True, timeout=5)
    conn.row_factory = sqlite3.Row
    return conn


def itam():
    return _ro(config.itam_db_path())


def cybershield():
    return _ro(config.cybershield_db_path())


def _scalar(conn, sql, args=()):
    try:
        row = conn.execute(sql, args).fetchone()
        return row[0] if row and row[0] is not None else 0
    except sqlite3.Error:
        return 0


def _rows(conn, sql, args=()):
    try:
        return conn.execute(sql, args).fetchall()
    except sqlite3.Error:
        return []


def _parse(d):
    if not d:
        return None
    for fmt in ('%Y-%m-%d', '%Y-%m-%dT%H:%M:%S.%f', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%d %H:%M:%S'):
        try:
            return datetime.strptime(str(d)[:26] if 'T' in str(d) else str(d), fmt)
        except ValueError:
            continue
    return None


def norm_name(n):
    """Order/case/punctuation-insensitive key used to match people across systems."""
    toks = re.sub(r'[^a-z\s]', ' ', (n or '').lower()).split()
    return ' '.join(sorted(toks))


# ── ITAM ────────────────────────────────────────────────────────────────────
def asset_stats():
    c = itam()
    if c is None:
        return {'available': False}
    today = date.today()
    inventory = "status NOT IN ('Disposed')"
    total = _scalar(c, f"SELECT COUNT(*) FROM assets WHERE {inventory}")  # nosec B608 - interpolates module constants only
    live = "status NOT IN ('Retired','Disposed','Lost / Stolen')"
    out = {
        'available': True,
        'total': total,
        'in_use': _scalar(c, "SELECT COUNT(*) FROM assets WHERE status='Active — Assigned'"),
        'unassigned': _scalar(c, "SELECT COUNT(*) FROM assets WHERE status='Active — Unassigned'"),
        'lost': _scalar(c, "SELECT COUNT(*) FROM assets WHERE status='Lost / Stolen'"),
        'live': _scalar(c, f"SELECT COUNT(*) FROM assets WHERE {live}"),  # nosec B608 - interpolates module constants only
        'missing_serial': _scalar(c, f"SELECT COUNT(*) FROM assets WHERE {live} AND category='Hardware' AND COALESCE(TRIM(serial_number),'')=''"),  # nosec B608 - interpolates module constants only
        'hardware': _scalar(c, f"SELECT COUNT(*) FROM assets WHERE {live} AND category='Hardware'"),  # nosec B608 - interpolates module constants only
        'assigned_no_owner': _scalar(c, "SELECT COUNT(*) FROM assets WHERE status='Active — Assigned' AND COALESCE(TRIM(assigned_to_name),'')='' AND COALESCE(TRIM(assigned_to),'')=''"),
        'missing_location': _scalar(c, f"SELECT COUNT(*) FROM assets WHERE {live} AND COALESCE(TRIM(location),'')=''"),  # nosec B608 - interpolates module constants only
        'open_repairs': _scalar(c, "SELECT COUNT(*) FROM repairs WHERE status='Open'"),
        'movements': _scalar(c, "SELECT COUNT(*) FROM movement_log"),
        'assigned_with_movement': _scalar(c, "SELECT COUNT(DISTINCT a.asset_tag) FROM assets a JOIN movement_log m ON m.asset_tag=a.asset_tag WHERE a.status='Active — Assigned'"),
    }
    exp = soon = dated = 0
    for r in _rows(c, f"SELECT warranty_expiry FROM assets WHERE {live} AND COALESCE(warranty_expiry,'')!=''"):  # nosec B608 - interpolates module constants only
        d = _parse(r[0])
        if d:
            dated += 1
            days = (d.date() - today).days
            exp += days < 0
            soon += 0 <= days <= 30
    out.update(warranty_dated=dated, warranty_expired=exp, warranty_expiring=soon)
    stale = 0
    for r in _rows(c, "SELECT created_at FROM repairs WHERE status='Open'"):
        d = _parse(r[0])
        if d and (datetime.now() - d).days > 30:
            stale += 1
    out['stale_repairs'] = stale
    sw_exp = sw_total = 0
    for r in _rows(c, "SELECT expiry_date FROM software WHERE COALESCE(status,'Active')='Active'"):
        sw_total += 1
        d = _parse(r[0])
        if d and d.date() < today:
            sw_exp += 1
    out.update(software_total=sw_total, software_expired=sw_exp,
               software_overused=_scalar(c, "SELECT COUNT(*) FROM software WHERE COALESCE(used_seats,0) > COALESCE(total_seats,0)"))
    c.close()
    return out


def itam_account_hygiene():
    """Return ITAM accounts + which still carry the shipped default password."""
    c = itam()
    if c is None:
        return None
    from werkzeug.security import check_password_hash
    defaults = {'admin': 'admin123', 'it_manager': 'manager123', 'it_staff': 'staff123',
                'hr_officer': 'hr123', 'viewer': 'viewer123'}
    users = _rows(c, "SELECT username, password_hash, is_active, last_login, role FROM users")
    default_pw = [u['username'] for u in users
                  if u['is_active'] and defaults.get(u['username'])
                  and check_password_hash(u['password_hash'], defaults[u['username']])]
    dormant = []
    for u in users:
        if not u['is_active']:
            continue
        d = _parse(u['last_login'])
        if d is None or (datetime.now() - d).days > 90:
            dormant.append(u['username'])
    c.close()
    return {'total': len([u for u in users if u['is_active']]),
            'default_password': default_pw, 'dormant': dormant,
            'admins': len([u for u in users if u['is_active'] and u['role'] == 'admin'])}


def cs_account_hygiene():
    c = cybershield()
    if c is None:
        return None
    from werkzeug.security import check_password_hash
    rows = _rows(c, "SELECT username, password_hash, must_change_pw FROM admin_users")
    default_pw = [r['username'] for r in rows if check_password_hash(r['password_hash'], 'Admin@DAS2026!')]
    c.close()
    return {'total': len(rows), 'default_password': default_pw}


# ── CyberShield ─────────────────────────────────────────────────────────────
def training_records():
    c = cybershield()
    if c is None:
        return None
    rows = _rows(c, "SELECT id, name, employee_id, department, track, started_at, deadline_at, completed_at, score, cert_ref FROM trainees")
    c.close()
    return [dict(r) for r in rows]


def training_status(rec, now=None):
    now = now or datetime.now()
    done = _parse(rec.get('completed_at'))
    if done:
        if (now - done).days <= config.TRAINING_VALID_DAYS:
            return 'completed'
        return 'expired'
    dl = _parse(rec.get('deadline_at'))
    if dl and dl < now:
        return 'overdue'
    return 'in_progress'


def training_stats():
    recs = training_records()
    if recs is None:
        return {'available': False}
    # one status per person: best status across their records
    rank = {'completed': 0, 'in_progress': 1, 'expired': 2, 'overdue': 3}
    people = {}
    for r in recs:
        key = norm_name(r['name']) or (r.get('employee_id') or str(r['id']))
        st = training_status(r)
        if key not in people or rank[st] < rank[people[key]['status']]:
            people[key] = {'status': st, 'score': r.get('score')}
    n = len(people)
    done = [p for p in people.values() if p['status'] == 'completed']
    scores = [p['score'] for p in done if p['score'] is not None]
    return {'available': True, 'people': n, 'completed': len(done),
            'overdue': sum(p['status'] == 'overdue' for p in people.values()),
            'expired': sum(p['status'] == 'expired' for p in people.values()),
            'in_progress': sum(p['status'] == 'in_progress' for p in people.values()),
            'avg_score': round(sum(scores) / len(scores), 1) if scores else None,
            'completion_pct': round(100 * len(done) / n, 1) if n else None}


# ── People: the join that neither system can do alone ───────────────────────
def people():
    """One row per person across ITAM (asset holders, joiners) and CyberShield (trainees)."""
    out = {}

    def person(key, name):
        return out.setdefault(key, {'name': name, 'department': '', 'assets': [], 'joiner': None,
                                    'training': 'not_enrolled', 'score': None, 'deadline': None})

    c = itam()
    if c is not None:
        for r in _rows(c, "SELECT asset_tag, asset_name, asset_type, assigned_to_name, assigned_to, department FROM assets WHERE status='Active — Assigned'"):
            nm = r['assigned_to_name'] or r['assigned_to']
            if not nm:
                continue
            p = person(norm_name(nm), nm)
            p['assets'].append({'tag': r['asset_tag'], 'name': r['asset_name'], 'type': r['asset_type']})
            p['department'] = p['department'] or r['department'] or ''
        for r in _rows(c, "SELECT full_name, department, start_date, status FROM onboarding"):
            p = person(norm_name(r['full_name']), r['full_name'])
            p['joiner'] = {'start': r['start_date'], 'status': r['status']}
            p['department'] = p['department'] or r['department'] or ''
        c.close()
    rank = {'completed': 0, 'in_progress': 1, 'expired': 2, 'overdue': 3, 'not_enrolled': 4}
    for r in training_records() or []:
        key = norm_name(r['name'])
        p = person(key, r['name'])
        p['department'] = p['department'] or r.get('department') or ''
        st = training_status(r)
        if p['training'] == 'not_enrolled' or rank[st] < rank[p['training']]:
            p['training'] = st
            p['score'] = r.get('score')
            p['deadline'] = r.get('deadline_at')
    rows = list(out.values())
    for p in rows:
        holds = bool(p['assets'])
        p['exposed'] = holds and p['training'] != 'completed'
        p['asset_count'] = len(p['assets'])
    rows.sort(key=lambda p: (not p['exposed'], rank.get(p['training'], 9) * -1, p['name'].lower()))
    return rows
