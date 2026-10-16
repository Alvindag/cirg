import sqlite3
import pytest
from hub import auth, controls, db, lifecycle
from tests.conftest import PW, _login, csrf


def mk(app, name, role):
    auth.create_user(name, PW, role, must_change=False)
    c, r = _login(app, name)
    assert r.status_code == 302
    return c


def start(c, person='Kofi Boateng', last_day='2099-01-31', manager=None):
    data = {'person': person, 'last_day': last_day, 'reason': 'Resignation', 'department': 'Finance', 'csrf_token': csrf(c)}
    if manager:
        data['manager'] = manager
    return c.post('/lifecycle/new', data=data)


def test_line_manager_starts_and_sees_only_own_cases(app):
    m1, m2 = mk(app, 'mgr1', 'line_manager'), mk(app, 'mgr2', 'line_manager')
    r = start(m1, 'Ama Mensah')
    assert r.status_code == 302
    ref = r.headers['Location'].rsplit('/', 1)[1]
    assert m1.get('/lifecycle/' + ref).status_code == 200
    assert m2.get('/lifecycle/' + ref).status_code == 404         # hidden, not just forbidden
    assert ref not in m2.get('/lifecycle').get_data(as_text=True)
    assert m1.get('/').headers['Location'].endswith('/lifecycle')  # no org-wide dashboard for managers
    assert m1.get('/compliance').status_code == 403
    assert m1.get('/ledger').status_code == 403


def test_hr_sees_all_and_can_start_for_a_manager(app):
    hr = mk(app, 'hr1', 'hr')
    assert start(hr, 'Esi Owusu', manager='mgr1').status_code == 302
    assert 'Esi Owusu' in hr.get('/lifecycle').get_data(as_text=True)
    assert 'Ama Mensah' in hr.get('/lifecycle').get_data(as_text=True)
    assert start(hr, 'Bad Mgr', manager='nobody').status_code == 200   # rejected, form re-shown
    assert start(hr, 'Bad Date', last_day='31/01/2099').status_code == 200


def test_step_ownership_enforced(app):
    ref = [c for c in lifecycle.cases() if c['person_name'] == 'Esi Owusu'][0]
    sid = {s['seq']: s['id'] for s in ref['steps']}
    it = mk(app, 'it1', 'it_staff')
    mgr = mk(app, 'mgr3', 'line_manager')
    r = lambda c, seq: c.post(f"/lifecycle/{ref['ref']}/step/{sid[seq]}", data={'csrf_token': csrf(c)}, follow_redirects=True).get_data(as_text=True)
    assert 'cannot complete' in r(it, 1)                         # manager step: IT may not
    assert 'cannot complete' in r(it, 2)                         # HR step
    assert 'recorded' in r(it, 7)                                # IT step (mailbox): allowed
    assert 'recorded' in r(mk(app, 'hr2', 'hr'), 2)             # HR step
    assert mgr.get('/lifecycle/' + ref['ref']).status_code == 404   # unrelated manager can't even see it


def test_manager_cannot_complete_other_managers_case_steps_but_can_own(app):
    case = [c for c in lifecycle.cases() if c['person_name'] == 'Ama Mensah'][0]
    m1 = _login(app, 'mgr1')[0]
    sid = case['steps'][0]['id']
    assert 'recorded' in m1.post(f"/lifecycle/{case['ref']}/step/{sid}", data={'csrf_token': csrf(m1)}, follow_redirects=True).get_data(as_text=True)


def test_asset_return_is_verified_from_itam_not_ticked(app, itam):
    hr = mk(app, 'hr3', 'hr')
    ref = start(hr, 'Kofi Boateng', manager='mgr1').headers['Location'].rsplit('/', 1)[1]
    c = lifecycle.get(ref)
    auto = next(s for s in c['steps'] if s['auto_key'] == 'assets')
    assert not auto['done'] and c['assets_held']                  # Kofi still holds T-2 in ITAM
    admin_like = mk(app, 'adm9', 'admin')
    assert 'cannot complete' in admin_like.post(f"/lifecycle/{ref}/step/{auto['id']}", data={'csrf_token': csrf(admin_like)}, follow_redirects=True).get_data(as_text=True)
    for s in c['steps']:                                          # finish every manual step
        if s['auto_key'] != 'assets':                              # AD/training fall back to manual when not integrated
            admin_like.post(f"/lifecycle/{ref}/step/{s['id']}", data={'csrf_token': csrf(admin_like)})
    assert 'Complete every step' in hr.post(f'/lifecycle/{ref}/close', data={'csrf_token': csrf(hr)}, follow_redirects=True).get_data(as_text=True)
    i = sqlite3.connect(itam.DB_PATH)                              # IT returns the laptop in ITAM
    i.execute("UPDATE assets SET status='Active — Unassigned', assigned_to_name=NULL WHERE asset_tag='T-2'"); i.commit(); i.close()
    assert lifecycle.get(ref)['open_steps'] == 0
    assert 'Case closed' in hr.post(f'/lifecycle/{ref}/close', data={'csrf_token': csrf(hr)}, follow_redirects=True).get_data(as_text=True)
    i = sqlite3.connect(itam.DB_PATH)                              # restore for other tests
    i.execute("UPDATE assets SET status='Active — Assigned', assigned_to_name='Kofi Boateng' WHERE asset_tag='T-2'"); i.commit(); i.close()


def test_leaver_past_last_day_with_assets_is_flagged(app):
    hr = mk(app, 'hr4', 'hr')
    conn = db.connect()
    conn.execute("INSERT INTO lifecycle_cases (ref,person_name,manager_username,last_day,reason,created_by) VALUES ('LVR-T-1','Kofi Boateng','mgr1','2020-01-01','Resignation','hr4')")
    cid = conn.execute("SELECT id FROM lifecycle_cases WHERE ref='LVR-T-1'").fetchone()[0]
    conn.execute("INSERT INTO lifecycle_steps (case_id,seq,title,owner_role,due_date,auto_key) VALUES (?,1,'assets','it','2020-01-01','assets')", (cid,))
    conn.commit(); conn.close()
    by = {i['id']: i for i in controls.evaluate()[0]}
    assert by['AC-16']['status'] == 'fail' and 'LVR-T-1' in by['AC-16']['evidence']
    assert by['AC-15']['status'] in ('na', 'pass', 'partial', 'fail')


def test_joiners_view(app, itam):
    i = sqlite3.connect(itam.DB_PATH)
    i.execute("INSERT INTO onboarding (onb_ref,full_name,job_title,department,location,start_date,status) VALUES ('ONB-1','New Starter','Analyst','IT','HQ','2020-01-01','In Progress')")
    i.commit(); i.close()
    from hub import connectors
    j = [x for x in connectors.joiners() if x['name'] == 'New Starter'][0]
    assert j['training'] == 'not_enrolled' and j['late']
    assert controls.evaluate()[0][[x['id'] for x in controls.evaluate()[0]].index('AC-15')]['status'] == 'fail'


def test_withdraw_case_hr_only_with_reason_and_sealed(app):
    from hub import ledger
    mgr = mk(app, 'mgr_wd', 'line_manager')
    hr = mk(app, 'hr_wd', 'hr')
    ref = start(mgr, 'Wrong Person').headers['Location'].rsplit('/', 1)[1]
    assert 'Only HR' in mgr.post(f'/lifecycle/{ref}/cancel', data={'reason': 'raised in error by me', 'csrf_token': csrf(mgr)}, follow_redirects=True).get_data(as_text=True)
    assert 'at least 10' in hr.post(f'/lifecycle/{ref}/cancel', data={'reason': 'oops', 'csrf_token': csrf(hr)}, follow_redirects=True).get_data(as_text=True)
    assert 'withdrawn' in hr.post(f'/lifecycle/{ref}/cancel', data={'reason': 'Raised for the wrong employee', 'csrf_token': csrf(hr)}, follow_redirects=True).get_data(as_text=True).lower()
    assert lifecycle.get(ref)['status'] == 'cancelled'
    assert any(r['action'] == 'LEAVER_CANCEL' and ref in r['detail'] for r in ledger.recent(30))
    assert hr.post(f'/lifecycle/{ref}/cancel', data={'reason': 'Raised for the wrong employee', 'csrf_token': csrf(hr)}).status_code == 404   # no longer open
    # a withdrawn case must not count as an at-risk leaver
    by = {i['id']: i for i in controls.evaluate()[0]}
    assert ref not in by['AC-16']['evidence']
