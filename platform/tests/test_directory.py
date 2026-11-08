import pytest
from ldap3 import MOCK_SYNC, Connection, Server
from hub import controls, db, directory, ledger, lifecycle
from hub.directory import DirectoryError, LdapDirectory
from tests.conftest import csrf
from tests.test_lifecycle import mk

BASE = 'dc=das,dc=local'
CFG = {'url': 'ldaps://dc.das.local', 'bind_dn': 'cn=svc-hub,ou=Svc,' + BASE, 'password': 'pw', 'base_dn': BASE,
       'disabled_ou': 'ou=Disabled,' + BASE, 'ca': '', 'emp_attr': 'employeeID', 'dry_run': True, 'auto': False,
       'protected': ['domain admins'], 'protected_users': []}


def user(sam, name, emp, groups=(), uac=512, admin_count=0):
    return {'objectClass': ['top', 'person', 'user'], 'objectCategory': 'person', 'sAMAccountName': sam, 'displayName': name,
            'employeeID': emp, 'userAccountControl': uac, 'memberOf': list(groups), 'adminCount': admin_count}


@pytest.fixture()
def ad(monkeypatch):
    cfg = dict(CFG)
    srv = Server('mock')
    c0 = Connection(srv, user=cfg['bind_dn'], password='pw', client_strategy=MOCK_SYNC)
    c0.strategy.add_entry(cfg['bind_dn'], {'userPassword': 'pw', 'objectClass': 'user', 'sAMAccountName': 'svc-hub'})
    for dn, attrs in {'cn=Yaw Darko,ou=Staff,' + BASE: user('ydarko', 'Yaw Darko', 'E1'),
                      'cn=Yaw Darko2,ou=Staff,' + BASE: user('ydarko2', 'Yaw Darko', 'E9'),            # same display name, other person
                      'cn=Boss,ou=Staff,' + BASE: user('boss', 'Boss Person', 'E2', ['CN=Domain Admins,CN=Users,' + BASE]),
                      'cn=Svc Admin,ou=Staff,' + BASE: user('svcadm', 'Svc Admin', 'E3', admin_count=1)}.items():
        c0.strategy.add_entry(dn, attrs)

    def fac():
        c = Connection(srv, user=cfg['bind_dn'], password='pw', client_strategy=MOCK_SYNC)
        c.bind()
        return c
    d = LdapDirectory(fac, cfg)
    monkeypatch.setattr(directory, 'configured', lambda: True)
    monkeypatch.setattr(directory, 'default', lambda: d)
    monkeypatch.setattr(directory, 'settings', lambda: cfg)
    return d, cfg


def test_find_prefers_employee_id_and_is_exact(ad):
    d, _ = ad
    found = d.find(employee_id='E1', name='Yaw Darko')
    assert found[0]['sam'] == 'ydarko' and found[0]['match'] >= 5
    assert {x['sam'] for x in d.find(name='Yaw Darko')} == {'ydarko', 'ydarko2'}        # ambiguity is surfaced, not resolved
    assert d.find() == [] and d.find(name='Nobody Here') == []


def test_ldap_filter_injection_is_escaped(ad):
    d, _ = ad
    assert d.find(username='*)(objectClass=*') == []


def test_dry_run_is_default_and_changes_nothing(ad):
    d, cfg = ad
    dn = 'cn=Yaw Darko,ou=Staff,' + BASE
    r = d.disable(dn, 'note')
    assert r['dry_run'] and r['actions']
    assert d.get(dn)['enabled'] is True


def test_live_disable_verifies_moves_and_is_reversible(ad):
    d, cfg = ad
    cfg['dry_run'] = False
    dn = 'cn=Yaw Darko,ou=Staff,' + BASE
    r = d.disable(dn, 'Disabled by test', expect_sam='ydarko')
    assert r['ok'] and r['verified'] and r['dn'] == 'cn=Yaw Darko,ou=Disabled,' + BASE
    assert d.get(r['dn'])['enabled'] is False and 'Disabled by test' in d.get(r['dn'])['description']
    d.enable(r['dn'])
    assert d.get(r['dn'])['enabled'] is True


def test_protected_and_mismatched_accounts_are_refused(ad):
    d, cfg = ad
    cfg['dry_run'] = False
    for dn in ('cn=Boss,ou=Staff,' + BASE, 'cn=Svc Admin,ou=Staff,' + BASE, cfg['bind_dn']):
        with pytest.raises(DirectoryError, match='protected'):
            d.disable(dn, 'n')
    with pytest.raises(DirectoryError, match='not the one'):
        d.disable('cn=Yaw Darko,ou=Staff,' + BASE, 'n', expect_sam='someoneelse')
    assert d.get('cn=Yaw Darko,ou=Staff,' + BASE)['enabled'] is True


def test_ldap_must_be_ldaps():
    with pytest.raises(DirectoryError, match='ldaps'):
        LdapDirectory(cfg={**CFG, 'url': 'ldap://dc'})._real_connection()


def _case(app, who='Yaw Darko', emp='E1', last_day='2020-01-01'):
    # a past last day cannot be entered through the form (min=today), so create directly then load
    ref = lifecycle.create_case('hr_ad_' + emp, who, emp, 'Ops', 'Op', 'hr_ad_' + emp, last_day, 'Resignation')
    return ref


def test_full_ad_flow_and_role_gates(app, ad):
    d, cfg = ad
    ref = _case(app)
    it_staff, it_mgr, hr = mk(app, 'it_s_ad', 'it_staff'), mk(app, 'it_m_ad', 'it_manager'), mk(app, 'hr_ad_E1x', 'hr')
    assert hr.post(f'/lifecycle/{ref}/ad/lookup', data={'csrf_token': csrf(hr)}, follow_redirects=True).status_code == 200
    assert lifecycle.ad_lookup({'username': 'hr', 'role': 'hr'}, ref)[0] == 'forbidden'      # HR cannot query the directory
    st, found = lifecycle.ad_lookup({'username': 'it_s_ad', 'role': 'it_staff'}, ref)
    assert st == 'ok' and found[0]['sam'] == 'ydarko'
    assert lifecycle.ad_disable({'username': 'it_s_ad', 'role': 'it_staff'}, ref)[0] == 'forbidden'   # staff may look up/confirm, not disable
    assert lifecycle.ad_disable({'username': 'it_m_ad', 'role': 'it_manager'}, ref)[0] == 'not_confirmed'
    assert lifecycle.ad_confirm({'username': 'it_s_ad', 'role': 'it_staff'}, ref, 'cn=Boss,ou=Staff,' + BASE) == 'no_such_candidate'   # cannot confirm a stranger
    assert lifecycle.ad_confirm({'username': 'it_s_ad', 'role': 'it_staff'}, ref, found[0]['dn']) == 'ok'
    status, res = lifecycle.ad_disable({'username': 'it_m_ad', 'role': 'it_manager'}, ref)             # still dry-run
    assert status == 'ok' and res['dry_run'] and not lifecycle.get(ref)['ad_disabled_at']
    cfg['dry_run'] = False
    status, res = lifecycle.ad_disable({'username': 'it_m_ad', 'role': 'it_manager'}, ref)
    assert status == 'ok' and not res['dry_run'] and res['verified']
    c = lifecycle.get(ref)
    ad_step = next(s for s in c['steps'] if s['auto_key'] == 'ad')
    assert c['ad_disabled_at'] and ad_step['done'] and c['ad_dn'].endswith('ou=Disabled,' + BASE)
    assert not lifecycle.can_complete({'username': 'x', 'role': 'admin'}, c, ad_step)                   # cannot be ticked by hand once verified-auto
    acts = [r['action'] for r in ledger.recent(60)]
    assert {'AD_LOOKUP', 'AD_CONFIRM', 'AD_DISABLE_DRYRUN', 'AD_DISABLE'} <= set(acts)
    assert lifecycle.ad_reenable({'username': 'it_m_ad', 'role': 'it_manager'}, ref) == 'forbidden'    # only admin can undo
    assert lifecycle.ad_reenable({'username': 'adm', 'role': 'admin'}, ref) == 'ok'
    assert not lifecycle.get(ref)['ad_disabled_at']


def test_too_early_unless_admin_and_protected_cannot_be_confirmed(app, ad):
    d, cfg = ad
    ref = _case(app, 'Boss Person', 'E2', '2099-01-01')
    st, found = lifecycle.ad_lookup({'username': 'a', 'role': 'admin'}, ref)
    assert lifecycle.ad_confirm({'username': 'a', 'role': 'admin'}, ref, found[0]['dn']) == 'protected'
    ref2 = _case(app, 'Yaw Darko', 'E1', '2099-01-01')
    lifecycle.ad_confirm({'username': 'a', 'role': 'admin'}, ref2, d.find(employee_id='E1')[0]['dn'])
    assert lifecycle.ad_disable({'username': 'm', 'role': 'it_manager'}, ref2)[0] == 'too_early'


def test_step_is_manual_when_ad_not_configured(app, monkeypatch):
    monkeypatch.setattr(directory, 'configured', lambda: False)
    ref = _case(app, 'No Ad', 'E55', '2099-01-01')
    c = lifecycle.get(ref)
    s = next(s for s in c['steps'] if s['auto_key'] == 'ad')
    assert s['manual_fallback'] and lifecycle.can_complete({'username': 'i', 'role': 'it_staff'}, c, s)


def test_it_page_shows_ad_panel(app, ad):
    ref = _case(app, 'Yaw Darko', 'E1', '2099-02-02')
    it = mk(app, 'it_ui_ad', 'it_manager')
    html = it.get(f'/lifecycle/{ref}').get_data(as_text=True)
    assert 'DRY RUN' in html and 'Look up account in AD' in html
