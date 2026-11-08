import importlib.util, os, sqlite3, sys, pytest
from hub import db as _hubdb

PW = 'Correct-Horse-9!'

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
SSO_KEY = 'k' * 48


def load_app(name, relpath):
    """Import an app module by path (both apps are called app.py)."""
    path = os.path.join(ROOT, relpath)
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod          # Flask derives root_path/templates from this
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope='session')
def env(tmp_path_factory):
    d = tmp_path_factory.mktemp('data')
    os.environ.update({
        'ITAM_DB_PATH': str(d / 'itam.db'),
        'CYBERSHIELD_DB_PATH': str(d / 'cybershield.db'),
        'HUB_DB_PATH': str(d / 'hub.db'),
        'SSO_SECRET': SSO_KEY,
        'ITAM_SECRET_KEY': 'test-itam-secret',
        'SECRET_KEY': 'test-cs-secret',
        'HUB_SECRET_KEY': 'test-hub-secret',
    })
    return d


@pytest.fixture(scope='session')
def itam(env):
    m = load_app('itam_app', 'itam/app.py')
    m.init_db()
    m.app.config['TESTING'] = True
    return m


@pytest.fixture(scope='session')
def cs(env):
    m = load_app('cs_app', 'cybershield/app.py')
    m.init_db()
    m.app.config['TESTING'] = True
    return m


@pytest.fixture(scope='session')
def seeded(itam, cs, env):
    """Synthetic data in both source DBs: 2 holders (one trained, one not) + a joiner."""
    i = sqlite3.connect(itam.DB_PATH)
    i.execute("INSERT INTO assets (asset_tag,asset_name,asset_type,category,serial_number,location,status,assigned_to_name,department,warranty_expiry) VALUES ('T-1','Laptop A','Laptop','Hardware','SN1','HQ','Active — Assigned','Ama Mensah','IT','2099-01-01')")
    i.execute("INSERT INTO assets (asset_tag,asset_name,asset_type,category,serial_number,location,status,assigned_to_name,department,warranty_expiry) VALUES ('T-2','Laptop B','Laptop','Hardware','','HQ','Active — Assigned','Kofi Boateng','Finance','2020-01-01')")
    i.execute("INSERT INTO movement_log (asset_tag,action,performed_by) VALUES ('T-1','ASSIGN','admin')")
    i.commit(); i.close()
    c = sqlite3.connect(cs.DB)
    c.execute("INSERT INTO trainees (name,employee_id,department,track,started_at,deadline_at,completed_at,score) VALUES ('Mensah Ama','E1','IT','onboarding','2026-09-01T10:00:00','2026-09-06T10:00:00','2026-09-02T10:00:00',90)")
    c.execute("INSERT INTO trainees (name,employee_id,department,track,started_at,deadline_at) VALUES ('Kofi Boateng','E2','Finance','onboarding','2026-01-01T10:00:00','2026-01-06T10:00:00')")
    c.commit(); c.close()
    _hubdb.init()


@pytest.fixture(scope='session')
def app(env, seeded):
    from hub.app import create_app
    a = create_app(); a.config['TESTING'] = True
    return a


def _tok(c, path='/login'):
    c.get(path)
    with c.session_transaction() as s:
        return s['csrf']


def _login(app, user='admin', pw=PW):
    c = app.test_client()
    t = _tok(c)
    return c, c.post('/login', data={'username': user, 'password': pw, 'csrf_token': t})



def csrf(c):
    with c.session_transaction() as s:
        return s['csrf']
