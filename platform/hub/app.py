"""DAS Trust Hub: Flask application."""
import csv, hmac, io, json, os, secrets, sys, threading, time
from datetime import date, datetime, timedelta
from functools import wraps
from urllib.parse import urlparse

from flask import (Flask, Response, abort, flash, g, jsonify, redirect, render_template,
                   request, session, url_for)
from werkzeug.security import generate_password_hash

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from common import sso                       # noqa: E402
from hub import auth, config, connectors, controls, db, ledger   # noqa: E402

IDLE_SECONDS = 30 * 60


def create_app():
    app = Flask(__name__)
    db.init()
    app.secret_key = _secret_key()
    app.config.update(SESSION_COOKIE_NAME='hub_session', SESSION_COOKIE_HTTPONLY=True,
                      SESSION_COOKIE_SAMESITE='Lax',
                      SESSION_COOKIE_SECURE=config.env('COOKIE_SECURE', '').lower() in ('1', 'true', 'yes'),
                      MAX_CONTENT_LENGTH=1024 * 1024)
    _bootstrap_admin()
    if (config.env('HUB_AUTO_SYNC_SECONDS') or '').isdigit():
        _start_sync_thread(int(config.env('HUB_AUTO_SYNC_SECONDS')))

    # ── request plumbing ────────────────────────────────────────────────
    @app.before_request
    def _load_user():
        g.user = None
        uid = session.get('uid')
        if uid:
            if time.time() - session.get('last', 0) > IDLE_SECONDS:
                session.clear()
            else:
                conn = db.connect()
                row = conn.execute('SELECT * FROM users WHERE id=? AND is_active=1', (uid,)).fetchone()
                conn.close()
                if row:
                    g.user = row
                    session['last'] = time.time()
                else:
                    session.clear()

    @app.before_request
    def _csrf():
        if request.method in ('POST', 'PUT', 'PATCH', 'DELETE'):
            tok = session.get('csrf')
            sent = request.form.get('csrf_token') or request.headers.get('X-CSRFToken')
            if not tok or not sent or not hmac.compare_digest(tok, sent):
                abort(400, 'Security token missing or expired. Refresh and retry.')

    @app.context_processor
    def _inject():
        if 'csrf' not in session:
            session['csrf'] = secrets.token_hex(32)
        return dict(csrf_token=session['csrf'], me=g.get('user'), can=lambda p: bool(g.get('user')) and auth.can(g.user['role'], p),
                    itam_url=config.itam_url(), cs_url=config.cybershield_url(), sso_on=bool(sso.secret()))

    @app.after_request
    def _headers(r):
        r.headers['X-Content-Type-Options'] = 'nosniff'
        r.headers['X-Frame-Options'] = 'DENY'
        r.headers['Referrer-Policy'] = 'same-origin'
        r.headers['Cache-Control'] = 'no-store'
        r.headers['Content-Security-Policy'] = ("default-src 'self'; style-src 'self' 'unsafe-inline'; "
                                                "script-src 'self'; img-src 'self' data:; frame-ancestors 'none'; form-action 'self'")
        return r

    def need(perm=None):
        def deco(f):
            @wraps(f)
            def w(*a, **k):
                if not g.user:
                    return redirect(url_for('login', next=request.path))
                if g.user['must_change_pw'] and request.endpoint not in ('account', 'logout'):
                    return redirect(url_for('account'))
                if perm and not auth.can(g.user['role'], perm):
                    abort(403)
                return f(*a, **k)
            return w
        return deco

    def audit(action, detail=''):
        ledger.log(g.user['username'] if g.get('user') else 'anonymous', action, detail)

    # ── health ──────────────────────────────────────────────────────────
    @app.get('/health')
    def health():
        return jsonify(status='ok')

    # ── auth ────────────────────────────────────────────────────────────
    @app.route('/login', methods=['GET', 'POST'])
    def login():
        if request.method == 'POST':
            u, err = auth.authenticate(request.form.get('username', ''), request.form.get('password', ''))
            if err:
                ledger.log(request.form.get('username', '')[:60] or 'anonymous', 'LOGIN_FAIL', f'ip={request.remote_addr} {err}')
                flash(err, 'danger')
            elif u['mfa_enabled']:
                session.clear()
                session.update(pending_uid=u['id'], pending_at=time.time(), csrf=secrets.token_hex(32))
                return redirect(url_for('login_mfa'))
            else:
                return _finish_login(u)
        return render_template('login.html')

    def _finish_login(u):
        nxt = request.args.get('next', '')
        session.clear()
        session.update(uid=u['id'], last=time.time(), csrf=secrets.token_hex(32))
        conn = db.connect()
        conn.execute("UPDATE users SET last_login=datetime('now') WHERE id=?", (u['id'],))
        conn.commit(); conn.close()
        ledger.log(u['username'], 'LOGIN', f"role={u['role']} mfa={bool(u['mfa_enabled'])} ip={request.remote_addr}")
        p = urlparse(nxt)
        return redirect(nxt if nxt.startswith('/') and not p.netloc and not nxt.startswith('//') else url_for('dashboard'))

    @app.route('/login/mfa', methods=['GET', 'POST'])
    def login_mfa():
        uid = session.get('pending_uid')
        if not uid or time.time() - session.get('pending_at', 0) > 300:
            return redirect(url_for('login'))
        conn = db.connect()
        u = conn.execute('SELECT * FROM users WHERE id=?', (uid,)).fetchone()
        conn.close()
        if request.method == 'POST':
            if auth.totp_verify(u['totp_secret'], request.form.get('code')):
                return _finish_login(u)
            ledger.log(u['username'], 'MFA_FAIL', f'ip={request.remote_addr}')
            flash('Invalid code.', 'danger')
        return render_template('mfa.html')

    @app.post('/logout')
    def logout():
        if g.user:
            audit('LOGOUT')
        session.clear()
        return redirect(url_for('login'))

    @app.route('/account', methods=['GET', 'POST'])
    @need()
    def account():
        if request.method == 'POST':
            act = request.form.get('act')
            conn = db.connect()
            if act == 'password':
                from werkzeug.security import check_password_hash
                new = request.form.get('new', '')
                errs = auth.policy_errors(new, g.user['username'])
                if not check_password_hash(g.user['password_hash'], request.form.get('current', '')):
                    flash('Current password is wrong.', 'danger')
                elif new != request.form.get('confirm'):
                    flash('Passwords do not match.', 'danger')
                elif errs:
                    flash('Password must have: ' + '; '.join(errs) + '.', 'danger')
                else:
                    conn.execute('UPDATE users SET password_hash=?, must_change_pw=0 WHERE id=?',
                                 (generate_password_hash(new), g.user['id']))
                    conn.commit(); audit('PASSWORD_CHANGE'); flash('Password updated.', 'success')
            elif act == 'mfa_start':
                conn.execute('UPDATE users SET totp_secret=?, mfa_enabled=0 WHERE id=?', (auth.new_totp_secret(), g.user['id']))
                conn.commit()
            elif act == 'mfa_confirm':
                row = conn.execute('SELECT totp_secret FROM users WHERE id=?', (g.user['id'],)).fetchone()
                if auth.totp_verify(row['totp_secret'], request.form.get('code')):
                    conn.execute('UPDATE users SET mfa_enabled=1 WHERE id=?', (g.user['id'],))
                    conn.commit(); audit('MFA_ENABLED'); flash('Multi-factor authentication enabled.', 'success')
                else:
                    flash('That code was not valid. Try again.', 'danger')
            elif act == 'mfa_disable' and g.user['role'] not in ('admin', 'auditor', 'it_manager'):
                conn.execute('UPDATE users SET mfa_enabled=0, totp_secret=NULL WHERE id=?', (g.user['id'],))
                conn.commit(); audit('MFA_DISABLED')
            elif act == 'mfa_disable':
                flash('Privileged roles cannot disable MFA. Ask another administrator.', 'danger')
            conn.close()
            return redirect(url_for('account'))
        conn = db.connect()
        row = conn.execute('SELECT * FROM users WHERE id=?', (g.user['id'],)).fetchone()
        conn.close()
        uri = auth.otpauth_uri(row['totp_secret'], row['username']) if row['totp_secret'] and not row['mfa_enabled'] else None
        return render_template('account.html', u=row, uri=uri, policy=auth.policy_errors(''))

    # ── dashboard & joint views ─────────────────────────────────────────
    @app.get('/')
    @need('view')
    def dashboard():
        ctx = controls.context()
        items, summ = controls.evaluate(ctx)
        exposed = [p for p in ctx['people'] if p['exposed']]
        return render_template('dashboard.html', a=ctx['assets'], t=ctx['training'], ctx=ctx, summ=summ,
                               exposed=exposed[:8], n_exposed=len(exposed), top_gaps=controls.gaps(items)[:5],
                               hist=controls.history(), led=ctx['ledger'])

    @app.get('/exposure')
    @need('view')
    def exposure():
        rows = connectors.people()
        f = request.args.get('f', 'exposed')
        if f == 'exposed':
            rows = [p for p in rows if p['exposed']]
        elif f == 'joiners':
            rows = [p for p in rows if p['joiner']]
        elif f == 'all':
            pass
        return render_template('exposure.html', rows=rows, f=f)

    @app.get('/launch/<target>')
    @need('launch')
    def launch(target):
        if target not in ('itam', 'cybershield'):
            abort(404)
        base = config.itam_url() if target == 'itam' else config.cybershield_url()
        if not sso.secret():
            flash('SSO is not configured (set SSO_SECRET, 32+ characters); opening the application login page.', 'warn')
            return redirect(base)
        role = g.user['role']
        if target == 'cybershield' and role not in ('admin', 'it_manager', 'hr'):
            flash('Your role cannot administer CyberShield.', 'danger')
            return redirect(url_for('dashboard'))
        audit('SSO_LAUNCH', target)
        return redirect(f"{base}/sso?ticket={sso.sign(g.user['username'], role, target)}")

    # ── compliance ──────────────────────────────────────────────────────
    @app.get('/compliance')
    @need('view')
    def compliance():
        items, summ = controls.evaluate()
        fw = request.args.get('fw')
        if fw in controls.FRAMEWORKS:
            items = [i for i in items if i['maps'].get(fw)]
        return render_template('compliance.html', items=items, summ=summ, fw=fw, fws=controls.FRAMEWORKS,
                               gaps=controls.gaps(items)[:8], hist=controls.history())

    @app.route('/compliance/<cid>', methods=['GET', 'POST'])
    @need('view')
    def control(cid):
        items, summ = controls.evaluate()
        item = next((i for i in items if i['id'] == cid), None)
        if not item:
            abort(404)
        if request.method == 'POST':
            if not auth.can(g.user['role'], 'attest') or item['kind'] != 'manual':
                abort(403)
            status = request.form.get('status')
            if status not in ('implemented', 'partial', 'not_implemented', 'not_applicable'):
                abort(400)
            ev = request.form.get('evidence', '').strip()[:4000]
            if status != 'not_applicable' and len(ev) < 15:
                flash('Evidence is required (say what exists and where it is kept).', 'danger')
                return redirect(url_for('control', cid=cid))
            due = request.form.get('review_due') or (date.today() + timedelta(days=365)).isoformat()
            conn = db.connect()
            conn.execute('''INSERT INTO attestations (control_id,status,owner,evidence,attested_by,attested_at,review_due)
                            VALUES (?,?,?,?,?,?,?) ON CONFLICT(control_id) DO UPDATE SET status=excluded.status,
                            owner=excluded.owner, evidence=excluded.evidence, attested_by=excluded.attested_by,
                            attested_at=excluded.attested_at, review_due=excluded.review_due''',
                         (cid, status, request.form.get('owner', '')[:120], ev, g.user['username'],
                          datetime.now().isoformat(timespec='seconds'), due))
            conn.commit(); conn.close()
            audit('ATTEST', f'{cid} -> {status}')
            flash('Attestation recorded and sealed in the audit ledger.', 'success')
            return redirect(url_for('control', cid=cid))
        return render_template('control.html', c=item, fws=controls.FRAMEWORKS)

    @app.get('/reports/compliance')
    @need('export')
    def report_html():
        items, summ = controls.evaluate()
        audit('EXPORT', 'compliance report (html)')
        return render_template('report.html', items=items, summ=summ, gaps=controls.gaps(items),
                               fws=controls.FRAMEWORKS, today=date.today().isoformat(), led=ledger.verify(),
                               a=connectors.asset_stats(), t=connectors.training_stats())

    @app.get('/reports/compliance.csv')
    @need('export')
    def report_csv():
        items, _ = controls.evaluate()
        audit('EXPORT', 'compliance report (csv)')
        out = io.StringIO()
        w = csv.writer(out)
        w.writerow(['Control', 'Title', 'Type', 'Status', 'Weight', 'Metric', 'Evidence', 'Action'] + list(controls.FRAMEWORKS.values()))
        for i in items:
            w.writerow([i['id'], i['title'], i['kind'], i['status'], i['weight'], _csv_safe(i['metric']), _csv_safe(i['evidence']),
                        _csv_safe(i['action'])] + [', '.join(i['maps'].get(k, [])) for k in controls.FRAMEWORKS])
        return Response(out.getvalue(), mimetype='text/csv',
                        headers={'Content-Disposition': f'attachment; filename=compliance-{date.today()}.csv'})

    @app.post('/snapshot')
    @need('attest')
    def take_snapshot():
        _, summ = controls.evaluate()
        controls.snapshot(summ)
        audit('SNAPSHOT', f"score={summ['overall']}")
        flash('Score snapshot saved.', 'success')
        return redirect(request.referrer or url_for('compliance'))

    # ── ledger ──────────────────────────────────────────────────────────
    @app.get('/ledger')
    @need('ledger')
    def ledger_view():
        v = ledger.verify()
        rows = ledger.recent(300, request.args.get('source') or None, request.args.get('q') or None)
        return render_template('ledger.html', rows=rows, v=v, source=request.args.get('source', ''), q=request.args.get('q', ''))

    @app.post('/sync')
    @need('sync')
    def sync():
        added = ledger.sync()
        audit('SYNC', json.dumps(added))
        flash(f"Synced audit trails: {added['itam']} ITAM and {added['cybershield']} CyberShield events sealed.", 'success')
        return redirect(request.referrer or url_for('dashboard'))

    @app.get('/ledger.csv')
    @need('export')
    def ledger_csv():
        out = io.StringIO()
        w = csv.writer(out)
        w.writerow(['id', 'timestamp', 'source', 'source_id', 'actor', 'action', 'detail', 'hash', 'prev_hash'])
        for r in reversed(ledger.recent(100000)):
            w.writerow([r['id'], r['ts'], r['source'], r['source_id'], _csv_safe(r['actor']), r['action'],
                        _csv_safe(r['detail']), r['hash'], r['prev_hash']])
        audit('EXPORT', 'ledger (csv)')
        return Response(out.getvalue(), mimetype='text/csv',
                        headers={'Content-Disposition': f'attachment; filename=ledger-{date.today()}.csv'})

    # ── users ───────────────────────────────────────────────────────────
    @app.route('/users', methods=['GET', 'POST'])
    @need('manage_users')
    def users():
        conn = db.connect()
        if request.method == 'POST':
            act = request.form.get('act')
            if act == 'create':
                uname = request.form.get('username', '').strip().lower()
                role = request.form.get('role')
                pw = request.form.get('password', '')
                errs = auth.policy_errors(pw, uname)
                if not uname.replace('.', '').replace('_', '').replace('-', '').isalnum() or role not in auth.ROLES:
                    flash('Invalid username or role.', 'danger')
                elif errs:
                    flash('Password must have: ' + '; '.join(errs) + '.', 'danger')
                elif conn.execute('SELECT 1 FROM users WHERE username=?', (uname,)).fetchone():
                    flash('Username already exists.', 'danger')
                else:
                    conn.close()
                    auth.create_user(uname, pw, role, request.form.get('full_name', ''))
                    audit('USER_CREATE', f'{uname} ({role})')
                    flash(f'User {uname} created; they must change the password at first sign-in.', 'success')
                    return redirect(url_for('users'))
            elif act in ('disable', 'enable', 'unlock'):
                uid = int(request.form.get('uid', 0))
                if uid == g.user['id'] and act == 'disable':
                    flash('You cannot disable your own account.', 'danger')
                else:
                    if act == 'unlock':
                        conn.execute('UPDATE users SET failed_count=0, locked_until=0 WHERE id=?', (uid,))
                    else:
                        conn.execute('UPDATE users SET is_active=? WHERE id=?', (1 if act == 'enable' else 0, uid))
                    conn.commit(); audit('USER_' + act.upper(), f'id={uid}')
            elif act == 'role':
                uid, role = int(request.form.get('uid', 0)), request.form.get('role')
                if role in auth.ROLES and not (uid == g.user['id'] and role != 'admin'):
                    conn.execute('UPDATE users SET role=? WHERE id=?', (role, uid))
                    conn.commit(); audit('USER_ROLE', f'id={uid} -> {role}')
            conn.close()
            return redirect(url_for('users'))
        rows = conn.execute('SELECT * FROM users ORDER BY role, username').fetchall()
        conn.close()
        return render_template('users.html', rows=rows, roles=auth.ROLES, now=time.time())

    # ── machine API (session or bearer token) ───────────────────────────
    @app.get('/api/v1/summary')
    def api_summary():
        tok = config.env('HUB_API_TOKEN', '')
        bearer = request.headers.get('Authorization', '')[7:] if request.headers.get('Authorization', '').startswith('Bearer ') else ''
        ok = (len(tok) >= 32 and hmac.compare_digest(tok, bearer)) or (g.user and auth.can(g.user['role'], 'view'))
        if not ok:
            return jsonify(error='unauthorised'), 401
        items, summ = controls.evaluate()
        return jsonify(score=summ['overall'], rating=summ['rating'], frameworks=summ['frameworks'], counts=summ['counts'],
                       exposed_people=len([p for p in connectors.people() if p['exposed']]),
                       ledger=ledger.verify()['ok'], generated=datetime.now().isoformat(timespec='seconds'))

    @app.errorhandler(403)
    def _403(e):
        return render_template('error.html', code=403, msg='You do not have permission to do that.'), 403

    @app.errorhandler(404)
    def _404(e):
        return render_template('error.html', code=404, msg='Page not found.'), 404

    @app.errorhandler(400)
    def _400(e):
        return render_template('error.html', code=400, msg=getattr(e, 'description', 'Bad request.')), 400

    return app


def _csv_safe(v):
    """Neutralise spreadsheet formula injection in exports."""
    v = '' if v is None else str(v)
    return "'" + v if v[:1] in ('=', '+', '-', '@', '\t', '\r') else v


def _secret_key():
    k = config.env('HUB_SECRET_KEY')
    if k:
        return k
    path = os.path.join(os.path.dirname(config.hub_db_path()), '.secret_key')
    try:
        return open(path).read().strip()
    except OSError:
        k = secrets.token_hex(32)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w') as f:
            f.write(k)
        os.chmod(path, 0o600)
        return k


def _bootstrap_admin():
    conn = db.connect()
    n = conn.execute('SELECT COUNT(*) FROM users').fetchone()[0]
    conn.close()
    if n:
        return
    pw = config.env('HUB_ADMIN_PASSWORD')
    generated = not pw
    pw = pw or secrets.token_urlsafe(16) + 'aA1!'
    auth.create_user('admin', pw, 'admin', 'Hub Administrator', must_change=True)
    ledger.log('system', 'BOOTSTRAP', 'initial administrator created (password change required)')
    if generated:
        print(f"\n  First-run Hub administrator -> username: admin   password: {pw}\n  (shown once; you must change it at first sign-in)\n", flush=True)


def _start_sync_thread(every):
    def loop():
        while True:
            time.sleep(max(every, 30))
            try:
                ledger.sync()
            except Exception as e:   # never let the loop die
                print('auto-sync failed:', e, flush=True)
    threading.Thread(target=loop, daemon=True).start()


app = None


def get_app():
    global app
    if app is None:
        app = create_app()
    return app


if __name__ == '__main__':
    get_app().run(host=config.env('HUB_HOST', '127.0.0.1'), port=int(config.env('HUB_PORT', '5080')))
