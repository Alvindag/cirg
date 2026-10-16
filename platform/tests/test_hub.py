import re, sqlite3
import pytest
from hub import auth, connectors, controls, db, ledger
from tests.conftest import PW, _login, _tok, csrf

@pytest.fixture(scope='module')
def admin(app):
    auth.create_user('boss', PW, 'admin', must_change=False)
    c, r = _login(app, 'boss')
    assert r.status_code == 302
    return c


def test_cross_system_name_matching():
    assert connectors.norm_name('Mensah  Ama') == connectors.norm_name('ama MENSAH')


def test_exposure_join(seeded):
    rows = {p['name']: p for p in connectors.people()}
    assert not rows['Ama Mensah']['exposed'] and rows['Ama Mensah']['training'] == 'completed'
    assert rows['Kofi Boateng']['exposed']


def test_controls_flag_real_gaps(seeded):
    items, summ = controls.evaluate()
    by = {i['id']: i for i in items}
    assert by['AC-01']['status'] != 'pass'            # one hardware asset lacks a serial
    assert by['AC-09']['status'] == 'fail'            # 1 of 2 holders untrained
    assert by['AC-12']['status'] == 'fail'            # shipped default passwords exist
    assert by['MC-02']['status'] == 'unassessed'      # manual, nothing attested
    assert 0 <= summ['overall'] <= 100


def test_attestation_needs_evidence_and_counts(app, admin):
    r = admin.post('/compliance/MC-01', data={'status': 'implemented', 'evidence': 'x', 'csrf_token': csrf(admin)})
    assert r.status_code == 302
    assert {i['id']: i for i in controls.evaluate()[0]}['MC-01']['status'] == 'unassessed'
    admin.post('/compliance/MC-01', data={'status': 'implemented', 'owner': 'CISO',
               'evidence': 'ISMS policy v3 approved 2026-01-10, stored in SharePoint', 'csrf_token': csrf(admin)})
    assert {i['id']: i for i in controls.evaluate()[0]}['MC-01']['status'] == 'pass'


def test_expired_review_downgrades(app):
    conn = db.connect()
    conn.execute("UPDATE attestations SET review_due='2020-01-01' WHERE control_id='MC-01'"); conn.commit(); conn.close()
    assert {i['id']: i for i in controls.evaluate()[0]}['MC-01']['status'] == 'partial'


def test_ledger_chain_and_source_tamper_detection(itam, cs, seeded):
    itam_conn = sqlite3.connect(itam.DB_PATH)
    itam_conn.execute("INSERT INTO audit_log (username,action,detail,ip_address) VALUES ('admin','ASSET_EDIT','T-1','1.2.3.4')")
    itam_conn.commit()
    added = ledger.sync()
    assert added['itam'] >= 1
    assert ledger.verify()['ok']
    # attacker edits a source audit row after it was sealed
    itam_conn.execute("UPDATE audit_log SET detail='nothing to see' WHERE action='ASSET_EDIT'"); itam_conn.commit()
    v = ledger.verify()
    assert not v['ok'] and any('modified' in p for p in v['problems'])
    itam_conn.execute("DELETE FROM audit_log WHERE action='ASSET_EDIT'"); itam_conn.commit()
    assert any('deleted' in p for p in ledger.verify()['problems'])
    itam_conn.close()
    # restore state for later tests: re-insert identical row is impossible, so drop the sealed entry's source id
    conn = db.connect()
    conn.execute("DELETE FROM ledger WHERE source='itam'"); conn.execute("DELETE FROM ledger_cursor")
    conn.commit(); conn.close()
    # rebuild chain integrity after deliberate surgery
    conn = db.connect(); rows = conn.execute('SELECT * FROM ledger ORDER BY id').fetchall(); conn.execute('DELETE FROM ledger')
    conn.commit(); conn.close()
    for r in rows:
        c2 = db.connect(); ledger.append(c2, r['source'], r['actor'], r['action'], r['detail'], r['source_id'], r['ts']); c2.commit(); c2.close()
    assert ledger.verify()['ok']


def test_ledger_detects_edit_inside_hub(app):
    ledger.log('tester', 'EVENT', 'original')
    conn = db.connect(); conn.execute("UPDATE ledger SET detail='forged' WHERE action='EVENT'"); conn.commit(); conn.close()
    assert not ledger.verify()['ok']
    conn = db.connect(); conn.execute("UPDATE ledger SET detail='original' WHERE action='EVENT'"); conn.commit(); conn.close()
    assert ledger.verify()['ok']


def test_pages_render_for_admin(admin):
    for u in ['/', '/exposure', '/exposure?f=all', '/compliance', '/compliance?fw=cis', '/compliance/AC-01', '/compliance/MC-02',
              '/ledger', '/users', '/account', '/reports/compliance', '/reports/compliance.csv', '/ledger.csv', '/api/v1/summary']:
        assert admin.get(u).status_code == 200, u


def test_unauthenticated_redirects_and_api_locked(app):
    c = app.test_client()
    assert c.get('/').status_code == 302 and c.get('/ledger').status_code == 302
    assert c.get('/api/v1/summary').status_code == 401
    assert c.get('/health').status_code == 200


def test_csrf_enforced(admin):
    assert admin.post('/sync', data={}).status_code == 400


def test_rbac_readonly_cannot_export_or_attest(app):
    auth.create_user('viewer1', PW, 'readonly', must_change=False)
    c, _ = _login(app, 'viewer1')
    assert c.get('/').status_code == 200
    assert c.get('/ledger').status_code == 403
    assert c.get('/reports/compliance').status_code == 403
    assert c.post('/compliance/MC-03', data={'status': 'implemented', 'evidence': 'long enough evidence here', 'csrf_token': csrf(c)}).status_code == 403
    assert c.get('/users').status_code == 403


def test_lockout_after_failures(app):
    auth.create_user('lockme', PW, 'readonly', must_change=False)
    for _ in range(auth.MAX_FAILS):
        _login(app, 'lockme', 'wrong-password')
    c, r = _login(app, 'lockme', PW)
    assert r.status_code == 200 and b'locked' in r.data.lower()


def test_open_redirect_blocked(app):
    auth.create_user('redir', PW, 'readonly', must_change=False)
    c = app.test_client(); t = _tok(c)
    r = c.post('/login?next=//evil.example', data={'username': 'redir', 'password': PW, 'csrf_token': t})
    assert r.headers['Location'].endswith('/')  and 'evil' not in r.headers['Location']


def test_must_change_password_gate_and_policy(app):
    auth.create_user('newbie', PW, 'readonly', must_change=True)
    c, _ = _login(app, 'newbie')
    assert c.get('/').headers['Location'].endswith('/account')
    r = c.post('/account', data={'act': 'password', 'current': PW, 'new': 'short', 'confirm': 'short', 'csrf_token': csrf(c)}, follow_redirects=True)
    assert b'Password must have' in r.data
    c.post('/account', data={'act': 'password', 'current': PW, 'new': 'An0ther-Strong-Pass', 'confirm': 'An0ther-Strong-Pass', 'csrf_token': csrf(c)})
    assert c.get('/').status_code == 200


def test_mfa_flow(app):
    auth.create_user('mfauser', PW, 'it_manager', must_change=False)
    c, _ = _login(app, 'mfauser')
    c.post('/account', data={'act': 'mfa_start', 'csrf_token': csrf(c)})
    conn = db.connect(); secret = conn.execute("SELECT totp_secret FROM users WHERE username='mfauser'").fetchone()[0]; conn.close()
    assert c.post('/account', data={'act': 'mfa_confirm', 'code': '000000', 'csrf_token': csrf(c)}).status_code == 302
    c.post('/account', data={'act': 'mfa_confirm', 'code': auth.totp_now(secret), 'csrf_token': csrf(c)})
    c2, r = _login(app, 'mfauser')
    assert r.headers['Location'].endswith('/login/mfa')
    assert c2.get('/').status_code == 302                            # not yet signed in
    bad = c2.post('/login/mfa', data={'code': '111111', 'csrf_token': csrf(c2)})
    assert bad.status_code == 200
    ok = c2.post('/login/mfa', data={'code': auth.totp_now(secret), 'csrf_token': csrf(c2)})
    assert ok.status_code == 302 and c2.get('/').status_code == 200
    assert c2.post('/account', data={'act': 'mfa_disable', 'csrf_token': csrf(c2)}).status_code == 302
    conn = db.connect(); assert conn.execute("SELECT mfa_enabled FROM users WHERE username='mfauser'").fetchone()[0] == 1; conn.close()


def test_csv_formula_injection_neutralised():
    from hub.app import _csv_safe
    assert _csv_safe('=cmd|calc').startswith("'") and _csv_safe('ok') == 'ok'


def test_sso_launch_to_itam(admin, itam):
    r = admin.get('/launch/itam')
    assert r.status_code == 302 and '/sso?ticket=' in r.headers['Location']
    ticket = re.search(r'ticket=(.+)$', r.headers['Location']).group(1)
    assert itam.app.test_client().get('/sso?ticket=' + ticket).status_code == 302


def test_api_bearer_token(app, monkeypatch):
    monkeypatch.setenv('HUB_API_TOKEN', 't' * 40)
    c = app.test_client()
    r = c.get('/api/v1/summary', headers={'Authorization': 'Bearer ' + 't' * 40})
    assert r.status_code == 200 and 'score' in r.json
    assert c.get('/api/v1/summary', headers={'Authorization': 'Bearer wrong'}).status_code == 401
