"""On-premise Active Directory connector (LDAPS) used to disable a leaver's account.

Safety model (this can lock people out, so it is deliberately conservative):
  * DRY RUN is the default (AD_DRY_RUN=true): nothing is changed until you set it to false.
  * The Hub never guesses: IT looks the account up, sees the candidates and CONFIRMS one exact DN.
  * Only the confirmed DN is touched, and it is re-read and re-checked immediately before the change.
  * Protected accounts (admin groups, adminCount=1, krbtgt, built-ins, the Hub's own service account)
    are refused. Accounts are never deleted; the change is reversible (re-enable).
  * The result is verified by reading the account back (userAccountControl ACCOUNTDISABLE bit).
Use a dedicated service account with only delegated rights (see docs/ACTIVE_DIRECTORY.md).
"""
import secrets, ssl, string
from datetime import date
from . import config

ACCOUNTDISABLE = 0x0002
ATTRS = ['distinguishedName', 'sAMAccountName', 'displayName', 'employeeID', 'mail',
         'userAccountControl', 'memberOf', 'adminCount', 'description']
DEFAULT_PROTECTED = ['Domain Admins', 'Enterprise Admins', 'Schema Admins', 'Administrators', 'Account Operators',
                     'Server Operators', 'Backup Operators', 'Print Operators', 'Group Policy Creator Owners', 'DnsAdmins']


class DirectoryError(Exception):
    pass


def settings():
    g = config.env
    return {'url': g('AD_URL', ''), 'bind_dn': g('AD_BIND_DN', ''), 'password': g('AD_BIND_PASSWORD', ''),
            'base_dn': g('AD_BASE_DN', ''), 'disabled_ou': g('AD_DISABLED_OU', ''),
            'ca': g('AD_CA_CERT', ''), 'emp_attr': g('AD_EMPLOYEE_ID_ATTR', 'employeeID'),
            'dry_run': g('AD_DRY_RUN', 'true').lower() not in ('0', 'false', 'no'),
            'auto': g('AD_AUTO_DISABLE', 'false').lower() in ('1', 'true', 'yes'),
            'protected': [x.strip().lower() for x in (g('AD_PROTECTED_GROUPS') or ','.join(DEFAULT_PROTECTED)).split(',') if x.strip()],
            'protected_users': [x.strip().lower() for x in g('AD_PROTECTED_USERS', '').split(',') if x.strip()]}


def configured():
    s = settings()
    return bool(s['url'] and s['bind_dn'] and s['password'] and s['base_dn'])


def _cn(dn):
    return dn.split(',')[0].split('=', 1)[-1].strip().lower()


class LdapDirectory:
    def __init__(self, conn_factory=None, cfg=None):
        self.cfg = cfg or settings()
        self._factory = conn_factory or self._real_connection

    def _real_connection(self):
        from ldap3 import Connection, Server, Tls
        c = self.cfg
        if not c['url'].lower().startswith('ldaps://'):
            raise DirectoryError('AD_URL must use ldaps:// (an unencrypted bind would expose the service-account password)')
        tls = Tls(validate=ssl.CERT_REQUIRED, ca_certs_file=c['ca'] or None)
        return Connection(Server(c['url'], use_ssl=True, tls=tls, connect_timeout=8), user=c['bind_dn'], password=c['password'],
                          auto_bind=True, raise_exceptions=True, receive_timeout=15)

    # -- reading --------------------------------------------------------------
    def _entry(self, e):
        a = e['attributes']
        g = lambda k: (a.get(k)[0] if isinstance(a.get(k), list) and a.get(k) else a.get(k))
        uac = int(g('userAccountControl') or 0)
        groups = [_cn(x) for x in (a.get('memberOf') or [])]
        sam = str(g('sAMAccountName') or '')
        prot = (any(x in self.cfg['protected'] for x in groups) or str(g('adminCount') or '0') == '1'
                or sam.lower() in ('krbtgt', 'administrator', 'guest') or sam.lower() in self.cfg['protected_users']
                or _cn(self.cfg['bind_dn']) == _cn(e['dn']))
        return {'dn': e['dn'], 'sam': sam, 'display': str(g('displayName') or ''), 'employee_id': str(g(self.cfg['emp_attr']) or ''),
                'mail': str(g('mail') or ''), 'enabled': not (uac & ACCOUNTDISABLE), 'uac': uac, 'protected': prot,
                'description': str(g('description') or '')}

    def find(self, employee_id=None, username=None, name=None):
        """Candidate accounts, best match first. Exact matches only: employee ID, sAMAccountName, displayName."""
        from ldap3.utils.conv import escape_filter_chars as esc
        terms = []
        if employee_id:
            terms.append(f"({self.cfg['emp_attr']}={esc(employee_id)})")
        if username:
            terms.append(f"(sAMAccountName={esc(username)})")
        if name:
            terms.append(f"(displayName={esc(name)})")
        if not terms:
            return []
        flt = f"(&(objectCategory=person)(objectClass=user)(|{''.join(terms)}))"
        conn = self._factory()
        try:
            conn.search(self.cfg['base_dn'], flt, attributes=ATTRS, size_limit=10)
            found = [self._entry({'dn': r['dn'], 'attributes': r['attributes']}) for r in conn.response if r.get('type') == 'searchResEntry']
        finally:
            conn.unbind()

        def score(c):
            return (4 * bool(employee_id and c['employee_id'].lower() == str(employee_id).lower())
                    + 2 * bool(username and c['sam'].lower() == str(username).lower())
                    + 1 * bool(name and c['display'].lower() == str(name).lower()))
        for c in found:
            c['match'] = score(c)
        return sorted(found, key=lambda c: -c['match'])

    def get(self, dn):
        from ldap3 import BASE
        conn = self._factory()
        try:
            conn.search(dn, '(objectClass=*)', search_scope=BASE, attributes=ATTRS)
            rows = [r for r in conn.response if r.get('type') == 'searchResEntry']
        finally:
            conn.unbind()
        if not rows:
            raise DirectoryError('account no longer exists at that DN')
        return self._entry({'dn': rows[0]['dn'], 'attributes': rows[0]['attributes']})

    # -- changing -------------------------------------------------------------
    def disable(self, dn, note, expect_sam=None, dry_run=None):
        """Disable the account at `dn`. Returns {'ok','dry_run','actions','warnings','dn'}; raises DirectoryError if unsafe."""
        from ldap3 import MODIFY_REPLACE
        dry = self.cfg['dry_run'] if dry_run is None else dry_run
        e = self.get(dn)
        if e['protected']:
            raise DirectoryError(f"refused: {e['sam']} is a protected account")
        if expect_sam and e['sam'].lower() != expect_sam.lower():
            raise DirectoryError('refused: the account at that DN is not the one that was confirmed')
        actions = []
        if e['enabled']:
            actions.append('set ACCOUNTDISABLE on userAccountControl')
        else:
            actions.append('account already disabled (no change to userAccountControl)')
        actions.append('append note to description')
        actions.append('reset password to a random value (LDAPS)')
        if self.cfg['disabled_ou']:
            actions.append(f"move to {self.cfg['disabled_ou']}")
        out = {'ok': True, 'dry_run': dry, 'actions': actions, 'warnings': [], 'dn': dn, 'sam': e['sam']}
        if dry:
            return out
        conn = self._factory()
        try:
            mods = {'description': [(MODIFY_REPLACE, [((e['description'] + ' | ' if e['description'] else '') + note)[:1000]])]}
            if e['enabled']:
                mods['userAccountControl'] = [(MODIFY_REPLACE, [e['uac'] | ACCOUNTDISABLE])]
            conn.modify(dn, mods)
            if conn.result.get('result') != 0:
                raise DirectoryError(f"directory refused the change: {conn.result.get('description')}")
            try:                                        # best effort: needs "reset password" delegation + LDAPS
                pw = ''.join(secrets.choice(string.ascii_letters + string.digits + '!@#$%^&*') for _ in range(40))
                conn.extend.microsoft.modify_password(dn, pw)
            except Exception as ex:                      # noqa: BLE001 - never fail the disable over this
                out['warnings'].append(f'password reset skipped: {type(ex).__name__}')
            new_dn = dn
            if self.cfg['disabled_ou']:
                try:
                    rdn = dn.split(',')[0]
                    conn.modify_dn(dn, rdn, new_superior=self.cfg['disabled_ou'])
                    if conn.result.get('result') == 0:
                        new_dn = f"{rdn},{self.cfg['disabled_ou']}"
                    else:
                        out['warnings'].append('move to disabled OU skipped (not permitted)')
                except Exception as ex:                  # noqa: BLE001
                    out['warnings'].append(f'move skipped: {type(ex).__name__}')
        finally:
            conn.unbind()
        after = self.get(new_dn)                          # verify by reading it back
        if after['enabled']:
            raise DirectoryError('verification failed: the account is still enabled')
        out.update(dn=new_dn, verified=True)
        return out

    def enable(self, dn):
        from ldap3 import MODIFY_REPLACE
        e = self.get(dn)
        if e['protected']:
            raise DirectoryError('refused: protected account')
        conn = self._factory()
        try:
            conn.modify(dn, {'userAccountControl': [(MODIFY_REPLACE, [e['uac'] & ~ACCOUNTDISABLE])]})
            if conn.result.get('result') != 0:
                raise DirectoryError(f"directory refused the change: {conn.result.get('description')}")
        finally:
            conn.unbind()
        return not (not self.get(dn)['enabled'])


def default():
    return LdapDirectory() if configured() else None


def note_for(ref):
    return f'Disabled {date.today().isoformat()} by DAS Trust Hub (leaver case {ref})'
