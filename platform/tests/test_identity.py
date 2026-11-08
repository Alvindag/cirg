import sqlite3
import pytest
from hub import connectors, db, identity
from tests.conftest import csrf
from tests.test_lifecycle import mk


@pytest.fixture(scope='module')
def idata(itam, cs, app):
    i = sqlite3.connect(itam.DB_PATH)
    # two different people called "Kwame Asante", told apart only by employee ID
    i.execute("INSERT INTO assets (asset_tag,asset_name,asset_type,category,serial_number,location,status,assigned_to,assigned_to_name,assigned_employee_id) VALUES ('ID-1','Laptop','Laptop','Hardware','S1','HQ','Active — Assigned','kasante','Kwame Asante','E100')")
    i.execute("INSERT INTO assets (asset_tag,asset_name,asset_type,category,serial_number,location,status,assigned_to,assigned_to_name,assigned_employee_id) VALUES ('ID-2','Laptop','Laptop','Hardware','S2','HQ','Active — Assigned','kasante2','Kwame Asante','E200')")
    # a legacy asset with no employee ID, held under the AD username only
    i.execute("INSERT INTO assets (asset_tag,asset_name,asset_type,category,serial_number,location,status,assigned_to,assigned_to_name) VALUES ('ID-3','Phone','Phone','Hardware','S3','HQ','Active — Assigned','lboateng','Lydia Boateng')")
    i.execute("INSERT INTO onboarding (onb_ref,full_name,job_title,department,location,start_date,status,employee_id,ad_username) VALUES ('ONB-ID','Lydia Boateng','Clerk','Admin','HQ','2026-10-01','In Progress','E300','lboateng')")
    i.commit(); i.close()
    c = sqlite3.connect(cs.DB)
    c.execute("INSERT INTO trainees (name,employee_id,department,track,started_at,deadline_at,completed_at,score,cert_ref) VALUES ('Kwame Asante','E100','IT','onboarding','2026-09-01T10:00:00','2026-09-06T10:00:00','2026-09-02T10:00:00',95,'CERT-E100')")
    c.commit(); c.close()


def test_same_name_different_ids_are_not_merged(idata):
    rows = {p['key']: p for p in connectors.people()}
    assert rows['id:E100']['training'] == 'completed' and not rows['id:E100']['exposed']
    assert rows['id:E200']['exposed']                 # the *other* Kwame has no training, and is not covered by E100's certificate
    assert rows['id:E100']['quality'] == 'id' and rows['id:E200']['quality'] == 'id'


def test_username_resolves_legacy_asset_to_employee_id(idata):
    rows = {p['key']: p for p in connectors.people()}
    assert 'id:E300' in rows and rows['id:E300']['asset_count'] == 1       # asset had no ID; AD username linked it to onboarding's E300
    assert rows['id:E300']['quality'] in ('username', 'id')


def test_ambiguous_name_is_never_auto_joined(idata):
    r = identity.Resolver()
    assert r.key(None, None, 'Kwame Asante') == ('amb:' + connectors.norm_name('Kwame Asante'), 'ambiguous')
    assert connectors.assets_held('Kwame Asante') is None                   # refuses to guess who holds what
    assert connectors.assets_held('Kwame Asante', 'E200') == ['ID-2']       # but is exact with the ID
    assert connectors.assets_held('Kwame Asante', 'E100') == ['ID-1']


def test_registry_confirmation_resolves_a_legacy_name(app, idata):
    i = sqlite3.connect(connectors.config.itam_db_path())
    i.execute("INSERT INTO assets (asset_tag,asset_name,asset_type,category,serial_number,location,status,assigned_to,assigned_to_name) VALUES ('ID-4','Tablet','Tablet','Hardware','S4','HQ','Active — Assigned','tmensah','Theo Mensah')")
    i.commit(); i.close()
    rows, amb = identity.review()
    assert any(p['name'] == 'Theo Mensah' for p in rows)
    hr = mk(app, 'hr_id', 'hr')
    hr.post('/identity/confirm', data={'name': 'Theo Mensah', 'employee_id': 'e400', 'csrf_token': csrf(hr)})
    assert connectors.assets_held('Theo Mensah', 'E400') == ['ID-4']
    assert identity.Resolver().key(None, None, 'Theo Mensah') == ('id:E400', 'name->id')
    assert hr.get('/identity').status_code == 200
    mgr = mk(app, 'mgr_id', 'line_manager')
    assert mgr.get('/identity').status_code == 403


def test_leaver_asset_check_uses_employee_id(app, idata):
    hr = mk(app, 'hr_id2', 'hr')
    r = hr.post('/lifecycle/new', data={'person': 'Kwame Asante', 'employee_id': 'E200', 'last_day': '2099-01-01', 'reason': 'Resignation',
                                       'manager': 'hr_id2', 'csrf_token': csrf(hr)})
    ref = r.headers['Location'].rsplit('/', 1)[1]
    from hub import lifecycle
    assert lifecycle.get(ref)['assets_held'] == ['ID-2']                    # the right Kwame's laptop, not both


def test_hub_reads_an_older_itam_database_without_new_columns(tmp_path, monkeypatch):
    """A Hub started before ITAM was restarted must not silently see zero joiners/assets."""
    old = tmp_path / 'old_itam.db'
    c = sqlite3.connect(old)
    c.executescript('''CREATE TABLE onboarding (id INTEGER PRIMARY KEY, onb_ref TEXT, full_name TEXT, job_title TEXT, department TEXT,
                         location TEXT, start_date TEXT, status TEXT, ad_username TEXT);
                       CREATE TABLE assets (id INTEGER PRIMARY KEY, asset_tag TEXT, asset_name TEXT, asset_type TEXT, assigned_to TEXT,
                         assigned_to_name TEXT, department TEXT, status TEXT);
                       INSERT INTO onboarding (onb_ref,full_name,job_title,department,location,start_date,status) VALUES ('ONB-OLD','Old Timer','x','IT','HQ','2026-01-01','In Progress');
                       INSERT INTO assets (asset_tag,asset_name,asset_type,assigned_to,assigned_to_name,status) VALUES ('OLD-1','L','Laptop','otimer','Old Timer','Active — Assigned');''')
    c.commit(); c.close()
    monkeypatch.setenv('ITAM_DB_PATH', str(old))
    assert [j['name'] for j in connectors.joiners()] == ['Old Timer']
    assert connectors.assets_held('Old Timer') == ['OLD-1']
    assert any(p['name'] == 'Old Timer' and p['asset_count'] == 1 for p in connectors.people())
