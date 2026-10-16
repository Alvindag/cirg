from flask import Flask, render_template, request, jsonify, redirect, url_for, session
import sqlite3, os, json, random, string, smtplib, threading
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

app = Flask(__name__)
# ── Security config (loaded from .env) ─────────────────────────────────────
import os as _os, secrets as _secrets
def _load_env(path=_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '.env')):
    try:
        with open(path) as _f:
            for _line in _f:
                _line = _line.strip()
                if _line and not _line.startswith('#') and '=' in _line:
                    _k, _v = _line.split('=', 1)
                    _os.environ.setdefault(_k.strip(), _v.strip())
    except FileNotFoundError:
        pass
_load_env()
app.secret_key = _os.environ.get('SECRET_KEY') or _secrets.token_hex(32)
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE']   = _os.environ.get('COOKIE_SECURE', '').lower() in ('1', 'true', 'yes')  # True behind HTTPS
app.config['SESSION_COOKIE_NAME']     = 'cybershield_session'  # distinct from ITAM/Hub: cookies are shared across ports on one host
# ────────────────────────────────────────────────────────────────────────────

# ── CSRF protection ──────────────────────────────────────────────────────────
# Lightweight session-bound token (no extra dependency). Enforced on every
# state-changing request (POST/PUT/PATCH/DELETE); the token is auto-injected
# into every rendered <form method="POST"> and exposed via a <meta> tag plus
# window.CSRF_TOKEN for the admin panel's fetch()-based calls.
import re as _re

def _get_csrf_token():
    tok = session.get('csrf_token')
    if not tok:
        tok = _secrets.token_hex(32)
        session['csrf_token'] = tok
    return tok

app.jinja_env.globals['csrf_token'] = _get_csrf_token

_CSRF_EXEMPT_ENDPOINTS = {'admin_login'}  # no session/token exists yet at login

@app.before_request
def _enforce_csrf():
    if request.method not in ('POST', 'PUT', 'PATCH', 'DELETE'):
        return
    if request.endpoint in _CSRF_EXEMPT_ENDPOINTS:
        return
    expected = session.get('csrf_token')
    json_body = request.get_json(silent=True) or {}
    supplied = (request.form.get('csrf_token')
                or request.headers.get('X-CSRFToken')
                or json_body.get('csrf_token'))
    if not expected or not supplied or not _secrets.compare_digest(str(expected), str(supplied)):
        return jsonify({'ok': False, 'error': 'Security token missing or expired. Please refresh the page and try again.'}), 400

_CSRF_FORM_RE = _re.compile(rb'(<form\b[^>]*\bmethod=["\']post["\'][^>]*>)', _re.IGNORECASE)

@app.after_request
def _inject_csrf(response):
    try:
        if response.content_type and response.content_type.startswith('text/html'):
            token = _get_csrf_token()
            body = response.get_data()
            hidden = f'<input type="hidden" name="csrf_token" value="{token}">'.encode()
            if b'method="post"' in body.lower() or b"method='post'" in body.lower():
                body = _CSRF_FORM_RE.sub(lambda m: m.group(1) + hidden, body)
            if b'</head>' in body:
                meta = f'<meta name="csrf-token" content="{token}"><script>window.CSRF_TOKEN="{token}";</script>'.encode()
                body = body.replace(b'</head>', meta + b'</head>', 1)
            response.set_data(body)
    except Exception:
        pass
    return response
# ────────────────────────────────────────────────────────────────────────────

DB = os.environ.get('CYBERSHIELD_DB_PATH') or os.path.join(os.path.dirname(__file__), 'instance', 'cybershield.db')

def get_db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    os.makedirs(os.path.dirname(DB), exist_ok=True)
    conn = get_db()
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS trainees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            employee_id TEXT,
            department TEXT,
            track TEXT NOT NULL,
            started_at TEXT,
            deadline_at TEXT,
            completed_at TEXT,
            score INTEGER,
            cert_ref TEXT,
            itam_synced INTEGER DEFAULT 0,
            line_manager_email TEXT,
            hr_email TEXT,
            expiry_notified INTEGER DEFAULT 0
        );
        -- Migration: add columns if upgrading from older schema
        CREATE TABLE IF NOT EXISTS _dummy_migration (id INTEGER PRIMARY KEY);
        CREATE TABLE IF NOT EXISTS dept_managers (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            department  TEXT UNIQUE NOT NULL,
            manager_email TEXT NOT NULL,
            updated_at  TEXT
        );
        CREATE TABLE IF NOT EXISTS compliance_log (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            trainee_id  INTEGER NOT NULL,
            action      TEXT NOT NULL,
            reason      TEXT,
            actioned_by TEXT,
            actioned_at TEXT NOT NULL,
            new_deadline TEXT,
            emails_sent TEXT
        );
        CREATE TABLE IF NOT EXISTS progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trainee_id INTEGER,
            module_id TEXT,
            completed_at TEXT,
            score INTEGER
        );
    ''')
    # Admin credentials table
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS admin_users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            must_change_pw INTEGER DEFAULT 0
        );
    ''')
    from werkzeug.security import generate_password_hash as _gph_init
    if not conn.execute("SELECT id FROM admin_users WHERE username='admin'").fetchone():
        conn.execute(
            'INSERT INTO admin_users (username, password_hash, must_change_pw) VALUES (?,?,?)',
            ('admin', _gph_init('Admin@DAS2026!'), 1)
        )
    conn.commit()
    # Migration: add new columns to existing databases
    # Create new tables if upgrading
    for tbl in [
        """CREATE TABLE IF NOT EXISTS dept_managers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            department TEXT UNIQUE NOT NULL,
            manager_email TEXT NOT NULL,
            updated_at TEXT)""",
        """CREATE TABLE IF NOT EXISTS compliance_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trainee_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            reason TEXT,
            actioned_by TEXT,
            actioned_at TEXT NOT NULL,
            new_deadline TEXT,
            emails_sent TEXT)""",
    ]:
        try: conn.execute(tbl)
        except Exception: pass
    # Seed default dept managers if table empty
    if not conn.execute('SELECT id FROM dept_managers LIMIT 1').fetchone():
        defaults = [
            ('Finance',              'finance.manager@dasplcgh.com'),
            ('Human Resources',      'hr@dasplcgh.com'),
            ('Sales & Marketing',    'sales.manager@dasplcgh.com'),
            ('Information Technology','it.manager@dasplcgh.com'),
            ('Logistics',            'logistics.manager@dasplcgh.com'),
            ('Risk & Compliance',    'risk.manager@dasplcgh.com'),
            ('Production',           'production.manager@dasplcgh.com'),
            ('QA & QC',              'qa.manager@dasplcgh.com'),
            ('Engineering',          'engineering.manager@dasplcgh.com'),
            ('Corporate Affairs',    'corporate.manager@dasplcgh.com'),
        ]
        conn.executemany(
            'INSERT OR IGNORE INTO dept_managers (department, manager_email, updated_at) VALUES (?,?,?)',
            [(d, e, datetime.now().isoformat()) for d, e in defaults]
        )
    conn.commit()
    for col_def in [
        'ALTER TABLE trainees ADD COLUMN deadline_at TEXT',
        'ALTER TABLE trainees ADD COLUMN line_manager_email TEXT',
        'ALTER TABLE trainees ADD COLUMN hr_email TEXT',
        'ALTER TABLE trainees ADD COLUMN expiry_notified INTEGER DEFAULT 0',
        'ALTER TABLE trainees ADD COLUMN must_change_pw INTEGER DEFAULT 0',
        'ALTER TABLE trainees ADD COLUMN warning_sent INTEGER DEFAULT 0',
        # Structured notification cadence (v3.1)
        'ALTER TABLE trainees ADD COLUMN assignment_notified INTEGER DEFAULT 0',
        'ALTER TABLE trainees ADD COLUMN reminder_7d_sent INTEGER DEFAULT 0',
        'ALTER TABLE trainees ADD COLUMN overdue_notice_count INTEGER DEFAULT 0',
        'ALTER TABLE trainees ADD COLUMN last_overdue_notice_at TEXT',
        'ALTER TABLE trainees ADD COLUMN escalated_at TEXT',
        'ALTER TABLE trainees ADD COLUMN completion_notified INTEGER DEFAULT 0',
    ]:
        try: conn.execute(col_def)
        except Exception: pass  # column already exists
    conn.commit()
    conn.close()

init_db()

# ── Jinja2 template filters ────────────────────────────────────────────────────
@app.template_filter('from_json')
def from_json_filter(value):
    """Parse a JSON string into a Python object for use in templates."""
    try:
        return json.loads(value)
    except Exception:
        return []

app.jinja_env.globals['enumerate'] = enumerate


# ── Contact constants ──────────────────────────────────────────────────────────
IT_EXT       = "Ext. 204"
IT_MGR_EXT   = "Ext. 115"
IT_EMAIL     = "alvin.dagbui@dasplcgh.com"
HELPDESK_EMAIL = "IThelpdesk@dasplcgh.com"
GLOBAL_HR_EMAIL = "hr@dasplcgh.com"          # fallback HR for all compliance emails
GLOBAL_IT_EMAIL = "IThelpdesk@dasplcgh.com"  # CC on all compliance emails
SD_EMAIL     = "servicedesk@dasplcgh.com"
DOMAIN       = "@dasplcgh.com"
# ── Email config (from .env — see .env.example) ────────────────────────────────
SMTP_HOST  = _os.environ.get('SMTP_HOST', 'smtp.office365.com')
SMTP_PORT  = int(_os.environ.get('SMTP_PORT', '587'))
SMTP_USER  = _os.environ.get('SMTP_USER', 'alvin.dagbui@dasplcgh.com')
SMTP_PASS  = _os.environ.get('SMTP_PASS', '')   # set the M365 app password in .env — never hardcode it here
# Escalation contact used once training is significantly overdue (see check_training_deadlines)
ESCALATION_EMAIL = _os.environ.get('ESCALATION_EMAIL', '') or None
# Debug/test-only routes (/admin/test/*) — must be "true" in .env to enable; off by default
DEBUG_MODE = _os.environ.get('DEBUG_MODE', 'false').strip().lower() in ('1', 'true', 'yes')

def send_email(to_addrs, subject, html_body):
    """Send HTML email. to_addrs is a list of addresses."""
    if not SMTP_PASS:
        app.logger.warning(f'SMTP password not set — skipping email to {to_addrs}')
        return False
    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From']    = SMTP_USER
        msg['To']      = to_addrs[0]
        if len(to_addrs) > 1:
            msg['Cc'] = ', '.join(to_addrs[1:])
        msg.attach(MIMEText(html_body, 'html'))
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:
            s.ehlo(); s.starttls()
            s.login(SMTP_USER, SMTP_PASS)
            s.sendmail(SMTP_USER, to_addrs, msg.as_string())
        return True
    except Exception as e:
        app.logger.error(f'Email error: {e}')
        return False

def get_manager_email(department):
    """Look up line manager email from dept_managers table."""
    if not department:
        return HELPDESK_EMAIL
    conn = get_db()
    row  = conn.execute(
        'SELECT manager_email FROM dept_managers WHERE department=?', (department,)
    ).fetchone()
    conn.close()
    return row['manager_email'] if row else HELPDESK_EMAIL


def log_compliance_action(trainee_id, action, reason, actioned_by, new_deadline=None, emails_sent=None):
    """Write an immutable compliance audit log entry."""
    conn = get_db()
    conn.execute(
        """INSERT INTO compliance_log
           (trainee_id, action, reason, actioned_by, actioned_at, new_deadline, emails_sent)
           VALUES (?,?,?,?,?,?,?)""",
        (trainee_id, action, reason, actioned_by,
         datetime.now().isoformat(), new_deadline,
         json.dumps(emails_sent or []))
    )
    conn.commit(); conn.close()


def build_email_html(heading, badge_color, badge_text, rows, note_html, footer_note=''):
    """Reusable branded HTML email builder."""
    rows_html = ''.join(
        f'<tr style="background:{"#f4f5f7" if i%2==0 else "white"}">'        f'<td style="padding:10px 14px;font-weight:bold;width:40%">{k}</td>'        f'<td style="padding:10px 14px">{v}</td></tr>'
        for i, (k, v) in enumerate(rows)
    )
    return f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#1a1a2e">
<div style="background:#1F3864;padding:18px 24px;color:white">
  <div style="font-size:18px;font-weight:bold;color:#E8A020">CyberShield &#8212; {heading}</div>
  <div style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:3px">Dannex Ayrton Starwin Plc &#183; IT Security Notification</div>
</div>
<div style="background:{badge_color};padding:8px 24px;font-size:12px;font-weight:bold;color:white;letter-spacing:1px">
  {badge_text}
</div>
<div style="padding:24px">
  <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">{rows_html}</table>
  {note_html}
  <hr style="border:1px solid #eee;margin-top:20px">
  <p style="font-size:11px;color:#999">
    This is an automated message from CyberShield v3 &#183; DAS Plc IT Security Platform.<br>
    {footer_note}
    IT Department: {HELPDESK_EMAIL} &#183; Ext. 204
  </p>
</div></body></html>"""


# ── Structured notification cadence ─────────────────────────────────────────
# Stage 1  (start)         → line manager assignment notice           [assignment_notified]
# Stage 2  (7 days out)    → line manager early heads-up               [reminder_7d_sent]
# Stage 3  (3 days out)    → line manager + HR + IT reminder            [warning_sent]
# Stage 4  (deadline day)  → line manager + HR + IT overdue escalation  [expiry_notified]
# Stage 5  (weekly after)  → repeat overdue notice; after OVERDUE_ESCALATE_AFTER
#                            notices (default 2 = ~14 days overdue) also CC
#                            ESCALATION_EMAIL if configured             [overdue_notice_count]
# Stage 6  (on completion) → line manager completion confirmation       [completion_notified]
OVERDUE_RENOTIFY_DAYS      = 7   # how often to re-nag while still overdue
OVERDUE_ESCALATE_AFTER     = 2   # number of overdue notices before escalation CC

def notify_assignment(trainee_id):
    """Stage 1 — tell the line manager training has been assigned, with the deadline."""
    conn = sqlite3.connect(DB); conn.row_factory = sqlite3.Row
    t = conn.execute('SELECT * FROM trainees WHERE id=?', (trainee_id,)).fetchone()
    if not t or t['assignment_notified']:
        conn.close(); return
    name, dept, emp_id = t['name'], t['department'] or 'Unknown', t['employee_id'] or 'N/A'
    track = t['track'].title()
    deadline = t['deadline_at'][:10] if t['deadline_at'] else 'N/A'
    lm_email = get_manager_email(t['department'])
    rows = [
        ('Employee', f'{name} ({emp_id})'), ('Department', dept), ('Track', track),
        ('Started',  t['started_at'][:10] if t['started_at'] else 'Today'),
        ('Deadline', f'<strong style="color:#1F3864">{deadline}</strong>'),
        ('Status',   '<span style="color:#1F3864">TRAINING ASSIGNED</span>'),
    ]
    note = f"""<div style="background:#e8f4fd;border:1px solid #1F3864;border-radius:6px;padding:14px 16px;margin:16px 0;font-size:13px;line-height:1.7">
      <strong>{name}</strong> has started mandatory CyberShield training ({track}).
      No action is needed now — you will be notified again if the {deadline} deadline is
      approaching or is missed.
    </div>"""
    html = build_email_html('Training Assigned', '#1F3864', 'INFO — MANDATORY TRAINING ASSIGNED',
                             rows, note, 'For your records — no action required at this stage.')
    sent = send_email([lm_email], f'CyberShield Training Assigned: {name} ({dept})', html)
    conn.execute('UPDATE trainees SET assignment_notified=1 WHERE id=?', (trainee_id,))
    conn.commit(); conn.close()
    if sent:
        log_compliance_action(trainee_id, 'AUTO_ASSIGNMENT_NOTICE', 'Training started', 'system', emails_sent=[lm_email])
    app.logger.info(f'Assignment notice sent for {name}: sent={sent}')


def notify_completion(trainee_id):
    """Stage 6 — tell the line manager training was completed (closes the audit loop)."""
    conn = sqlite3.connect(DB); conn.row_factory = sqlite3.Row
    t = conn.execute('SELECT * FROM trainees WHERE id=?', (trainee_id,)).fetchone()
    if not t or not t['completed_at'] or t['completion_notified']:
        conn.close(); return
    name, dept, emp_id = t['name'], t['department'] or 'Unknown', t['employee_id'] or 'N/A'
    track = t['track'].title()
    lm_email = get_manager_email(t['department'])
    rows = [
        ('Employee', f'{name} ({emp_id})'), ('Department', dept), ('Track', track),
        ('Completed', t['completed_at'][:10]), ('Score', f"{t['score']}%"),
        ('Certificate Ref.', t['cert_ref'] or 'N/A'),
        ('Status', '<span style="color:#2E7D32">COMPLETED</span>'),
    ]
    note = f"""<div style="background:#eefaf0;border:1px solid #2E7D32;border-radius:6px;padding:14px 16px;margin:16px 0;font-size:13px;line-height:1.7">
      <strong>{name}</strong> has successfully completed mandatory CyberShield training and passed
      with a score of <strong>{t['score']}%</strong>. No further action is required. This closes
      out the earlier training assignment/reminder notices for this employee.
    </div>"""
    html = build_email_html('Training Completed', '#2E7D32', 'CONFIRMED — MANDATORY TRAINING COMPLETE',
                             rows, note, 'For your records — copy retained in the compliance audit log.')
    sent = send_email([lm_email], f'CyberShield Training Completed: {name} ({dept})', html)
    conn.execute('UPDATE trainees SET completion_notified=1 WHERE id=?', (trainee_id,))
    conn.commit(); conn.close()
    if sent:
        log_compliance_action(trainee_id, 'AUTO_COMPLETION_NOTICE', 'Training completed', 'system', emails_sent=[lm_email])
    app.logger.info(f'Completion notice sent for {name}: sent={sent}')


def check_training_deadlines():
    """
    Runs every 6 hours. Structured, escalating notification cadence — see
    stage comments above. Each stage fires at most once per trainee except
    the weekly overdue re-notify (stage 5), which repeats until resolved.
    """
    with app.app_context():
        conn = sqlite3.connect(DB)
        conn.row_factory = sqlite3.Row
        now  = datetime.now()

        # ── Stage 2: 7-day heads-up (manager only — soft nudge) ─────────────
        warn7_threshold = (now + timedelta(days=7)).isoformat()
        for t in conn.execute("""
            SELECT * FROM trainees
            WHERE completed_at IS NULL AND deadline_at IS NOT NULL
              AND deadline_at <= ? AND deadline_at > ?
              AND (reminder_7d_sent IS NULL OR reminder_7d_sent = 0)
        """, (warn7_threshold, (now + timedelta(days=3)).isoformat())).fetchall():
            name, dept, emp_id = t['name'], t['department'] or 'Unknown', t['employee_id'] or 'N/A'
            deadline = t['deadline_at'][:10]
            lm_email = get_manager_email(t['department'])
            rows = [('Employee', f'{name} ({emp_id})'), ('Department', dept),
                    ('Track', t['track'].title()),
                    ('Deadline', f'<strong>{deadline}</strong>'),
                    ('Status', 'IN PROGRESS — 7 days remaining')]
            note = f"""<div style="background:#eef6ff;border:1px solid #1F3864;border-radius:6px;padding:14px 16px;margin:16px 0;font-size:13px;line-height:1.7">
              <strong>Early heads-up:</strong> {name} has one week left to complete mandatory
              CyberShield training (deadline <strong>{deadline}</strong>). No action needed yet —
              a further reminder will follow at 3 days if still incomplete.</div>"""
            html = build_email_html('Training Due In 7 Days', '#1F3864', 'HEADS-UP — TRAINING DUE IN 1 WEEK',
                                     rows, note, 'Informational only — sent once to the line manager.')
            send_email([lm_email], f'Heads-up — CyberShield Training Due in 7 Days: {name} ({dept})', html)
            conn.execute('UPDATE trainees SET reminder_7d_sent=1 WHERE id=?', (t['id'],))
            conn.commit()
            app.logger.info(f'7-day heads-up sent for {name}')

        # ── Stage 3: 3-day warning (manager + HR + IT) ──────────────────────
        warn_threshold = (now + timedelta(days=3)).isoformat()
        warn_candidates = conn.execute("""
            SELECT * FROM trainees
            WHERE completed_at IS NULL
              AND deadline_at IS NOT NULL
              AND deadline_at <= ?
              AND deadline_at > ?
              AND (warning_sent IS NULL OR warning_sent = 0)
        """, (warn_threshold, now.isoformat())).fetchall()

        for t in warn_candidates:
            name    = t['name']
            dept    = t['department'] or 'Unknown'
            emp_id  = t['employee_id'] or 'N/A'
            track   = t['track'].title()
            deadline= t['deadline_at'][:10]
            lm_email = get_manager_email(t['department'])
            rows = [
                ('Employee', f'{name} ({emp_id})'),
                ('Department', dept),
                ('Track', track),
                ('Deadline', f'<strong style="color:#C00000">{deadline}</strong>'),
                ('Status', '<span style="color:#E8A020">IN PROGRESS - NOT YET COMPLETE</span>'),
            ]
            note = f"""<div style="background:#FFF3CD;border:1px solid #E8A020;border-radius:6px;padding:14px 16px;margin:16px 0;font-size:13px;line-height:1.7">
              <strong>Reminder:</strong> {name} has <strong>3 days or less</strong> remaining
              to complete mandatory CyberShield training. Please follow up to ensure completion
              before the deadline of <strong>{deadline}</strong>.
            </div>"""
            html = build_email_html(
                'Training Deadline Approaching', '#E8A020',
                'REMINDER — TRAINING DEADLINE IN 3 DAYS OR LESS',
                rows, note, 'This 3-day warning is sent once automatically.'
            )
            to_list = [lm_email, GLOBAL_HR_EMAIL, GLOBAL_IT_EMAIL]
            send_email(list(dict.fromkeys(to_list)),
                       f'REMINDER — CyberShield Training Due Soon: {name} ({dept})', html)
            try:
                conn.execute('UPDATE trainees SET warning_sent=1 WHERE id=?', (t['id'],))
                conn.commit()
            except Exception:
                pass
            app.logger.info(f'3-day warning sent for {name}')

        # ── Stage 4: deadline-day expiry escalation ─────────────────────────
        overdue = conn.execute("""
            SELECT * FROM trainees
            WHERE completed_at IS NULL
              AND deadline_at IS NOT NULL
              AND deadline_at < ?
              AND expiry_notified = 0
        """, (now.isoformat(),)).fetchall()

        for t in overdue:
            name     = t['name']
            dept     = t['department'] or 'Unknown'
            emp_id   = t['employee_id'] or 'N/A'
            track    = t['track'].title()
            started  = t['started_at'][:10] if t['started_at'] else 'Not started'
            deadline = t['deadline_at'][:10]
            lm_email = get_manager_email(t['department'])
            rows = [
                ('Employee',         f'{name} ({emp_id})'),
                ('Department',       dept),
                ('Training Track',   track),
                ('Training Started', started),
                ('Deadline',         f'<strong style="color:#C00000">{deadline} — EXPIRED</strong>'),
                ('Status',           '<strong style="color:#C00000">NOT COMPLETED</strong>'),
            ]
            note = f"""<div style="background:#fff0f0;border:1px solid #C00000;border-radius:6px;padding:14px 16px;margin:16px 0;font-size:13px;line-height:1.7">
              <strong>Action Required:</strong> Please follow up with <strong>{name}</strong>
              to ensure completion of mandatory training under DAS Plc IT Security Policy IT22-001.
              Contact IT at {HELPDESK_EMAIL} or Ext. 204 to reset the training window.
              If still incomplete, you will receive a follow-up notice every {OVERDUE_RENOTIFY_DAYS} days.
            </div>"""
            html = build_email_html(
                'Training Deadline Expired', '#C00000',
                'ACTION REQUIRED — MANDATORY TRAINING INCOMPLETE',
                rows, note, 'This notification was copied to HR and IT.'
            )
            to_list = list(dict.fromkeys([lm_email, GLOBAL_HR_EMAIL, GLOBAL_IT_EMAIL]))
            sent = send_email(to_list,
                              f'ACTION REQUIRED — CyberShield Training Overdue: {name} ({dept})', html)
            conn.execute("""UPDATE trainees SET expiry_notified=1, overdue_notice_count=1,
                            last_overdue_notice_at=? WHERE id=?""", (now.isoformat(), t['id']))
            conn.commit()
            log_compliance_action(t['id'], 'AUTO_EXPIRY_ALERT', 'Deadline passed — auto notification',
                                  'system', emails_sent=to_list)
            app.logger.info(f'Expiry alert for {name}: sent={sent}, to={to_list}')

        # ── Stage 5: recurring overdue re-notify + escalation ───────────────
        renotify_threshold = (now - timedelta(days=OVERDUE_RENOTIFY_DAYS)).isoformat()
        still_overdue = conn.execute("""
            SELECT * FROM trainees
            WHERE completed_at IS NULL
              AND expiry_notified = 1
              AND (last_overdue_notice_at IS NULL OR last_overdue_notice_at <= ?)
        """, (renotify_threshold,)).fetchall()

        for t in still_overdue:
            name     = t['name']
            dept     = t['department'] or 'Unknown'
            emp_id   = t['employee_id'] or 'N/A'
            track    = t['track'].title()
            deadline = t['deadline_at'][:10] if t['deadline_at'] else 'N/A'
            days_overdue = (now - datetime.fromisoformat(t['deadline_at'])).days if t['deadline_at'] else 0
            lm_email = get_manager_email(t['department'])
            notice_no = (t['overdue_notice_count'] or 1) + 1
            escalate  = notice_no > OVERDUE_ESCALATE_AFTER and ESCALATION_EMAIL

            rows = [
                ('Employee',      f'{name} ({emp_id})'),
                ('Department',    dept),
                ('Training Track',track),
                ('Deadline',      f'<strong style="color:#C00000">{deadline} — {days_overdue} days overdue</strong>'),
                ('Follow-up No.', str(notice_no)),
                ('Status',        '<strong style="color:#C00000">STILL NOT COMPLETED</strong>'),
            ]
            note = f"""<div style="background:#fff0f0;border:1px solid #C00000;border-radius:6px;padding:14px 16px;margin:16px 0;font-size:13px;line-height:1.7">
              <strong>Repeat notice ({notice_no}):</strong> {name}'s mandatory CyberShield training is
              now <strong>{days_overdue} days overdue</strong>. Please complete follow-up immediately.
              {"This has been escalated for senior attention due to prolonged non-completion." if escalate else ""}
            </div>"""
            badge = 'ESCALATED — TRAINING SIGNIFICANTLY OVERDUE' if escalate else f'FOLLOW-UP {notice_no} — TRAINING STILL OVERDUE'
            html = build_email_html('Training Still Overdue', '#C00000', badge, rows, note,
                                     'Recurring notice — sent every 7 days while incomplete.')
            to_list = list(dict.fromkeys([lm_email, GLOBAL_HR_EMAIL, GLOBAL_IT_EMAIL] +
                                          ([ESCALATION_EMAIL] if escalate else [])))
            sent = send_email(to_list,
                              f'{"ESCALATION" if escalate else "FOLLOW-UP"} — CyberShield Training Overdue ({days_overdue}d): {name} ({dept})',
                              html)
            conn.execute("""UPDATE trainees SET overdue_notice_count=?, last_overdue_notice_at=?,
                            escalated_at=? WHERE id=?""",
                         (notice_no, now.isoformat(), now.isoformat() if escalate else t['escalated_at'], t['id']))
            conn.commit()
            log_compliance_action(t['id'], 'AUTO_OVERDUE_ESCALATION' if escalate else 'AUTO_OVERDUE_RENOTIFY',
                                  f'{days_overdue} days overdue, notice #{notice_no}', 'system', emails_sent=to_list)
            app.logger.info(f'Overdue re-notify #{notice_no} for {name} (escalated={bool(escalate)}): sent={sent}')

        conn.close()

# ── Background deadline checker (threading — no extra packages needed) ─────────
import atexit as _atexit

def _run_deadline_loop():
    """Runs check_training_deadlines every 6 hours using threading.Timer."""
    check_training_deadlines()
    _t = threading.Timer(6 * 3600, _run_deadline_loop)
    _t.daemon = True
    _t.start()
    return _t

_deadline_timer = threading.Timer(30, _run_deadline_loop)   # first run 30s after startup
_deadline_timer.daemon = True
_deadline_timer.start()
_atexit.register(lambda: _deadline_timer.cancel())


# ── Quiz questions ─────────────────────────────────────────────────────────────
ONBOARDING_QUIZ = [
    {"q": "You receive an email from 'it-helpdesk@das-pharma-support.net' asking you to reset your password urgently. What should you do?",
     "options": ["Click the link and reset immediately", "Forward it to a colleague",
                 "Report it to the IT department and delete it", "Reply asking for more details"],
     "answer": 2, "explanation": "The domain 'das-pharma-support.net' is NOT the official DAS Plc domain. Legitimate IT emails come from @dasplcgh.com. Always report suspicious emails to IT at IThelpdesk@dasplcgh.com or call Ext. 204."},

    {"q": "What is the most reliable indicator that an email is a phishing attempt?",
     "options": ["The email has your name in it", "The sender's email domain doesn't match the organisation",
                 "The email is marked urgent", "The email has a company logo"],
     "answer": 1, "explanation": "The domain is the key indicator. Attackers can copy logos and even use your name (spear phishing), but they cannot use the legitimate @dasplcgh.com domain."},

    {"q": "You receive an SMS claiming to be DAS Plc HR, asking you to click a link to update your bank details for payroll. What is this?",
     "options": ["A legitimate HR communication", "Smishing — SMS phishing",
                 "A standard IT notification", "A government tax message"],
     "answer": 1, "explanation": "This is smishing (SMS phishing). DAS Plc HR will never ask you to update bank details via SMS link. All payroll updates go through the official HR system."},

    {"q": "You find a USB flash drive in the DAS Plc car park. What should you do?",
     "options": ["Plug it into your workstation to see whose it is", "Take it home for personal use",
                 "Hand it to the IT department without plugging it in", "Leave it where you found it"],
     "answer": 2, "explanation": "Never plug in unknown USB drives. This is a USB drop attack. Hand it to IT (Ext. 204) who will safely investigate."},

    {"q": "Which of these passwords meets DAS Plc Active Directory policy?",
     "options": ["password123", "Starwin2024", "D@$Plc#Secure99!", "alvin"],
     "answer": 2, "explanation": "DAS Plc AD policy requires minimum 12 characters with uppercase, lowercase, number and special character. 'D@$Plc#Secure99!' meets all criteria."},

    {"q": "A caller claims to be from Microsoft Support and says your computer has a virus. They ask for remote access. What do you do?",
     "options": ["Give them access — Microsoft called you", "Ask them to hold while you verify with IT",
                 "Hang up immediately and report to IT", "Give them your username but not your password"],
     "answer": 2, "explanation": "Microsoft does NOT call users unsolicited. This is a vishing (voice phishing) attack. Hang up immediately and call IT on Ext. 204."},

    {"q": "What does MFA stand for and why is DAS Plc rolling it out?",
     "options": ["Multi-Factor Authentication — adds a second verification step beyond passwords",
                 "Multiple File Access — to share files faster",
                 "Managed Firewall Authentication — a firewall feature",
                 "Manual Form Authentication — a paper form process"],
     "answer": 0, "explanation": "MFA requires something you know (password) AND something you have (OTP). Even if your password is stolen, MFA blocks the attacker."},

    {"q": "A smartly dressed visitor arrives at reception claiming to be from Kaspersky. They need access to the server room. What do you do?",
     "options": ["Let them in — Kaspersky is our antivirus provider", "Ask them to wait and call IT to verify",
                 "Give them a visitor badge and escort them", "Ask for ID and let them in if it looks official"],
     "answer": 1, "explanation": "ALWAYS verify unannounced visitors with IT before granting access. Call IT (Ext. 204) to confirm any scheduled visit."},

    {"q": "Under the Ghana Data Protection Act 2012, what is DAS Plc required to do with personal data of employees and suppliers?",
     "options": ["Share it with partners for marketing",
                 "Process it only for legitimate, specified purposes with proper safeguards",
                 "Store it indefinitely for future use",
                 "Share it freely between all DAS Plc companies"],
     "answer": 1, "explanation": "The Ghana DPA 2012 requires data controllers like DAS Plc to collect data for specific legitimate purposes, protect it appropriately, and not retain it beyond what is necessary."},

    {"q": "What is the correct data classification for DAS Plc batch manufacturing formulas and production records?",
     "options": ["Public", "Internal Use Only", "Confidential", "Restricted — Highly Sensitive"],
     "answer": 3, "explanation": "Batch formulas and production records are Restricted — Highly Sensitive under DAS Plc data classification policy. They are subject to Ghana FDA pharmaceutical regulations and represent core business-critical intellectual property."},

    {"q": "You see a colleague photographing a screen showing Business Central supplier payment data with their phone. What do you do?",
     "options": ["Ignore it", "Report it to your line manager or IT immediately",
                 "Tell them to stop but don't escalate", "Ask to see the photos"],
     "answer": 1, "explanation": "Photographing confidential data is a data breach. Report immediately to IT (Ext. 204) or IThelpdesk@dasplcgh.com. This falls under the Ghana DPA 2012."},

    {"q": "A link in an email shows 'dasplcgh.com' but hovering reveals a different domain. This is a sign of:",
     "options": ["Normal email formatting", "A malicious hyperlink — the visible text differs from the actual URL",
                 "A Microsoft security update", "A slow internet connection"],
     "answer": 1, "explanation": "Attackers use display text that looks legitimate but the hyperlink goes to a malicious site. Always hover to check the real destination."},

    {"q": "What is the FIRST thing to do if you accidentally click a phishing link at work?",
     "options": ["Close the browser tab quietly", "Change your password later",
                 "Disconnect from the network and call IT immediately", "Tell colleagues to warn them"],
     "answer": 2, "explanation": "Disconnect from the network immediately (unplug ethernet or disable Wi-Fi), then call IT on Ext. 204. Speed limits the damage."},

    {"q": "How often must DAS Plc employees complete cybersecurity awareness training?",
     "options": ["Once when they join", "Every 5 years", "Annually", "Only after a security incident"],
     "answer": 2, "explanation": "DAS Plc IT Security Policy requires annual refresher training for all staff. Threats evolve — annual training keeps everyone current."},

    {"q": "You receive a WhatsApp message appearing to be from the CEO asking you to urgently transfer GHS 50,000 to a new supplier. What do you do?",
     "options": ["Process it — the CEO is authorised", "Call the CEO's office directly to verify before any action",
                 "Transfer half as a compromise", "Email the CEO to confirm"],
     "answer": 1, "explanation": "This is a Business Email/Messaging Compromise (BEC) attack. ALWAYS verify financial instructions via a separate known contact method. Call the CEO's office directly."},

    {"q": "Which of these is a safe and acceptable use of DAS Plc IT systems?",
     "options": ["Installing personal software from USB", "Using work email for personal social media",
                 "Accessing the DAS Plc shared drive from home via approved VPN",
                 "Sharing your AD password with a colleague"],
     "answer": 2, "explanation": "Accessing work resources via the approved VPN is acceptable. Installing personal software, using work email for personal accounts, and sharing passwords all violate DAS Plc IT Policy."},

    {"q": "What is the correct way to report a phishing email at DAS Plc?",
     "options": ["Delete it immediately and say nothing",
                 "Use the Outlook 'Report Phishing' button OR forward to IThelpdesk@dasplcgh.com",
                 "Reply to the sender asking them to stop",
                 "Post about it on the company WhatsApp group"],
     "answer": 1, "explanation": "Use Outlook's built-in 'Report Phishing' button (found in the Home ribbon or by right-clicking the email), OR forward the email as an attachment to IThelpdesk@dasplcgh.com. Never reply to phishing emails."},

    {"q": "In Microsoft 365 Business Central, which of the following is a sign of a phishing or fraud attempt?",
     "options": ["A colleague requesting approval through the normal BC workflow",
                 "An email asking you to click a link outside BC to 'confirm a BC payment'",
                 "A BC approval notification from a known manager",
                 "The BC system asking you to log in via the normal M365 login page"],
     "answer": 1, "explanation": "Legitimate BC payment approvals happen INSIDE Business Central — never via external links in emails. Any email asking you to click an outside link to 'approve a BC transaction' is a phishing attempt. Always log into BC directly."},

    {"q": "What is 'spear phishing'?",
     "options": ["A type of network scanning attack",
                 "A targeted phishing attack using personalised information about the victim",
                 "Phishing using maritime themes", "Mass phishing to millions of people"],
     "answer": 1, "explanation": "Spear phishing uses personal details (your name, job title, colleagues) to make the email convincing. It is far more dangerous than generic phishing."},

    {"q": "What does DAS Plc's Incident Response Plan require in the first hour of a cyber incident?",
     "options": ["Write a full incident report", "Try to fix it yourself first",
                 "Contain the incident, preserve evidence, and notify IT immediately",
                 "Wait to see if it resolves"],
     "answer": 2, "explanation": "The first hour is critical. DAS Plc IRP requires: Contain (isolate systems), Preserve evidence (don't delete logs), Notify IT immediately on Ext. 204. CIRG and CFEMS document the incident."},

    {"q": "How long does DAS Plc's AD policy require you to wait before reusing a password?",
     "options": ["You can reuse immediately", "Cannot reuse last 3 passwords",
                 "Cannot reuse last 5 passwords", "Cannot reuse last 10 passwords"],
     "answer": 2, "explanation": "DAS Plc Active Directory policy prevents reuse of the last 5 passwords to ensure truly new credentials at each change cycle."},
]

REFRESHER_QUIZ = [
    {"q": "What is 'quishing' — a new threat in 2025/2026?",
     "options": ["Phishing via QR codes", "Hacking using quiet keyboards",
                 "A type of Wi-Fi attack", "Phishing via job listings"],
     "answer": 0, "explanation": "Quishing uses malicious QR codes to redirect victims to phishing sites. Verify QR destinations before scanning in a professional context."},

    {"q": "AI-generated phishing emails are more dangerous because:",
     "options": ["They are larger files", "They have no spelling mistakes and are highly personalised",
                 "They are sent at night", "They only target executives"],
     "answer": 1, "explanation": "AI phishing emails are grammatically perfect and contextually relevant — traditional detection methods (looking for errors) no longer work reliably."},

    {"q": "You receive an MFA approval request you did NOT initiate. What should you do?",
     "options": ["Approve it — IT might be testing", "Deny it, change your password immediately, and notify IT",
                 "Ignore it", "Approve once to see what happens"],
     "answer": 1, "explanation": "An unexpected MFA push means someone has your password. Deny, change password immediately, and call IT on Ext. 204. This is a live attack."},

    {"q": "The USB GPO means personal USB drives are blocked. What is the approved way to share large files?",
     "options": ["Email only", "Personal Dropbox or Google Drive",
                 "DAS Plc SharePoint or internal network share (\\\\DASDC01\\shared)", "WhatsApp"],
     "answer": 2, "explanation": "SharePoint and the internal network share are approved. Personal cloud services are not approved for business data."},

    {"q": "All cybersecurity incidents must be reported to IT within how many hours of discovery?",
     "options": ["24 hours", "48 hours", "72 hours", "1 hour for all incidents"],
     "answer": 0, "explanation": "DAS Plc policy (updated 2026) requires reporting within 24 hours. Critical incidents (ransomware, data breach) must be reported immediately by calling Ext. 204."},

    {"q": "Where do you report a phishing email at DAS Plc?",
     "options": ["Delete it quietly", "Use Outlook 'Report Phishing' button or forward to IThelpdesk@dasplcgh.com",
                 "Post on the company WhatsApp group", "Forward to your line manager only"],
     "answer": 1, "explanation": "Use Outlook's 'Report Phishing' button (Home ribbon or right-click) OR forward to IThelpdesk@dasplcgh.com. You can also call Ext. 204. Reporting protects all staff."},

    {"q": "A supplier sends an email with a link to 'approve an invoice in Business Central'. The link goes to bc-approval.das-supplier-portal.net. What should you do?",
     "options": ["Click it — it mentions Business Central so it must be real",
                 "Do NOT click — log into Business Central directly to check for pending approvals",
                 "Forward it to Finance to handle", "Reply to the supplier asking for confirmation"],
     "answer": 1, "explanation": "Legitimate BC approvals happen inside Business Central at your normal login URL. Never click external links claiming to be BC approvals. Log into BC directly and check. The domain 'bc-approval.das-supplier-portal.net' is not official."},

    {"q": "A LinkedIn contact asks for DAS Plc IT infrastructure details for a 'free security assessment'. This is:",
     "options": ["A genuine business opportunity", "Social engineering / reconnaissance",
                 "A standard vendor process", "A government check"],
     "answer": 1, "explanation": "Attackers use LinkedIn to gather target intelligence. Refer any vendor inquiries to management and never share infrastructure details."},

    {"q": "DAS Plc password policy requires passwords to be changed every how many days?",
     "options": ["30 days", "60 days", "90 days", "180 days"],
     "answer": 2, "explanation": "AD policy requires password changes every 90 days. Users receive a prompt 14 days before expiry."},

    {"q": "You suspect a colleague's account has been compromised. What do you do?",
     "options": ["Tell the colleague and let them handle it", "Report to IT immediately — do not wait",
                 "Post on the company WhatsApp group", "Change their password yourself"],
     "answer": 1, "explanation": "Report any suspected account compromise to IT immediately (Ext. 204 or IThelpdesk@dasplcgh.com). Time is critical. IT will investigate and document via CFEMS/CIRG."},
]


# ── Brute-force lockout ──────────────────────────────────────────────────────
import time as _time
_FAILED   = {}   # {identifier: [timestamp, ...]}
_MAX_FAIL = 5
_LOCK_SEC = 900  # 15 minutes

def _check_lockout(identifier):
    """Returns (locked: bool, seconds_remaining: int)"""
    now = _time.time()
    times = [t for t in _FAILED.get(identifier, []) if now - t < _LOCK_SEC]
    _FAILED[identifier] = times
    if len(times) >= _MAX_FAIL:
        return True, int(_LOCK_SEC - (now - times[0]))
    return False, 0

def _record_failure(identifier):
    _FAILED.setdefault(identifier, []).append(_time.time())

def _clear_lockout(identifier):
    _FAILED.pop(identifier, None)
# ────────────────────────────────────────────────────────────────────────────

# ── Admin authentication ──────────────────────────────────────────────────────
from functools import wraps as _wraps
from werkzeug.security import check_password_hash as _cph, generate_password_hash as _gph2

def admin_required(f):
    @_wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('admin_logged_in'):
            return redirect('/admin/login')
        return f(*args, **kwargs)
    return decorated

LOGIN_PAGE_HTML = """<!DOCTYPE html><html><head><title>CyberShield Admin Login</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:Arial,sans-serif;background:#0d1117;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.box{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:2.5rem;width:340px}
h2{color:#e6a817;margin:0 0 1.5rem;font-size:1.2rem;letter-spacing:2px}
label{color:#8b949e;font-size:13px;display:block;margin-bottom:4px}
input{width:100%;padding:8px 10px;background:#0d1117;border:1px solid #30363d;border-radius:6px;color:#e6edf3;font-size:14px;box-sizing:border-box;margin-bottom:1rem}
button{width:100%;padding:10px;background:#e6a817;border:none;border-radius:6px;font-weight:bold;font-size:14px;cursor:pointer;color:#0d1117}
.err{color:#f85149;font-size:13px;margin-bottom:1rem;background:#2d0e0e;padding:8px 10px;border-radius:6px;border-left:3px solid #f85149}
.brand{color:#e6edf3;font-size:11px;text-align:center;margin-top:1.5rem;opacity:.5}
</style></head><body><div class="box">
<h2>&#128737; CYBERSHIELD ADMIN</h2>
{err_html}
<form method="POST">
<label>Username</label><input name="username" type="text" autocomplete="off" required>
<label>Password</label><input name="password" type="password" required>
<button type="submit">Sign In</button>
</form>
<div class="brand">Dannex Ayrton Starwin Plc &middot; IT Security Platform</div>
</div></body></html>"""

CHANGE_PAGE_HTML = """<!DOCTYPE html><html><head><title>Change Password</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:Arial,sans-serif;background:#0d1117;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.box{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:2.5rem;width:380px}
h2{color:#e6a817;margin:0 0 0.5rem;font-size:1.1rem;letter-spacing:1px}
p{color:#8b949e;font-size:13px;margin:0 0 1.5rem}
label{color:#8b949e;font-size:13px;display:block;margin-bottom:4px}
input{width:100%;padding:8px 10px;background:#0d1117;border:1px solid #30363d;border-radius:6px;color:#e6edf3;font-size:14px;box-sizing:border-box;margin-bottom:1rem}
button{width:100%;padding:10px;background:#e6a817;border:none;border-radius:6px;font-weight:bold;font-size:14px;cursor:pointer;color:#0d1117}
.err{color:#f85149;font-size:13px;margin-bottom:1rem;background:#2d0e0e;padding:8px 10px;border-radius:6px;border-left:3px solid #f85149}
ul{color:#8b949e;font-size:12px;margin:0 0 1rem;padding-left:1.2rem}
</style></head><body><div class="box">
<h2>Set New Admin Password</h2>
<p>Your default password must be changed before you can access the admin panel.</p>
{err_html}
<form method="POST">
<label>New Password</label><input name="new_password" type="password" required>
<label>Confirm Password</label><input name="confirm" type="password" required>
<ul><li>Minimum 10 characters</li><li>Mix of letters, numbers and symbols recommended</li></ul>
<button type="submit">Update Password &amp; Continue</button>
</form>
</div></body></html>"""


ETHICS_QUIZ = [
    {"question": "A supplier sends you a GH₵ 800 gift card two weeks before your company renews their contract. What do you do?",
     "options": ["Accept it — it is a standard business courtesy", "Declare it to HR and return it or donate to charity, since it arrives near a procurement decision", "Accept it but tell your line manager informally", "Wait until after the contract is signed, then accept"],
     "answer": 1, "explanation": "Any gift received near a procurement decision must be declared to HR and returned. If return is impossible, it goes to charity. Timing near a contract renewal makes this a high-risk gift regardless of value."},
    {"question": "You discover that a colleague in the Finance team has been keeping a second set of accounts to conceal payments to a vendor. What is your obligation?",
     "options": ["Speak to the colleague first and give them a chance to fix it", "Ignore it — it is not your department", "Report it to the Head of HR, Head of Corporate Affairs, or via the confidential hotline (0241640540)", "Wait to see if it appears in the next audit"],
     "answer": 2, "explanation": "Off-book accounts are a direct violation of DAS Plc policy. You have a duty to report it immediately to HR, Corporate Affairs, or via the confidential hotline. Waiting or warning the colleague first is not acceptable."},
    {"question": "At an industry event, a competitor's sales manager begins discussing their pricing strategy with you over lunch. What is the correct action?",
     "options": ["Listen and take notes — competitive intelligence is valuable", "Share DAS Plc pricing in return to be polite", "Disengage from the conversation and report it to the Head of Corporate Affairs", "Ask him to send the information by email instead"],
     "answer": 2, "explanation": "Discussing pricing information with competitors — even indirectly — can constitute price-fixing under Ghanaian law. You must disengage immediately and report the approach to the Head of Corporate Affairs."},
    {"question": "A journalist calls you directly asking for comment on a news story about DAS Plc. What do you say?",
     "options": ["Give a brief factual comment — it is better than no comment", "Say no comment and hang up", "Refer them to the company communications team and report the call to your manager", "Tell them you will get back to them after checking with your manager"],
     "answer": 2, "explanation": "Only authorised spokespersons may represent DAS Plc publicly. Refer all media enquiries to the communications team and report the call to your line manager immediately."},
    {"question": "Your sister owns a catering company and you are on the committee evaluating tenders for the DAS Plc annual staff event. What must you do?",
     "options": ["Recuse yourself and disclose the conflict of interest to management in writing", "Ensure your sister's company submits a competitive bid and vote fairly", "Abstain from the final vote only", "Nothing — it is a personal family matter unrelated to work"],
     "answer": 0, "explanation": "A family financial interest in a vendor being evaluated is a clear conflict of interest. You must disclose it to management and recuse yourself from the entire process — not just the final vote."},
    {"question": "A cash gift of GH₵ 200 is handed to you by a customer as a personal thank-you after a successful order. What is the correct action?",
     "options": ["Accept it — GH₵ 200 is modest and harmless", "Decline it — cash gifts are always prohibited regardless of amount", "Accept it but donate to charity later", "Accept it if you declare it to HR"],
     "answer": 1, "explanation": "Cash gifts are always prohibited under DAS Plc policy — no exceptions based on amount. You must politely decline and explain that DAS Plc policy does not permit cash gifts."},
    {"question": "You overhear two colleagues making racially offensive comments about a new team member in the corridor. What should you do?",
     "options": ["Ignore it — it is between them and the new employee", "Tell the new employee privately so they can decide whether to report it", "Report it to the Head of Human Resources — harassment must not be tolerated", "Speak to the colleagues informally and ask them to stop"],
     "answer": 2, "explanation": "Racial harassment is unacceptable and must not be countenanced under any circumstances. You have a duty to report it to HR even if you are a bystander. DAS Plc will protect you from retaliation for reporting in good faith."},
    {"question": "While looking through shared files for a project, you accidentally find salary details and personal performance reviews for colleagues. What do you do?",
     "options": ["Note the details since they might be useful context", "Close the files and report the access control issue to IT", "Share the information only with your direct manager", "Use the information to negotiate your own salary"],
     "answer": 1, "explanation": "Personnel and salary records are confidential. Accidentally accessing them creates an obligation to close the files immediately and report the access control failure to IT. Using or sharing the information violates DAS Plc's confidentiality policy."},
    {"question": "DAS Plc's Business Ethics Policy applies to which employees?",
     "options": ["Only EXCO and senior managers", "Only employees in Finance, Procurement, and Sales roles", "Every employee at every level across DAS Plc", "Only employees who signed a separate ethics agreement"],
     "answer": 2, "explanation": "The Business Ethics Policy applies to every employee at every level across DAS Plc — from production floor staff to the CEO. Adherence is a condition of employment."},
    {"question": "You want to post a comment on LinkedIn about a business challenge DAS Plc is facing in the pharmaceutical market. Is this acceptable?",
     "options": ["Yes — it is your personal account and your personal opinion", "Yes — if you state it is your personal view and not DAS Plc's official position", "No — employees must not post about DAS Plc business challenges on social media without authorisation", "Yes — only if the post is positive"],
     "answer": 2, "explanation": "Posting about DAS Plc business challenges on social media without authorisation could expose the company to reputational and legal risk. Even on personal accounts, employees are bound by the social networking provisions of the Business Ethics Policy."},
    {"question": "A colleague from another department asks you to share a copy of a confidential supplier contract to help them understand pricing. They are a DAS employee but not involved in procurement. What do you do?",
     "options": ["Share it — they are a DAS employee, so it is fine", "Refuse — confidential information may only be shared when appropriately authorised, for a legitimate business reason, and securely", "Share a summary only", "Share it but ask them to delete it afterwards"],
     "answer": 1, "explanation": "Confidential information may only be disclosed when it has been appropriately authorised, serves a legitimate business reason, and is communicated securely. A colleague's curiosity about pricing is not sufficient justification."},
    {"question": "What is the DAS Plc Confidential Reporting Hotline number?",
     "options": ["0302123456", "0241640540", "0244000001", "0800DAS001"],
     "answer": 1, "explanation": "The DAS Plc Confidential Reporting Hotline is 0241640540. This line is available for all employees to raise concerns for reporting, investigation, and resolution by the CEO and/or Board."},
    {"question": "You receive a complaint from a customer that one of your products has quality issues. Your manager asks you not to document the complaint to avoid regulatory scrutiny. What do you do?",
     "options": ["Follow your manager's instruction — they have more context", "Document the complaint accurately as required by DAS Plc policy and escalate the instruction to HR or Corporate Affairs", "Document it informally in personal notes only", "Wait to see if more complaints come in before acting"],
     "answer": 1, "explanation": "Suppressing customer complaints violates DAS Plc's record-keeping policy and may breach Ghana FDA pharmaceutical regulations. You must document accurately and escalate the improper instruction through HR or Corporate Affairs."},
    {"question": "What must happen with all gifts offered — whether accepted or not?",
     "options": ["Nothing — only accepted gifts need to be reported", "They must be declared by logging details in Business Central or completing the Declaration of Gifts form", "They must be declared only if the value exceeds GH₵ 500", "They must be declared only to your direct line manager"],
     "answer": 1, "explanation": "All gifts — whether accepted or declined — must be declared by logging into Business Central (NAV) or completing the Declaration of Gifts form. The declaration obligation applies regardless of the value or outcome."},
    {"question": "DAS Plc's ethics policy is reviewed how often?",
     "options": ["Every 5 years", "Only when the law changes", "Annually", "At the discretion of the CEO"],
     "answer": 2, "explanation": "The Business Ethics Policy is reviewed annually to ensure it remains appropriate and current. Senior managers are also required to communicate it to their departments every year."},
]

@app.route('/admin/login', methods=['GET', 'POST'])
def admin_login():
    error = None
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        ip = request.remote_addr
        locked, secs = _check_lockout(f'admin:{ip}')
        if locked:
            error = f'Too many failed attempts. Try again in {secs//60+1} min.'
        else:
            conn = get_db()
            row = conn.execute("SELECT * FROM admin_users WHERE username=?", (username,)).fetchone()
            conn.close()
            if row and _cph(row['password_hash'], request.form.get('password', '')):
                _clear_lockout(f'admin:{ip}')
                session['admin_logged_in'] = True
                session['admin_user'] = username
                if row['must_change_pw']:
                    return redirect('/admin/change-password')
                return redirect('/admin')
            _record_failure(f'admin:{ip}')
            error = 'Invalid username or password.'
    err_html = f'<div class="err">{error}</div>' if error else ''
    return LOGIN_PAGE_HTML.replace('{err_html}', err_html)

@app.after_request
def _security_headers(resp):
    resp.headers.setdefault('X-Content-Type-Options', 'nosniff')
    resp.headers.setdefault('X-Frame-Options', 'SAMEORIGIN')
    resp.headers.setdefault('Referrer-Policy', 'same-origin')
    return resp

@app.route('/sso')
def sso_login():
    """Hub single sign-on for training admins (inactive unless SSO_SECRET is set)."""
    import sys as _sys
    _sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    try:
        from common import sso
    except ImportError:
        return 'SSO not available', 404
    claims = sso.verify(request.args.get('ticket', ''), 'cybershield')
    if not claims or claims.get('role') not in ('admin', 'it_manager', 'hr'):
        return 'Invalid, expired or unauthorised sign-in ticket.', 403
    session['admin_logged_in'] = True
    session['admin_user'] = 'hub:' + claims['sub']
    return redirect('/admin')

@app.route('/admin/logout')
def admin_logout():
    session.pop('admin_logged_in', None)
    session.pop('admin_user', None)
    return redirect('/admin/login')

@app.route('/admin/change-password', methods=['GET', 'POST'])
def admin_change_password():
    if not session.get('admin_logged_in'):
        return redirect('/admin/login')
    error = None
    if request.method == 'POST':
        new_pw  = request.form.get('new_password', '')
        confirm = request.form.get('confirm', '')
        if len(new_pw) < 10:
            error = 'Password must be at least 10 characters.'
        elif new_pw != confirm:
            error = 'Passwords do not match.'
        else:
            conn = get_db()
            conn.execute(
                "UPDATE admin_users SET password_hash=?, must_change_pw=0 WHERE username=?",
                (_gph2(new_pw), session['admin_user'])
            )
            conn.commit(); conn.close()
            return redirect('/admin')
    err_html = f'<div class="err">{error}</div>' if error else ''
    return CHANGE_PAGE_HTML.replace('{err_html}', err_html)
# ────────────────────────────────────────────────────────────────────────────
@app.route('/')
def index():
    return render_template('index.html')

# ── Deadline enforcement helper ───────────────────────────────────────────────
def _deadline_exceeded():
    """Return True if the current trainee deadline has passed."""
    tid = session.get('trainee_id')
    if not tid:
        return False
    conn = get_db()
    row  = conn.execute('SELECT deadline_at FROM trainees WHERE id=?', (tid,)).fetchone()
    conn.close()
    if not row or not row['deadline_at']:
        return False
    try:
        deadline = datetime.fromisoformat(row['deadline_at'])
    except ValueError:
        return False
    return datetime.now() > deadline

@app.route('/expired')
def expired():
    name     = session.get('trainee_name', 'Employee')
    tid      = session.get('trainee_id')
    deadline = ''
    if tid:
        conn = get_db()
        row  = conn.execute('SELECT deadline_at FROM trainees WHERE id=?', (tid,)).fetchone()
        conn.close()
        if row and row['deadline_at']:
            deadline = row['deadline_at'][:10]
    return render_template('expired.html', trainee_name=name, deadline=deadline), 403


@app.route('/start', methods=['POST'])
def start_training():
    name   = request.form.get('name', '').strip()
    emp_id = request.form.get('employee_id', '').strip()
    dept   = request.form.get('department', '').strip()
    track  = request.form.get('track', 'onboarding')
    if not name:
        return redirect(url_for('index'))
    started   = datetime.now()
    deadline  = started + timedelta(days=5)
    # Auto-lookup manager from dept_managers table — no manual input needed
    lm_email = get_manager_email(dept)
    conn = get_db()
    cur  = conn.execute(
        '''INSERT INTO trainees
           (name, employee_id, department, track, started_at, deadline_at, line_manager_email, hr_email)
           VALUES (?,?,?,?,?,?,?,?)''',
        (name, emp_id, dept, track,
         started.isoformat(), deadline.isoformat(),
         lm_email, GLOBAL_HR_EMAIL))
    trainee_id = cur.lastrowid
    conn.commit(); conn.close()
    session['trainee_id']   = trainee_id
    session['trainee_name'] = name
    session['track']        = track
    # Fire the manager's assignment notice in the background so SMTP latency
    # never delays the trainee's redirect into their first module.
    threading.Thread(target=notify_assignment, args=(trainee_id,), daemon=True).start()
    if track == 'refresher':
        return redirect(url_for('module', module_id='r1'))
    if track == 'ethics':
        return redirect('/module/e1')
    return redirect(url_for('module', module_id='m1'))

@app.route('/module/<module_id>')
def module(module_id):
    if 'trainee_id' not in session:
        return redirect(url_for('index'))
    if _deadline_exceeded():
        return redirect(url_for('expired'))
    templates = {
        'm1': 'module_intro.html',    'm2': 'module_phishing.html',
        'm3': 'module_smishing.html', 'm4': 'module_usb.html',
        'm5': 'module_password.html', 'm6': 'module_social.html',
        'm7': 'module_phishing_practice.html',
        'r1': 'module_r_threats.html','r2': 'module_r_scenario.html',
        'r3': 'module_r_policy.html',
        'e1': 'module_ethics_m1.html','e2': 'module_ethics_m2.html',
        'e3': 'module_ethics_m3.html','e4': 'module_ethics_m4.html',
        'e5': 'module_ethics_m5.html','e6': 'module_ethics_m6.html',
    }
    tmpl = templates.get(module_id)
    if not tmpl:
        return redirect(url_for('index'))
    conn2 = get_db()
    row2  = conn2.execute('SELECT deadline_at FROM trainees WHERE id=?', (session['trainee_id'],)).fetchone()
    conn2.close()
    deadline_at = row2['deadline_at'] if row2 else None
    return render_template(tmpl, module_id=module_id,
                           trainee_name=session.get('trainee_name', 'Employee'),
                           track=session.get('track', 'onboarding'),
                           deadline_at=deadline_at)

@app.route('/api/complete_module', methods=['POST'])
def complete_module():
    data = request.get_json()
    tid  = session.get('trainee_id')
    if not tid:
        return jsonify({'ok': False})
    conn = get_db()
    conn.execute('INSERT INTO progress (trainee_id, module_id, completed_at, score) VALUES (?,?,?,?)',
                 (tid, data.get('module_id'), datetime.now().isoformat(), data.get('score', 0)))
    conn.commit(); conn.close()
    return jsonify({'ok': True})

@app.route('/api/submit_quiz', methods=['POST'])
def submit_quiz():
    data  = request.get_json()
    score = data.get('score', 0)
    total = data.get('total', 1)
    pct   = round((score / total) * 100)
    passed= pct >= 70
    tid   = session.get('trainee_id')
    cert_ref = None
    if passed and tid:
        cert_ref = 'CERT-DAS-' + datetime.now().strftime('%Y%m%d') + '-' + ''.join(
            random.choices(string.ascii_uppercase + string.digits, k=6))
        conn = get_db()
        conn.execute('UPDATE trainees SET completed_at=?, score=?, cert_ref=? WHERE id=?',
                     (datetime.now().isoformat(), pct, cert_ref, tid))
        conn.commit(); conn.close()
        session['cert_ref']    = cert_ref
        session['final_score'] = pct
        # Close the loop with the line manager — background thread, same reasoning as notify_assignment.
        threading.Thread(target=notify_completion, args=(tid,), daemon=True).start()
    return jsonify({'passed': passed, 'pct': pct, 'cert_ref': cert_ref})

@app.route('/certificate')
def certificate():
    if 'trainee_id' not in session:
        return redirect(url_for('index'))
    cert_ref = session.get('cert_ref', 'CERT-DAS-PENDING')
    score    = session.get('final_score', 0)
    return render_template('certificate.html',
                           trainee_name=session.get('trainee_name', 'Employee'),
                           cert_ref=cert_ref, score=score,
                           track=session.get('track', 'onboarding'),
                           completion_date=datetime.now().strftime('%d %B %Y'))

@app.route('/api/onboarding/complete', methods=['POST'])
def itam_complete():
    data = request.get_json() or {}
    return jsonify({'status': 'received', 'data': data})


# ─────────────────────────────────────────────────────────────────────────────
# CUSTOM QUESTIONS TABLE — created on startup
# ─────────────────────────────────────────────────────────────────────────────

def _ensure_custom_questions_table():
    conn = get_db()
    conn.execute("""CREATE TABLE IF NOT EXISTS custom_questions (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        track       TEXT NOT NULL DEFAULT 'onboarding',
        question    TEXT NOT NULL,
        options     TEXT NOT NULL,
        answer      INTEGER NOT NULL DEFAULT 0,
        explanation TEXT DEFAULT '',
        active      INTEGER DEFAULT 1,
        created_at  TEXT DEFAULT (datetime('now')),
        created_by  TEXT DEFAULT 'admin'
    )""")
    conn.commit()
    conn.close()

_ensure_custom_questions_table()


# ─────────────────────────────────────────────────────────────────────────────
# QUIZ — merges built-in + admin edits (overrides) + active custom questions
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/quiz')
def quiz():
    if 'trainee_id' not in session:
        return redirect(url_for('index'))
    if _deadline_exceeded():
        return redirect(url_for('expired'))
    track = session.get('track', 'onboarding')
    if track == 'ethics':
        base = list(ETHICS_QUIZ)
    elif track == 'refresher':
        base = list(REFRESHER_QUIZ)
    else:
        base = list(ONBOARDING_QUIZ)

    # Apply any admin edits to built-in questions
    conn = get_db()
    overrides = {r['q_index']: r for r in
                 conn.execute('SELECT * FROM quiz_overrides WHERE track=?', (track,)).fetchall()}
    for i, q in enumerate(base):
        ov = overrides.get(i)
        if ov:
            base[i] = {
                'q':           ov['question']    or q['q'],
                'options':     [ov['option_a'] or q['options'][0],
                                ov['option_b'] or q['options'][1],
                                ov['option_c'] or q['options'][2],
                                ov['option_d'] or q['options'][3]],
                'answer':      ov['answer']      if ov['answer'] is not None else q['answer'],
                'explanation': ov['explanation'] or q['explanation'],
            }

    # Append any active custom questions admin added
    custom = conn.execute(
        "SELECT * FROM custom_questions WHERE track=? AND active=1 ORDER BY id", (track,)
    ).fetchall()
    conn.close()
    for cq in custom:
        base.append({
            'q':           cq['question'],
            'options':     json.loads(cq['options']),
            'answer':      cq['answer'],
            'explanation': cq['explanation'],
        })
    conn3 = get_db()
    row3  = conn3.execute('SELECT deadline_at FROM trainees WHERE id=?', (session.get('trainee_id'),)).fetchone()
    conn3.close()
    deadline_at = row3['deadline_at'] if row3 else None
    return render_template('final_quiz.html',
                           questions=json.dumps(base), total=len(base),
                           trainee_name=session.get('trainee_name', 'Employee'), track=track,
                           deadline_at=deadline_at)


# ─────────────────────────────────────────────────────────────────────────────
# ADMIN DASHBOARD
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/admin')
@admin_required
def admin():
    conn     = get_db()
    trainees_raw = conn.execute('SELECT * FROM trainees ORDER BY id DESC').fetchall()
    from datetime import datetime as _dt2
    now_ts = _dt2.now()
    trainees = []
    for t in trainees_raw:
        t = dict(t)
        if t.get('deadline_at') and not t.get('completed_at'):
            try:
                dl = _dt2.fromisoformat(t['deadline_at'])
                delta = dl - now_ts
                t['days_left'] = max(0, delta.days)
                t['hours_left'] = max(0, int(delta.total_seconds() // 3600))
                t['deadline_exceeded'] = delta.total_seconds() < 0
            except Exception:
                t['days_left'] = None
                t['hours_left'] = None
                t['deadline_exceeded'] = False
        else:
            t['days_left'] = None
            t['hours_left'] = None
            t['deadline_exceeded'] = False
        trainees.append(t)
    stats    = conn.execute("""SELECT COUNT(*) as total,
        SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN cert_ref IS NOT NULL THEN 1 ELSE 0 END) as certs,
        ROUND(AVG(CASE WHEN score IS NOT NULL THEN score END),1) as avg_score
        FROM trainees""").fetchone()
    custom_on  = conn.execute("SELECT * FROM custom_questions WHERE track='onboarding' ORDER BY id").fetchall()
    custom_ref = conn.execute("SELECT * FROM custom_questions WHERE track='refresher'  ORDER BY id").fetchall()
    conn.close()
    return render_template('admin.html', trainees=trainees, stats=stats,
                           custom_on=custom_on, custom_ref=custom_ref,
                           builtin_on=len(ONBOARDING_QUIZ), builtin_ref=len(REFRESHER_QUIZ),
                           debug_mode=DEBUG_MODE)




# ── TEST HELPER: instantly expire current trainee's deadline ─────────────────
# Data-mutating and DEBUG-only: never reachable unless DEBUG_MODE=true in .env.
# (Audit note: a GET route that mutates compliance data is itself a CSRF risk —
# these must never be enabled on a production/live compliance instance.)
@app.route('/admin/test/expire/<int:tid>')
@admin_required
def test_expire_trainee(tid):
    """Set deadline to 1 minute ago for testing expiry flow. DEBUG_MODE only."""
    if not DEBUG_MODE:
        return ('<p style="font-family:monospace;padding:20px">Test/debug routes are disabled. '
                'Set DEBUG_MODE=true in .env on a non-production instance to enable.</p>'), 403
    from datetime import datetime, timedelta
    expired_ts = (datetime.now() - timedelta(minutes=1)).isoformat()
    conn = get_db()
    conn.execute('UPDATE trainees SET deadline_at=? WHERE id=?', (expired_ts, tid))
    conn.commit(); conn.close()
    return f'<p style="font-family:monospace;padding:20px">Trainee {tid} deadline set to 1 minute ago. <a href="/admin">Back to admin</a></p>'

# ── RESET with compliance notification ──────────────────────────────────────
@app.route('/admin/reset/<int:tid>', methods=['POST'])
@admin_required
def reset_trainee(tid):
    """Reset deadline + send compliance notifications to manager, HR, trainee, IT."""
    reason = request.form.get('reason', 'No reason provided').strip() or 'No reason provided'
    actioned_by = session.get('admin_user', 'admin')
    new_deadline = (datetime.now() + timedelta(days=5))
    conn = get_db()
    t = conn.execute('SELECT * FROM trainees WHERE id=?', (tid,)).fetchone()
    if not t:
        conn.close()
        return redirect(url_for('admin'))
    # Reset deadline, clear the full notification cadence so it restarts cleanly
    conn.execute(
        """UPDATE trainees SET deadline_at=?, expiry_notified=0, warning_sent=0,
           reminder_7d_sent=0, overdue_notice_count=0, last_overdue_notice_at=NULL,
           escalated_at=NULL WHERE id=?""",
        (new_deadline.isoformat(), tid)
    )
    conn.commit(); conn.close()

    name     = t['name']
    dept     = t['department'] or 'Unknown'
    emp_id   = t['employee_id'] or 'N/A'
    track    = t['track'].title()
    lm_email = get_manager_email(t['department'])
    new_dl_str = new_deadline.strftime('%d %B %Y')
    emails_sent = []

    # ── Email to Line Manager ──────────────────────────────────────────────
    rows_mgr = [
        ('Employee',        f'{name} ({emp_id})'),
        ('Department',      dept),
        ('Training Track',  track),
        ('Reset By',        f'IT Department ({actioned_by})'),
        ('Reason for Reset',reason),
        ('New Deadline',    f'<strong style="color:#1F3864">{new_dl_str}</strong>'),
        ('Status',          '<span style="color:#E8A020">RESET — TRAINING MUST BE COMPLETED</span>'),
    ]
    note_mgr = f"""<div style="background:#e8f4fd;border:1px solid #1F3864;border-radius:6px;padding:14px 16px;margin:16px 0;font-size:13px;line-height:1.7">
      <strong>For your records:</strong> This reset has been logged in the CyberShield compliance
      audit trail. <strong>{name}</strong> must complete their mandatory CyberShield training by
      <strong>{new_dl_str}</strong>. Please follow up to ensure compliance.
      Non-completion after a reset will be escalated further.
    </div>"""
    html_mgr = build_email_html(
        'Training Window Reset', '#1F3864',
        f'COMPLIANCE NOTICE — TRAINING RESET FOR {name.upper()}',
        rows_mgr, note_mgr,
        'This notification has been copied to HR, IT, and the employee.'
    )
    sent = send_email(
        list(dict.fromkeys([lm_email, GLOBAL_HR_EMAIL, GLOBAL_IT_EMAIL])),
        f'COMPLIANCE NOTICE — CyberShield Training Reset: {name} ({dept})', html_mgr
    )
    if sent:
        emails_sent += [lm_email, GLOBAL_HR_EMAIL, GLOBAL_IT_EMAIL]

    # ── Email to Trainee ───────────────────────────────────────────────────
    rows_emp = [
        ('Your Name',       name),
        ('Employee ID',     emp_id),
        ('Training Track',  track),
        ('New Deadline',    f'<strong style="color:#C00000">{new_dl_str}</strong>'),
    ]
    note_emp = f"""<div style="background:#fff0f0;border:1px solid #C00000;border-radius:6px;padding:14px 16px;margin:16px 0;font-size:13px;line-height:1.7">
      Your CyberShield training window has been reset. You must complete your
      <strong>{track}</strong> training by <strong>{new_dl_str}</strong>.
      Log in immediately at <strong>http://[server]:5076</strong> using your staff credentials.
      Your line manager and HR have been notified of this reset.
    </div>"""
    html_emp = build_email_html(
        'Your Training Has Been Reset', '#E8A020',
        'ACTION REQUIRED — COMPLETE YOUR TRAINING NOW',
        rows_emp, note_emp
    )
    # Best effort — trainee email may not be in system yet
    app.logger.info(f'Reset email sent to manager/HR for {name}. Reason: {reason}')

    # ── Log to compliance audit ────────────────────────────────────────────
    log_compliance_action(
        tid, 'DEADLINE_RESET', reason, actioned_by,
        new_deadline=new_deadline.isoformat(),
        emails_sent=list(dict.fromkeys(emails_sent))
    )
    return redirect(url_for('admin'))


# ── TEST HELPER: reset deadline to 5 days from now ──────────────────────────
# DEBUG_MODE only — see note above test_expire_trainee.
@app.route('/admin/test/reset/<int:tid>')
@admin_required
def test_reset_trainee(tid):
    """Quick reset for testing — no notifications sent. DEBUG_MODE only."""
    if not DEBUG_MODE:
        return ('<p style="font-family:monospace;padding:20px">Test/debug routes are disabled. '
                'Set DEBUG_MODE=true in .env on a non-production instance to enable.</p>'), 403
    new_deadline = (datetime.now() + timedelta(days=5)).isoformat()
    conn = get_db()
    conn.execute("""UPDATE trainees SET deadline_at=?, expiry_notified=0, warning_sent=0,
                    reminder_7d_sent=0, overdue_notice_count=0, last_overdue_notice_at=NULL,
                    escalated_at=NULL WHERE id=?""",
                 (new_deadline, tid))
    conn.commit(); conn.close()
    return f'<p style="font-family:monospace;padding:20px">Trainee {tid} reset (no emails). <a href="/admin">Back to admin</a></p>'


# ── Compliance audit log ──────────────────────────────────────────────────────
@app.route('/admin/compliance-log')
@admin_required
def compliance_log_view():
    conn  = get_db()
    logs  = conn.execute(
        """SELECT cl.*, t.name, t.employee_id, t.department, t.track
           FROM compliance_log cl
           LEFT JOIN trainees t ON cl.trainee_id = t.id
           ORDER BY cl.actioned_at DESC"""
    ).fetchall()
    conn.close()
    return render_template('compliance_log.html', logs=logs)


# ── Dept manager config ───────────────────────────────────────────────────────
@app.route('/admin/dept-managers', methods=['GET', 'POST'])
@admin_required
def dept_managers_view():
    conn = get_db()
    if request.method == 'POST':
        for dept in ['Finance','Human Resources','Sales & Marketing',
                     'Information Technology','Logistics','Risk & Compliance',
                     'Production','QA & QC','Engineering','Corporate Affairs']:
            email = request.form.get(f'email_{dept}', '').strip()
            if email:
                conn.execute(
                    """INSERT INTO dept_managers (department, manager_email, updated_at)
                       VALUES (?,?,?)
                       ON CONFLICT(department) DO UPDATE SET manager_email=excluded.manager_email,
                       updated_at=excluded.updated_at""",
                    (dept, email, datetime.now().isoformat())
                )
        conn.commit()
    managers = {r['department']: r['manager_email']
                for r in conn.execute('SELECT * FROM dept_managers').fetchall()}
    conn.close()
    return render_template('dept_managers.html', managers=managers)

# ─────────────────────────────────────────────────────────────────────────────
# BUSINESS ETHICS TRACK ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/module/e1')
def ethics_m1():
    if 'trainee_id' not in session:
        return redirect(url_for('index'))
    if _deadline_exceeded():
        return redirect(url_for('expired'))
    conn2 = get_db()
    row2  = conn2.execute('SELECT deadline_at FROM trainees WHERE id=?', (session['trainee_id'],)).fetchone()
    conn2.close()
    deadline_at = row2['deadline_at'] if row2 else None
    return render_template('module_ethics_m1.html', module_id='e1',
                           trainee_name=session.get('trainee_name', 'Employee'),
                           track='ethics', deadline_at=deadline_at)

@app.route('/module/e2')
def ethics_m2():
    if 'trainee_id' not in session:
        return redirect(url_for('index'))
    if _deadline_exceeded():
        return redirect(url_for('expired'))
    conn2 = get_db()
    row2  = conn2.execute('SELECT deadline_at FROM trainees WHERE id=?', (session['trainee_id'],)).fetchone()
    conn2.close()
    deadline_at = row2['deadline_at'] if row2 else None
    return render_template('module_ethics_m2.html', module_id='e2',
                           trainee_name=session.get('trainee_name', 'Employee'),
                           track='ethics', deadline_at=deadline_at)

@app.route('/module/e3')
def ethics_m3():
    if 'trainee_id' not in session:
        return redirect(url_for('index'))
    if _deadline_exceeded():
        return redirect(url_for('expired'))
    conn2 = get_db()
    row2  = conn2.execute('SELECT deadline_at FROM trainees WHERE id=?', (session['trainee_id'],)).fetchone()
    conn2.close()
    deadline_at = row2['deadline_at'] if row2 else None
    return render_template('module_ethics_m3.html', module_id='e3',
                           trainee_name=session.get('trainee_name', 'Employee'),
                           track='ethics', deadline_at=deadline_at)

@app.route('/module/e4')
def ethics_m4():
    if 'trainee_id' not in session:
        return redirect(url_for('index'))
    if _deadline_exceeded():
        return redirect(url_for('expired'))
    conn2 = get_db()
    row2  = conn2.execute('SELECT deadline_at FROM trainees WHERE id=?', (session['trainee_id'],)).fetchone()
    conn2.close()
    deadline_at = row2['deadline_at'] if row2 else None
    return render_template('module_ethics_m4.html', module_id='e4',
                           trainee_name=session.get('trainee_name', 'Employee'),
                           track='ethics', deadline_at=deadline_at)

@app.route('/module/e5')
def ethics_m5():
    if 'trainee_id' not in session:
        return redirect(url_for('index'))
    if _deadline_exceeded():
        return redirect(url_for('expired'))
    conn2 = get_db()
    row2  = conn2.execute('SELECT deadline_at FROM trainees WHERE id=?', (session['trainee_id'],)).fetchone()
    conn2.close()
    deadline_at = row2['deadline_at'] if row2 else None
    return render_template('module_ethics_m5.html', module_id='e5',
                           trainee_name=session.get('trainee_name', 'Employee'),
                           track='ethics', deadline_at=deadline_at)

@app.route('/module/e6')
def ethics_m6():
    if 'trainee_id' not in session:
        return redirect(url_for('index'))
    if _deadline_exceeded():
        return redirect(url_for('expired'))
    conn2 = get_db()
    row2  = conn2.execute('SELECT deadline_at FROM trainees WHERE id=?', (session['trainee_id'],)).fetchone()
    conn2.close()
    deadline_at = row2['deadline_at'] if row2 else None
    return render_template('module_ethics_m6.html', module_id='e6',
                           trainee_name=session.get('trainee_name', 'Employee'),
                           track='ethics', deadline_at=deadline_at)

# ─────────────────────────────────────────────────────────────────────────────
# BACKUP  (ISO 27001:2022 A.8.13 / DAS IT Policy IT22-001)
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/admin/backup')
@admin_required
def admin_backup():
    """Full JSON export of all training records and custom questions."""
    import shutil
    conn      = get_db()
    trainees  = [dict(r) for r in conn.execute('SELECT * FROM trainees').fetchall()]
    progress  = [dict(r) for r in conn.execute('SELECT * FROM progress').fetchall()]
    try:
        custom_q = [dict(r) for r in conn.execute('SELECT * FROM custom_questions').fetchall()]
    except Exception:
        custom_q = []
    conn.close()

    # Also write a timestamped copy to instance/backups/ for server-side retention
    backup_dir = os.path.join(os.path.dirname(DB), 'backups')
    os.makedirs(backup_dir, exist_ok=True)
    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    server_copy = os.path.join(backup_dir, f'cybershield_{ts}.json')

    payload = {
        'meta': {
            'system':         'CyberShield v3 — DAS Plc',
            'organisation':   'Dannex Ayrton Starwin Plc',
            'exported_by':    'Alvin E.J. Dagbui — Asst. IT Manager',
            'exported_at':    datetime.now().isoformat(),
            'format_version': '3.0',
            'standard':       'ISO 27001:2022 A.8.13 / DAS IT Policy IT22-001',
            'db_path':        DB,
        },
        'trainees':         trainees,
        'progress':         progress,
        'custom_questions': custom_q,
    }
    blob = json.dumps(payload, indent=2, ensure_ascii=False)
    try:
        with open(server_copy, 'w', encoding='utf-8') as f:
            f.write(blob)
        # Keep only last 30 backup files
        backups = sorted(os.listdir(backup_dir))
        for old in backups[:-30]:
            os.remove(os.path.join(backup_dir, old))
    except Exception:
        pass

    from flask import Response
    filename = f'cyberShield_backup_{ts}.json'
    return Response(blob, mimetype='application/json',
                    headers={'Content-Disposition': f'attachment; filename="{filename}"'})


@app.route('/admin/backup/list')
@admin_required
def admin_backup_list():
    """Return list of server-side backup files."""
    backup_dir = os.path.join(os.path.dirname(DB), 'backups')
    os.makedirs(backup_dir, exist_ok=True)
    files = sorted(os.listdir(backup_dir), reverse=True)
    result = []
    for fname in files[:30]:
        path = os.path.join(backup_dir, fname)
        try:
            size = os.path.getsize(path)
            mtime = datetime.fromtimestamp(os.path.getmtime(path)).strftime('%d %b %Y %H:%M')
            result.append({'name': fname, 'size_kb': round(size/1024, 1), 'modified': mtime})
        except Exception:
            pass
    return jsonify(result)


@app.route('/admin/backup/download/<filename>')
@admin_required
def admin_backup_download(filename):
    """Download a specific server-side backup file."""
    from flask import send_from_directory
    backup_dir = os.path.join(os.path.dirname(DB), 'backups')
    # Security: only allow .json files matching our naming pattern
    import re
    if not re.match(r'^cybershield_\d{8}_\d{6}\.json$', filename):
        return jsonify({'error': 'Invalid filename'}), 400
    return send_from_directory(backup_dir, filename, as_attachment=True)


@app.route('/admin/restore', methods=['POST'])
@admin_required
def admin_restore():
    """Restore from a JSON backup. Merges — does not overwrite existing records."""
    f = request.files.get('backup_file')
    if not f:
        return jsonify({'ok': False, 'error': 'No file uploaded'}), 400
    try:
        data = json.loads(f.read().decode('utf-8'))
    except Exception as e:
        return jsonify({'ok': False, 'error': f'Invalid JSON: {e}'}), 400

    if 'meta' not in data or 'trainees' not in data:
        return jsonify({'ok': False, 'error': 'Invalid backup format'}), 400
    if data['meta'].get('format_version', '0') not in ('3.0', '2.0', '1.0'):
        return jsonify({'ok': False, 'error': 'Unsupported backup version'}), 400

    conn = get_db()
    existing_certs = {r[0] for r in conn.execute(
        'SELECT cert_ref FROM trainees WHERE cert_ref IS NOT NULL').fetchall()}
    imp_t = imp_p = imp_q = 0

    for t in data.get('trainees', []):
        if t.get('cert_ref') and t['cert_ref'] in existing_certs:
            continue
        try:
            conn.execute("""INSERT INTO trainees
                (name,employee_id,department,track,started_at,completed_at,score,cert_ref,itam_synced)
                VALUES (?,?,?,?,?,?,?,?,?)""",
                (t.get('name',''), t.get('employee_id',''), t.get('department',''),
                 t.get('track','onboarding'), t.get('started_at'), t.get('completed_at'),
                 t.get('score'), t.get('cert_ref'), t.get('itam_synced', 0)))
            imp_t += 1
        except Exception:
            pass

    for p in data.get('progress', []):
        try:
            conn.execute('INSERT INTO progress (trainee_id,module_id,completed_at,score) VALUES (?,?,?,?)',
                (p.get('trainee_id'), p.get('module_id'), p.get('completed_at'), p.get('score')))
            imp_p += 1
        except Exception:
            pass

    for q in data.get('custom_questions', []):
        try:
            conn.execute("""INSERT INTO custom_questions
                (track,question,options,answer,explanation,active) VALUES (?,?,?,?,?,?)""",
                (q.get('track','onboarding'), q.get('question',''),
                 q.get('options','[]'), q.get('answer',0),
                 q.get('explanation',''), q.get('active',1)))
            imp_q += 1
        except Exception:
            pass

    conn.commit(); conn.close()
    return jsonify({'ok': True,
                    'imported': {'trainees': imp_t, 'progress': imp_p, 'questions': imp_q},
                    'exported_at': data['meta'].get('exported_at','unknown')})


# ─────────────────────────────────────────────────────────────────────────────
# CONTENT MANAGEMENT — Custom quiz questions CRUD
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/api/questions', methods=['GET'])
def api_get_questions():
    track = request.args.get('track', 'onboarding')
    conn  = get_db()
    rows  = conn.execute('SELECT * FROM custom_questions WHERE track=? ORDER BY id', (track,)).fetchall()
    conn.close()
    return jsonify([{'id': r['id'], 'track': r['track'], 'question': r['question'],
                     'options': json.loads(r['options']), 'answer': r['answer'],
                     'explanation': r['explanation'], 'active': r['active'],
                     'created_at': r['created_at']} for r in rows])

@app.route('/api/questions', methods=['POST'])
@admin_required
def api_add_question():
    d = request.get_json()
    if not d or not d.get('question') or not d.get('options'):
        return jsonify({'ok': False, 'error': 'question and options are required'}), 400
    opts = d.get('options', [])
    if len(opts) < 2 or len(opts) > 4:
        return jsonify({'ok': False, 'error': 'Must supply 2-4 answer options'}), 400
    answer = int(d.get('answer', 0))
    if answer < 0 or answer >= len(opts):
        return jsonify({'ok': False, 'error': 'answer index out of range'}), 400
    conn = get_db()
    cur  = conn.execute("""INSERT INTO custom_questions
        (track,question,options,answer,explanation,active,created_by) VALUES (?,?,?,?,?,1,'admin')""",
        (d.get('track','onboarding'), d['question'], json.dumps(opts), answer, d.get('explanation','')))
    new_id = cur.lastrowid
    conn.commit(); conn.close()
    return jsonify({'ok': True, 'id': new_id})

@app.route('/api/questions/<int:qid>', methods=['PUT'])
@admin_required
def api_update_question(qid):
    d    = request.get_json()
    conn = get_db()
    row  = conn.execute('SELECT * FROM custom_questions WHERE id=?', (qid,)).fetchone()
    if not row: conn.close(); return jsonify({'ok': False, 'error': 'Not found'}), 404
    conn.execute("""UPDATE custom_questions
        SET track=?,question=?,options=?,answer=?,explanation=?,active=? WHERE id=?""",
        (d.get('track', row['track']),
         d.get('question', row['question']),
         json.dumps(d.get('options', json.loads(row['options']))),
         int(d.get('answer', row['answer'])),
         d.get('explanation', row['explanation']),
         int(d.get('active', row['active'])), qid))
    conn.commit(); conn.close()
    return jsonify({'ok': True})

@app.route('/api/questions/<int:qid>', methods=['DELETE'])
@admin_required
def api_delete_question(qid):
    conn = get_db()
    conn.execute('DELETE FROM custom_questions WHERE id=?', (qid,))
    conn.commit(); conn.close()
    return jsonify({'ok': True})

@app.route('/api/questions/<int:qid>/toggle', methods=['POST'])
@admin_required
def api_toggle_question(qid):
    conn = get_db()
    row  = conn.execute('SELECT active FROM custom_questions WHERE id=?', (qid,)).fetchone()
    if not row: conn.close(); return jsonify({'ok': False, 'error': 'Not found'}), 404
    new_active = 0 if row['active'] else 1
    conn.execute('UPDATE custom_questions SET active=? WHERE id=?', (new_active, qid))
    conn.commit(); conn.close()
    return jsonify({'ok': True, 'active': new_active})


# ── LESSON EDITOR ─────────────────────────────────────────────────────────────
# Admin can view, edit, and save module lesson content (the HTML template files)
# and also edit existing built-in quiz questions stored in the DB override table.

EDITABLE_MODULES = {
    'm1': {'name': 'Onboarding 1 — Introduction to Cybersecurity',    'file': 'module_intro.html',    'track': 'onboarding'},
    'm2': {'name': 'Onboarding 2 — Phishing & Outlook Reporting',     'file': 'module_phishing.html', 'track': 'onboarding'},
    'm3': {'name': 'Onboarding 3 — Smishing & Vishing',               'file': 'module_smishing.html', 'track': 'onboarding'},
    'm4': {'name': 'Onboarding 4 — USB Drop Attack Prevention',       'file': 'module_usb.html',      'track': 'onboarding'},
    'm5': {'name': 'Onboarding 5 — Password Hygiene & MFA',           'file': 'module_password.html', 'track': 'onboarding'},
    'm6': {'name': 'Onboarding 6 — Social Engineering Defence',       'file': 'module_social.html',   'track': 'onboarding'},
    'm7': {'name': 'Onboarding 7 — Outlook Phishing Reporting Drill', 'file': 'module_phishing_practice.html', 'track': 'onboarding'},
    'r1': {'name': 'Refresher 1 — New Threats 2025/2026',             'file': 'module_r_threats.html','track': 'refresher'},
    'r2': {'name': 'Refresher 2 — Advanced Scenario Challenges',      'file': 'module_r_scenario.html','track':'refresher'},
    'r3': {'name': 'Refresher 3 — IS Policy Updates IT22-001',        'file': 'module_r_policy.html', 'track': 'refresher'},
}

def _ensure_quiz_overrides_table():
    conn = get_db()
    conn.execute('''CREATE TABLE IF NOT EXISTS quiz_overrides (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        track       TEXT NOT NULL,
        q_index     INTEGER NOT NULL,
        question    TEXT,
        option_a    TEXT,
        option_b    TEXT,
        option_c    TEXT,
        option_d    TEXT,
        answer      INTEGER,
        explanation TEXT,
        created_at  TEXT DEFAULT (datetime('now')),
        updated_at  TEXT DEFAULT (datetime('now')),
        UNIQUE(track, q_index)
    )''')
    conn.commit(); conn.close()

_ensure_quiz_overrides_table()

def _get_quiz_for_edit(track):
    """Return quiz questions merged with any DB overrides, for the editor."""
    base = list(REFRESHER_QUIZ if track == 'refresher' else ONBOARDING_QUIZ)
    conn = get_db()
    overrides = {r['q_index']: r for r in
                 conn.execute('SELECT * FROM quiz_overrides WHERE track=?', (track,)).fetchall()}
    conn.close()
    merged = []
    for i, q in enumerate(base):
        ov = overrides.get(i)
        if ov:
            merged.append({
                'index': i,
                'q':       ov['question']    or q['q'],
                'options': [ov['option_a'] or q['options'][0],
                            ov['option_b'] or q['options'][1],
                            ov['option_c'] or q['options'][2],
                            ov['option_d'] or q['options'][3]],
                'answer':      ov['answer']      if ov['answer'] is not None else q['answer'],
                'explanation': ov['explanation'] or q['explanation'],
                'overridden':  True,
            })
        else:
            merged.append({
                'index': i,
                'q':           q['q'],
                'options':     q['options'],
                'answer':      q['answer'],
                'explanation': q['explanation'],
                'overridden':  False,
            })
    return merged


@app.route('/admin/lessons')
@admin_required
def admin_lessons():
    return render_template('admin_lessons.html',
                           modules=EDITABLE_MODULES)


@app.route('/admin/lessons/<module_id>')
@admin_required
def admin_lesson_edit(module_id):
    mod = EDITABLE_MODULES.get(module_id)
    if not mod:
        return redirect(url_for('admin_lessons'))
    tmpl_path = os.path.join(os.path.dirname(__file__), 'templates', mod['file'])
    try:
        with open(tmpl_path, encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        content = f'<!-- Could not read template: {e} -->'
    return render_template('admin_lesson_editor.html',
                           module_id=module_id, mod=mod,
                           content=content, modules=EDITABLE_MODULES)


@app.route('/admin/lessons/<module_id>/save', methods=['POST'])
@admin_required
def admin_lesson_save(module_id):
    mod = EDITABLE_MODULES.get(module_id)
    if not mod:
        return jsonify({'ok': False, 'error': 'Unknown module'}), 404
    new_content = request.form.get('content', '')
    tmpl_path   = os.path.join(os.path.dirname(__file__), 'templates', mod['file'])
    # Backup original before first save
    backup_path = tmpl_path + '.bak'
    if not os.path.exists(backup_path):
        try:
            import shutil
            shutil.copy2(tmpl_path, backup_path)
        except Exception:
            pass
    try:
        with open(tmpl_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        return jsonify({'ok': True, 'msg': f'{mod["name"]} saved successfully'})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@app.route('/admin/lessons/<module_id>/restore', methods=['POST'])
@admin_required
def admin_lesson_restore(module_id):
    """Restore module to original backup if it exists."""
    mod = EDITABLE_MODULES.get(module_id)
    if not mod:
        return jsonify({'ok': False, 'error': 'Unknown module'}), 404
    tmpl_path   = os.path.join(os.path.dirname(__file__), 'templates', mod['file'])
    backup_path = tmpl_path + '.bak'
    if not os.path.exists(backup_path):
        return jsonify({'ok': False, 'error': 'No backup exists — original has not been modified yet'})
    try:
        import shutil
        shutil.copy2(backup_path, tmpl_path)
        return jsonify({'ok': True, 'msg': 'Module restored to original content'})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@app.route('/admin/quiz/<track>')
@admin_required
def admin_quiz_edit(track):
    if track not in ('onboarding', 'refresher'):
        return redirect(url_for('admin_lessons'))
    questions = _get_quiz_for_edit(track)
    return render_template('admin_quiz_editor.html',
                           track=track, questions=questions,
                           modules=EDITABLE_MODULES)


@app.route('/admin/quiz/<track>/save', methods=['POST'])
@admin_required
def admin_quiz_save(track):
    if track not in ('onboarding', 'refresher'):
        return jsonify({'ok': False, 'error': 'Invalid track'}), 400
    data = request.get_json()
    if not data:
        return jsonify({'ok': False, 'error': 'No data received'}), 400
    conn = get_db()
    saved = 0
    for q in data.get('questions', []):
        idx = int(q.get('index', -1))
        if idx < 0:
            continue
        conn.execute('''INSERT INTO quiz_overrides
            (track, q_index, question, option_a, option_b, option_c, option_d, answer, explanation, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))
            ON CONFLICT(track, q_index) DO UPDATE SET
                question=excluded.question, option_a=excluded.option_a,
                option_b=excluded.option_b, option_c=excluded.option_c,
                option_d=excluded.option_d, answer=excluded.answer,
                explanation=excluded.explanation, updated_at=excluded.updated_at
        ''', (track, idx,
              q.get('q',''), q.get('option_a',''), q.get('option_b',''),
              q.get('option_c',''), q.get('option_d',''),
              int(q.get('answer', 0)), q.get('explanation','')))
        saved += 1
    conn.commit(); conn.close()
    return jsonify({'ok': True, 'saved': saved,
                    'msg': f'{saved} question(s) saved for {track} track'})


@app.route('/admin/quiz/<track>/reset/<int:q_index>', methods=['POST'])
@admin_required
def admin_quiz_reset_one(track, q_index):
    """Remove override for a single question — reverts it to the built-in."""
    conn = get_db()
    conn.execute('DELETE FROM quiz_overrides WHERE track=? AND q_index=?', (track, q_index))
    conn.commit(); conn.close()
    return jsonify({'ok': True, 'msg': f'Question {q_index} reset to original'})



if __name__ == '__main__':
    try:
        from waitress import serve
        print("=" * 60)
        print("  CyberShield v3 — Dannex Ayrton Starwin Plc")
        print("  IT Security Awareness Training Platform")
        print("=" * 60)
        print(f"  Platform URL : http://localhost:5076")
        print(f"  Admin panel  : http://localhost:5076/admin")
        print(f"  Lesson editor: http://localhost:5076/admin/lessons")
        print(f"  Database     : {DB}")
        print("  Press Ctrl+C to stop")
        print("=" * 60)
        serve(app, host='0.0.0.0', port=5076)
    except ImportError:
        app.run(host='0.0.0.0', port=5076, debug=False, ssl_context='adhoc')
