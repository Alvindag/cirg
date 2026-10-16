"""Regression/smoke tests: the original apps must keep working after hardening."""
from common import sso


def test_itam_login_and_pages(itam):
    c = itam.app.test_client()
    assert c.post('/login', data={'username': 'admin', 'password': 'admin123'}).status_code == 302
    for url in ['/', '/assets', '/repairs', '/software', '/reports', '/people',
                '/onboarding', '/log', '/users', '/assets/new']:
        assert c.get(url).status_code == 200, url


def test_itam_rejects_bad_login(itam):
    c = itam.app.test_client()
    r = c.post('/login', data={'username': 'admin', 'password': 'wrong'})
    assert b'Invalid username or password' in r.data


def test_itam_security_headers_and_cookie(itam):
    r = itam.app.test_client().get('/login')
    assert r.headers['X-Content-Type-Options'] == 'nosniff'
    assert itam.app.config['SESSION_COOKIE_NAME'] == 'itam_session'
    assert itam.app.secret_key == 'test-itam-secret'


def test_cs_pages_and_admin_gate(cs):
    c = cs.app.test_client()
    assert c.get('/').status_code == 200
    assert c.get('/admin').status_code == 302       # not logged in
    assert cs.app.config['SESSION_COOKIE_NAME'] == 'cybershield_session'


def test_cs_admin_login_works(cs):
    c = cs.app.test_client()
    c.get('/admin/login')
    with c.session_transaction() as s:
        tok = s.get('csrf_token')
    # default seeded admin must still be able to sign in (forces password change)
    r = c.post('/admin/login', data={'username': 'admin', 'password': 'Admin@DAS2026!'})
    assert r.status_code == 302


def test_itam_sso_roundtrip_and_replay(itam):
    c = itam.app.test_client()
    t = sso.sign('alice', 'auditor', 'itam')
    assert c.get('/sso?ticket=' + t).status_code == 302
    assert c.get('/').status_code == 200
    assert c.get('/users').status_code == 302          # auditor -> readonly: no user mgmt
    assert itam.app.test_client().get('/sso?ticket=' + t).status_code == 403   # replay


def test_sso_audience_and_tamper(itam, cs):
    t = sso.sign('bob', 'admin', 'cybershield')
    assert itam.app.test_client().get('/sso?ticket=' + t).status_code == 403   # wrong audience
    assert cs.app.test_client().get('/sso?ticket=' + t[:-2] + 'xx').status_code == 403
    t2 = sso.sign('bob', 'readonly', 'cybershield')
    assert cs.app.test_client().get('/sso?ticket=' + t2).status_code == 403    # role not allowed


def test_cs_sso_admin(cs):
    c = cs.app.test_client()
    assert c.get('/sso?ticket=' + sso.sign('carol', 'admin', 'cybershield')).status_code == 302
    assert c.get('/admin').status_code == 200


def test_itam_pages_render_for_assets_with_warranty_dates(itam):
    """Regression: macros could not see days_until, so /assets and /assets/<id> returned 500 once an asset had a warranty date."""
    import sqlite3
    conn = sqlite3.connect(itam.DB_PATH)
    conn.execute("INSERT INTO assets (asset_tag,asset_name,asset_type,category,serial_number,location,status,warranty_expiry) "
                 "VALUES ('W-1','Warranty laptop','Laptop','Hardware','SNW1','HQ','Active — Unassigned','2099-01-01')")
    conn.execute("INSERT INTO assets (asset_tag,asset_name,asset_type,category,serial_number,location,status,warranty_expiry) "
                 "VALUES ('W-2','Expired laptop','Laptop','Hardware','SNW2','HQ','Active — Unassigned','2020-01-01')")
    conn.commit()
    aid = conn.execute("SELECT id FROM assets WHERE asset_tag='W-2'").fetchone()[0]
    conn.close()
    c = itam.app.test_client()
    c.post('/login', data={'username': 'admin', 'password': 'admin123'})
    assert c.get('/assets').status_code == 200
    r = c.get(f'/assets/{aid}')
    assert r.status_code == 200 and b'Expired' in r.data
    assert c.get('/').status_code == 200


def test_itam_new_layout_has_palette_icons_and_no_emoji_nav(itam):
    c = itam.app.test_client()
    c.post('/login', data={'username': 'admin', 'password': 'admin123'})
    html = c.get('/').get_data(as_text=True)
    assert 'id="cmdk-back"' in html and 'class="mesh"' in html and '<svg class="ic' in html
    assert 'js/ui.js' in html and 'Geist' in c.get('/static/css/style.css').get_data(as_text=True)
    assert c.get('/static/fonts/GeistVF.woff').status_code == 200
