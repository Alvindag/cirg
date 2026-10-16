import importlib.util, os, sys, pytest

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
