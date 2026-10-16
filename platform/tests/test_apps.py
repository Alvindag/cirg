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


def test_itam_onboarding_writes_need_the_onboarding_permission(itam):
    """Read-only users may look at onboarding but not create records or tick checklist items."""
    import sqlite3
    admin = itam.app.test_client()
    admin.post('/login', data={'username': 'admin', 'password': 'admin123'})
    r = admin.post('/onboarding/new', data={'full_name': 'Perm Test', 'job_title': 'Clerk', 'department': 'Finance & Accounts', 'location': 'NIA — HQ'})
    assert r.status_code == 302
    conn = sqlite3.connect(itam.DB_PATH)
    oid = conn.execute("SELECT id FROM onboarding WHERE full_name='Perm Test'").fetchone()[0]
    item = conn.execute("SELECT id FROM onboarding_checklist WHERE onboarding_id=? ORDER BY id LIMIT 1", (oid,)).fetchone()[0]
    n_before = conn.execute("SELECT COUNT(*) FROM onboarding").fetchone()[0]
    conn.close()
    viewer = itam.app.test_client()
    viewer.post('/login', data={'username': 'viewer', 'password': 'viewer123'})
    assert viewer.get('/onboarding').status_code == 200                  # may look
    assert viewer.get(f'/onboarding/{oid}').status_code == 200
    viewer.post('/onboarding/new', data={'full_name': 'Sneaky', 'job_title': 'x', 'department': 'Finance & Accounts', 'location': 'NIA — HQ'})
    viewer.post(f'/onboarding/{oid}/checklist/{item}/update', data={'status': 'Complete'})
    viewer.post(f'/onboarding/{oid}/set-status', data={'status': 'Completed'})
    conn = sqlite3.connect(itam.DB_PATH)
    assert conn.execute("SELECT COUNT(*) FROM onboarding").fetchone()[0] == n_before
    assert conn.execute("SELECT status FROM onboarding_checklist WHERE id=?", (item,)).fetchone()[0] == 'Pending'
    assert conn.execute("SELECT status FROM onboarding WHERE id=?", (oid,)).fetchone()[0] == 'In Progress'
    conn.close()
    # HR and IT staff still can
    for user, pw in (('hr_officer', 'hr123'), ('it_staff', 'staff123')):
        c = itam.app.test_client(); c.post('/login', data={'username': user, 'password': pw})
        c.post(f'/onboarding/{oid}/checklist/{item}/update', data={'status': 'In Progress', 'notes': user})
        conn = sqlite3.connect(itam.DB_PATH)
        assert conn.execute("SELECT status FROM onboarding_checklist WHERE id=?", (item,)).fetchone()[0] == 'In Progress'
        conn.close()


def test_itam_new_form_states_the_real_checklist_size(itam):
    c = itam.app.test_client(); c.post('/login', data={'username': 'admin', 'password': 'admin123'})
    html = c.get('/onboarding/new').get_data(as_text=True)
    n_items, n_ind = len(itam.default_checklist()), len(itam.default_induction(''))
    assert f'{n_items} checklist items' in html and f'{n_ind}-session induction' in html and 'Equipment' not in html.split('auto-generate')[1][:300]


def test_itam_onboarding_na_items_and_cancelled_sessions_do_not_block_completion(itam):
    """An item marked N/A (e.g. Business Central 'if required') used to keep the record below 100% forever."""
    import sqlite3
    c = itam.app.test_client(); c.post('/login', data={'username': 'admin', 'password': 'admin123'})
    c.post('/onboarding/new', data={'full_name': 'NA Test', 'job_title': 'Clerk', 'department': 'Finance & Accounts', 'location': 'NIA — HQ'})
    conn = sqlite3.connect(itam.DB_PATH); conn.row_factory = sqlite3.Row
    oid = conn.execute("SELECT id FROM onboarding WHERE full_name='NA Test'").fetchone()['id']
    items = [r['id'] for r in conn.execute("SELECT id FROM onboarding_checklist WHERE onboarding_id=? ORDER BY id", (oid,))]
    sessions = [r['id'] for r in conn.execute("SELECT id FROM onboarding_induction WHERE onboarding_id=? ORDER BY id", (oid,))]
    conn.close()
    c.post(f'/onboarding/{oid}/checklist/{items[0]}/update', data={'status': 'N/A', 'notes': 'not required'})
    c.post(f'/onboarding/{oid}/induction/{sessions[0]}/update', data={'status': 'Cancelled'})
    for i in items[1:]:
        c.post(f'/onboarding/{oid}/checklist/{i}/update', data={'status': 'Complete'})
    for sid in sessions[1:-1]:
        c.post(f'/onboarding/{oid}/induction/{sid}/update', data={'status': 'Completed'})
    conn = sqlite3.connect(itam.DB_PATH); conn.row_factory = sqlite3.Row
    assert itam.onboarding_progress(conn, oid) < 100                      # last induction session still open
    assert conn.execute("SELECT status FROM onboarding WHERE id=?", (oid,)).fetchone()['status'] == 'In Progress'
    conn.close()
    c.post(f'/onboarding/{oid}/induction/{sessions[-1]}/update', data={'status': 'Completed'})   # last open item is an induction session
    conn = sqlite3.connect(itam.DB_PATH); conn.row_factory = sqlite3.Row
    assert itam.onboarding_progress(conn, oid) == 100
    assert conn.execute("SELECT status FROM onboarding WHERE id=?", (oid,)).fetchone()['status'] == 'Completed'   # record closed itself
    conn.close()
    assert b'complete' in c.get(f'/onboarding/{oid}').data


def test_itam_onboarding_can_be_cancelled_and_only_known_statuses_are_accepted(itam):
    import sqlite3
    c = itam.app.test_client(); c.post('/login', data={'username': 'hr_officer', 'password': 'hr123'})
    c.post('/onboarding/new', data={'full_name': 'Cancel Me', 'job_title': 'Clerk', 'department': 'Finance & Accounts', 'location': 'NIA — HQ'})
    conn = sqlite3.connect(itam.DB_PATH)
    oid = conn.execute("SELECT id FROM onboarding WHERE full_name='Cancel Me'").fetchone()[0]
    conn.close()
    assert b'Cancel</button>' in c.get(f'/onboarding/{oid}').data or b'Cancel\n' in c.get(f'/onboarding/{oid}').data
    c.post(f'/onboarding/{oid}/set-status', data={'status': 'Bogus <script>'})
    conn = sqlite3.connect(itam.DB_PATH)
    assert conn.execute("SELECT status FROM onboarding WHERE id=?", (oid,)).fetchone()[0] == 'In Progress'
    conn.close()
    c.post(f'/onboarding/{oid}/set-status', data={'status': 'Cancelled'})
    conn = sqlite3.connect(itam.DB_PATH)
    assert conn.execute("SELECT status FROM onboarding WHERE id=?", (oid,)).fetchone()[0] == 'Cancelled'
    conn.close()
    assert b'Cancel Me' in c.get('/onboarding?status=Cancelled').data
    # a cancelled record is skipped by the Trust Hub joiner automation
    assert 'Cancelled' in __import__('hub.integration', fromlist=['x']).SKIP_STATUS
