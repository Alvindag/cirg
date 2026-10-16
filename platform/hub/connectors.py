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


def col(conn, table, name):
    """`name` if the column exists, else `NULL AS name`: lets the Hub read older ITAM/CyberShield databases
    that predate a column (e.g. employee_id) until the app is restarted and migrates itself."""
    have = {r['name'] for r in _rows(conn, f"PRAGMA table_info({table})")}  # nosec B608 - constant table names
    return name if name in have else f'NULL AS {name}'


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
    cols = {r['name'] for r in _rows(c, "PRAGMA table_info(trainees)")}
    cancelled = 'cancelled_at' if 'cancelled_at' in cols else 'NULL AS cancelled_at'
    rows = _rows(c, f"SELECT id, name, employee_id, department, track, started_at, deadline_at, completed_at, score, cert_ref, {cancelled} FROM trainees")  # nosec B608 - constant
    c.close()
    return [dict(r) for r in rows]


def training_status(rec, now=None):
    now = now or datetime.now()
    done = _parse(rec.get('completed_at'))
    if done:
        if (now - done).days <= config.TRAINING_VALID_DAYS:
            return 'completed'
        return 'expired'
    if rec.get('cancelled_at'):
        return 'cancelled'
    dl = _parse(rec.get('deadline_at'))
    if dl and dl < now:
        return 'overdue'
    return 'in_progress'


_RANK = {'completed': 0, 'in_progress': 1, 'expired': 2, 'overdue': 3}


def _best_training():
    """{person key: {'status','score','deadline','cert_ref','completed_at'}}; cancelled records are ignored."""
    from .identity import Resolver
    res = Resolver()
    best = {}
    for r in training_records() or []:
        st = training_status(r)
        if st == 'cancelled':
            continue
        key, _ = res.key(r.get('employee_id'), None, r['name'])
        if key not in best or _RANK[st] < _RANK[best[key]['status']]:
            best[key] = {'status': st, 'score': r.get('score'), 'deadline': r.get('deadline_at'),
                         'cert_ref': r.get('cert_ref'), 'completed_at': r.get('completed_at')}
    return best, res


def training_stats():
    if training_records() is None:
        return {'available': False}
    people_, _ = _best_training()
    n = len(people_)
    done = [p for p in people_.values() if p['status'] == 'completed']
    scores = [p['score'] for p in done if p['score'] is not None]
    return {'available': True, 'people': n, 'completed': len(done),
            'overdue': sum(p['status'] == 'overdue' for p in people_.values()),
            'expired': sum(p['status'] == 'expired' for p in people_.values()),
            'in_progress': sum(p['status'] == 'in_progress' for p in people_.values()),
            'avg_score': round(sum(scores) / len(scores), 1) if scores else None,
            'completion_pct': round(100 * len(done) / n, 1) if n else None}


# ── People: the join that neither system can do alone ───────────────────────
def people():
    """One row per person across ITAM (asset holders, joiners) and CyberShield (trainees)."""
    from .identity import Resolver
    res = Resolver()
    out = {}
    rank_q = {'id': 0, 'username': 1, 'name->id': 2, 'name': 3, 'ambiguous': 4}

    def person(key, quality, name):
        p = out.setdefault(key, {'key': key, 'name': name, 'department': '', 'assets': [], 'joiner': None, 'training': 'not_enrolled',
                                 'score': None, 'deadline': None, 'quality': quality})
        if rank_q[quality] > rank_q[p['quality']]:
            p['quality'] = quality                         # report the weakest link used
        return p

    c = itam()
    if c is not None:
        for r in _rows(c, f"SELECT asset_tag, asset_name, asset_type, assigned_to_name, assigned_to, {col(c, 'assets', 'assigned_employee_id')}, department FROM assets WHERE status='Active — Assigned'"):  # nosec B608
            nm = r['assigned_to_name'] or r['assigned_to']
            if not nm:
                continue
            k, q = res.key(r['assigned_employee_id'], r['assigned_to'], nm)
            p = person(k, q, nm)
            p['assets'].append({'tag': r['asset_tag'], 'name': r['asset_name'], 'type': r['asset_type']})
            p['department'] = p['department'] or r['department'] or ''
        for r in _rows(c, f"SELECT full_name, department, start_date, status, {col(c, 'onboarding', 'employee_id')}, {col(c, 'onboarding', 'ad_username')} FROM onboarding"):  # nosec B608
            k, q = res.key(r['employee_id'], r['ad_username'], r['full_name'])
            p = person(k, q, r['full_name'])
            p['joiner'] = {'start': r['start_date'], 'status': r['status']}
            p['department'] = p['department'] or r['department'] or ''
        c.close()
    best, _ = _best_training()
    for r in training_records() or []:
        if training_status(r) == 'cancelled':
            continue
        k, q = res.key(r.get('employee_id'), None, r['name'])
        p = person(k, q, r['name'])
        p['department'] = p['department'] or r.get('department') or ''
    for k, b in best.items():
        if k in out:
            out[k].update(training=b['status'], score=b['score'], deadline=b['deadline'])
    rows = list(out.values())
    for p in rows:
        p['exposed'] = bool(p['assets']) and p['training'] != 'completed'
        p['asset_count'] = len(p['assets'])
    rank = {'completed': 0, 'in_progress': 1, 'expired': 2, 'overdue': 3, 'not_enrolled': 4}
    rows.sort(key=lambda p: (not p['exposed'], -rank.get(p['training'], 9), p['name'].lower()))
    return rows


def assets_held(name, employee_id=None, username=None):
    """Tags of assets ITAM shows assigned to this person (employee ID, then username, then name)."""
    from .identity import Resolver
    res = Resolver()
    want, _ = res.key(employee_id, username, name)
    if want.startswith('amb:'):
        return None                       # cannot safely say who holds what
    c = itam()
    if c is None or not name:
        return None
    held = []
    for r in _rows(c, f"SELECT asset_tag, assigned_to_name, assigned_to, {col(c, 'assets', 'assigned_employee_id')} FROM assets WHERE status='Active — Assigned'"):  # nosec B608
        k, _q = res.key(r['assigned_employee_id'], r['assigned_to'], r['assigned_to_name'] or r['assigned_to'])
        if k == want:
            held.append(r['asset_tag'])
    c.close()
    return held


def joiners():
    """New starters from ITAM onboarding with their CyberShield training status."""
    c = itam()
    if c is None:
        return []
    rows = _rows(c, f"SELECT onb_ref, full_name, department, job_title, start_date, status, {col(c, 'onboarding', 'employee_id')}, {col(c, 'onboarding', 'ad_username')} FROM onboarding ORDER BY start_date DESC")  # nosec B608
    c.close()
    best, res = _best_training()
    out = []
    for r in rows:
        start = _parse(r['start_date'])
        days = (datetime.now() - start).days if start else None
        k, q = res.key(r['employee_id'], r['ad_username'], r['full_name'])
        t = best.get(k, {}).get('status', 'not_enrolled')
        out.append({'ref': r['onb_ref'], 'name': r['full_name'], 'department': r['department'], 'title': r['job_title'],
                    'start': r['start_date'], 'itam_status': r['status'], 'training': t, 'days_since_start': days,
                    'employee_id': r['employee_id'], 'quality': q,
                    'late': t == 'not_enrolled' and days is not None and days > 7})
    return out


def onboarding_training_item_done(onb_ref):
    """True if the ITAM onboarding checklist's security-awareness item is already Completed."""
    c = itam()
    if c is None:
        return None
    r = _rows(c, "SELECT k.status FROM onboarding_checklist k JOIN onboarding o ON o.id=k.onboarding_id "
                 "WHERE o.onb_ref=? AND k.category='IT Security' AND k.item_name LIKE '%awareness briefing%' ORDER BY k.id LIMIT 1", (onb_ref,))
    c.close()
    return (r[0]['status'] == 'Completed') if r else None


def completed_certificate(name, employee_id=None):
    """Most recent valid completed training record for a person: {'cert_ref','score'} or None."""
    from .identity import Resolver
    res = Resolver()
    want, _ = res.key(employee_id, None, name)
    best = None
    for r in training_records() or []:
        k, _q = res.key(r.get('employee_id'), None, r['name'])
        if k == want and training_status(r) == 'completed' and r.get('cert_ref'):
            if best is None or (r['completed_at'] or '') > (best['completed_at'] or ''):
                best = r
    return {'cert_ref': best['cert_ref'], 'score': best['score']} if best else None


def open_training_count(name, employee_id=None):
    """How many of this person's training records are still open (not completed, not cancelled)."""
    from .identity import Resolver
    res = Resolver()
    want, _ = res.key(employee_id, None, name)
    n = 0
    for r in training_records() or []:
        k, _q = res.key(r.get('employee_id'), None, r['name'])
        if k == want and not r.get('completed_at') and not r.get('cancelled_at'):
            n += 1
    return n
