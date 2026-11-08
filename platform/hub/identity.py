"""Cross-system identity resolution.

Priority: employee ID  >  AD username (ITAM `assigned_to` / onboarding `ad_username`)  >  name.
A bare name that maps to more than one employee ID is *ambiguous* and is never auto-joined.
HR/IT can confirm legacy records in the registry (Hub table `identity_links`); ITAM and CyberShield
are not modified by this. Going forward, ITAM captures an employee ID at onboarding and asset assignment.
"""
import re
from collections import defaultdict
from . import connectors, db


def norm_id(v):
    return re.sub(r'\s+', '', str(v or '')).upper() or None


class Resolver:
    def __init__(self):
        self.name_ids = defaultdict(set)     # normalised name -> {employee ids}
        self.user_id = {}                    # lower username -> employee id
        self._load()

    def _load(self):
        c = connectors.itam()
        if c is not None:
            for r in connectors._rows(c, f"SELECT full_name, {connectors.col(c, 'onboarding', 'ad_username')}, {connectors.col(c, 'onboarding', 'employee_id')} FROM onboarding"):  # nosec B608
                self._learn(r['employee_id'], r['ad_username'], r['full_name'])
            if 'assigned_employee_id' in {r['name'] for r in connectors._rows(c, 'PRAGMA table_info(assets)')}:
                for r in connectors._rows(c, "SELECT assigned_to, assigned_to_name, assigned_employee_id FROM assets WHERE assigned_employee_id IS NOT NULL"):
                    self._learn(r['assigned_employee_id'], r['assigned_to'], r['assigned_to_name'])
            c.close()
        c = connectors.cybershield()
        if c is not None:
            for r in connectors._rows(c, "SELECT name, employee_id FROM trainees WHERE COALESCE(employee_id,'')!=''"):
                self._learn(r['employee_id'], None, r['name'])
            c.close()
        h = db.connect()
        for r in h.execute('SELECT kind, key, employee_id FROM identity_links'):
            emp = norm_id(r['employee_id'])
            if r['kind'] == 'user':
                self.user_id[r['key']] = emp
            else:
                self.name_ids[r['key']] = {emp}          # a confirmed link settles the ambiguity
        h.close()

    def _learn(self, emp, username, name):
        emp = norm_id(emp)
        if not emp:
            return
        if username and username.strip():
            self.user_id.setdefault(username.strip().lower(), emp)
        k = connectors.norm_name(name)
        if k:
            self.name_ids[k].add(emp)

    def key(self, emp=None, username=None, name=None):
        """-> (canonical key, quality) where quality is id | username | name->id | name | ambiguous"""
        e = norm_id(emp)
        if e:
            return 'id:' + e, 'id'
        u = (username or '').strip().lower()
        if u and u in self.user_id:
            return 'id:' + self.user_id[u], 'username'
        k = connectors.norm_name(name)
        ids = self.name_ids.get(k, set())
        if len(ids) == 1:
            return 'id:' + next(iter(ids)), 'name->id'
        if len(ids) > 1:
            return 'amb:' + k, 'ambiguous'
        return 'name:' + k, 'name'


def review():
    """Records that still rely on a bare name, and names that clash, for HR/IT to confirm."""
    r = Resolver()
    seen = {}
    for p in connectors.people():
        if p['quality'] in ('name', 'ambiguous'):
            seen[p['key']] = p
    ambiguous = {k: sorted(v) for k, v in r.name_ids.items() if len(v) > 1}
    return list(seen.values()), ambiguous


def confirm(actor, name, employee_id):
    emp = norm_id(employee_id)
    k = connectors.norm_name(name)
    if not emp or not k:
        return False
    h = db.connect()
    h.execute('INSERT INTO identity_links (kind,key,employee_id,confirmed_by) VALUES (?,?,?,?) '
              'ON CONFLICT(kind,key) DO UPDATE SET employee_id=excluded.employee_id, confirmed_by=excluded.confirmed_by, confirmed_at=datetime(\'now\')',
              ('name', k, emp, actor))
    h.commit(); h.close()
    return True
