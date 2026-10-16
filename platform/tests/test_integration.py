import sqlite3, pytest
from hub import connectors, integration, ledger
from tests.conftest import csrf
from tests.test_lifecycle import mk

TOKEN = 'i' * 48


@pytest.fixture(scope='module')
def wired(itam, cs, monkeypatch_module):
    monkeypatch_module.setenv('INTEGRATION_TOKEN', TOKEN)
    clients = {'http://itam.test': itam.app.test_client(), 'http://cs.test': cs.app.test_client()}
    monkeypatch_module.setenv('ITAM_INTERNAL_URL', 'http://itam.test')
    monkeypatch_module.setenv('CYBERSHIELD_INTERNAL_URL', 'http://cs.test')

    def fake_post(base, path, payload):
        r = clients[base].post(path, json=payload, headers={'Authorization': 'Bearer ' + integration.token()})
        return r.status_code, (r.get_json(silent=True) or {})
    monkeypatch_module.setattr(integration, '_post', fake_post)
    i = sqlite3.connect(itam.DB_PATH)
    i.execute("INSERT INTO onboarding (onb_ref,full_name,job_title,department,location,start_date,status) VALUES ('ONB-INT','Efua Quaye','Analyst','Finance','HQ','2026-10-10','In Progress')")
    oid = i.execute("SELECT id FROM onboarding WHERE onb_ref='ONB-INT'").fetchone()[0]
    i.execute("INSERT INTO onboarding_checklist (onboarding_id,category,item_name,status) VALUES (?, 'IT Security','Phishing and email security awareness briefing','Pending')", (oid,))
    i.commit(); i.close()
    return clients


@pytest.fixture(scope='module')
def monkeypatch_module():
    from _pytest.monkeypatch import MonkeyPatch
    m = MonkeyPatch(); yield m; m.undo()


def trainees(cs):
    c = sqlite3.connect(cs.DB); c.row_factory = sqlite3.Row
    rows = c.execute("SELECT * FROM trainees WHERE LOWER(name)='efua quaye'").fetchall(); c.close(); return rows


def test_endpoints_reject_without_token(itam, cs, monkeypatch):
    monkeypatch.setenv('INTEGRATION_TOKEN', TOKEN)
    assert cs.app.test_client().post('/api/hub/enrol', json={'name': 'X'}).status_code == 401
    assert cs.app.test_client().post('/api/hub/enrol', json={'name': 'X'}, headers={'Authorization': 'Bearer wrong' + 'x' * 40}).status_code == 401
    assert itam.app.test_client().post('/api/hub/onboarding/training-complete', json={}).status_code == 401
    monkeypatch.delenv('INTEGRATION_TOKEN')
    assert cs.app.test_client().post('/api/hub/enrol', json={'name': 'X'}, headers={'Authorization': 'Bearer ' + TOKEN}).status_code == 401  # disabled when unset


def test_disabled_without_token(monkeypatch):
    monkeypatch.delenv('INTEGRATION_TOKEN', raising=False)
    assert integration.run()['enabled'] is False


def test_auto_enrol_then_cert_sync_end_to_end(wired, cs, itam):
    assert connectors.joiners() and [j for j in connectors.joiners() if j['name'] == 'Efua Quaye'][0]['training'] == 'not_enrolled'
    r = integration.run('tester')
    assert r['enrolled'] == 1 and r['errors'] == 0
    rows = trainees(cs)
    assert len(rows) == 1 and rows[0]['hub_enrolled'] == 1 and rows[0]['deadline_at']
    assert integration.run('tester')['enrolled'] == 0                    # idempotent: no duplicate
    assert len(trainees(cs)) == 1
    # the joiner opens the course and is resumed on the pre-created record, not given a second one
    c = cs.app.test_client(); c.get('/')
    with c.session_transaction() as s:
        tok = s.get('csrf_token')
    c.post('/start', data={'name': 'efua quaye', 'employee_id': 'E9', 'department': 'Finance', 'track': 'onboarding', 'csrf_token': tok})
    assert len(trainees(cs)) == 1
    # joiner passes: CyberShield stamps the certificate
    db = sqlite3.connect(cs.DB)
    db.execute("UPDATE trainees SET completed_at=datetime('now'), score=92, cert_ref='CERT-DAS-TEST-1' WHERE LOWER(name)='efua quaye'")
    db.commit(); db.close()
    assert connectors.onboarding_training_item_done('ONB-INT') is False
    r = integration.run('tester')
    assert r['synced'] == 1
    assert connectors.onboarding_training_item_done('ONB-INT') is True
    assert integration.run('tester')['synced'] == 0                      # idempotent
    i = sqlite3.connect(itam.DB_PATH)
    note = i.execute("SELECT notes, completed_by FROM onboarding_checklist WHERE item_name LIKE '%awareness briefing%' AND notes LIKE '%CERT-DAS-TEST-1%'").fetchone()
    assert note and 'CyberShield' in note[1]
    assert i.execute("SELECT COUNT(*) FROM audit_log WHERE action='TRAINING_SYNC'").fetchone()[0] == 1
    i.close()
    acts = [r['action'] for r in ledger.recent(50)]
    assert 'AUTO_ENROL' in acts and 'CERT_SYNC' in acts
    assert ledger.verify()['ok']


def test_hub_button_permissions(app, wired):
    hr = mk(app, 'hr_int', 'hr')
    assert 'Auto-enrolled' in hr.post('/lifecycle/integrate', data={'csrf_token': csrf(hr)}, follow_redirects=True).get_data(as_text=True)
    mgr = mk(app, 'mgr_int', 'line_manager')
    assert mgr.post('/lifecycle/integrate', data={'csrf_token': csrf(mgr)}).status_code == 403
