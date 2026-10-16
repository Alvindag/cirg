"""
ITAM v2 — IT Asset Management System
DAS Plc (Dannex · Ayrton · Starwin) | Port 5057
v2: Excel upload/download, duplicate prevention, validation,
    user roles, pagination, session timeout, audit log
"""

from flask import (Flask, render_template, request, redirect, url_for,
                   flash, jsonify, make_response, session, send_file)
from flask_login import (LoginManager, UserMixin, login_user, logout_user,
                         login_required, current_user)
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from functools import wraps
from io import BytesIO
from datetime import datetime, date, timedelta
import sqlite3, os, re, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

# ── optional Excel support ────────────────────────────────────────────────────
try:
    import openpyxl
    from openpyxl.styles import (Font, PatternFill, Alignment, Border, Side,
                                  GradientFill)
    from openpyxl.utils import get_column_letter
    from openpyxl.worksheet.datavalidation import DataValidation
    HAS_EXCEL = True
except ImportError:
    HAS_EXCEL = False

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas as rlcanvas
    from reportlab.lib import colors as rlcolors
    HAS_PDF = True
except ImportError:
    HAS_PDF = False

app = Flask(__name__)


def _load_secret_key():
    """ITAM_SECRET_KEY env var wins; otherwise a random key is generated once and
    persisted beside the database (never a key committed in source)."""
    env = os.environ.get('ITAM_SECRET_KEY')
    if env:
        return env
    import secrets as _sec
    path = os.path.join(os.path.dirname(DB_PATH), '.secret_key')
    try:
        with open(path) as f:
            return f.read().strip()
    except OSError:
        key = _sec.token_hex(32)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w') as f:
            f.write(key)
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass
        return key
app.config['SESSION_COOKIE_NAME']     = 'itam_session'
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE']   = os.environ.get('COOKIE_SECURE', '').lower() in ('1', 'true', 'yes')
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(minutes=30)
app.config['UPLOAD_FOLDER']  = os.path.join(os.path.dirname(__file__), 'uploads')
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024  # 10 MB

DB_PATH = os.environ.get('ITAM_DB_PATH') or os.path.join(os.path.dirname(__file__), 'instance', 'itam.db')
app.secret_key = _load_secret_key()
login_manager = LoginManager(app)
login_manager.login_view = 'login'

ALLOWED_EXTENSIONS = {'xlsx', 'xls'}

# ── Reference Data ────────────────────────────────────────────────────────────
LOCATIONS = [
    'NIA — HQ',
    'TA-F1',
    'TA-F2',
    'TAMELE',
    'KUMASI',
    'TAKRODI',
    'Off-Site / Remote',
]
LOCATION_FULL = {
    'NIA — HQ':         'NIA — Head Office (Accra)',
    'TA-F1':            'TA-F1 — Factory 1',
    'TA-F2':            'TA-F2 — Factory 2',
    'TAMELE':           'TAMALE Office',
    'KUMASI':           'KUMASI Office',
    'TAKRODI':          'TAKORADI Office',
    'Off-Site / Remote':'Off-Site / Remote',
}
COMPANIES = [
    'DAS Plc',
]
DEPARTMENTS = [
    'Information Technology', 'Finance & Accounts', 'Human Resources',
    'Production', 'Quality Assurance', 'Procurement', 'Sales & Marketing',
    'Warehouse & Logistics', 'Administration', 'Executive Management',
    'Research & Development', 'Maintenance', 'Legal & Compliance',
]
HW_TYPES = [
    'Laptop', 'Desktop', 'Server', 'Network Switch', 'Router', 'Firewall',
    'Wireless Access Point', 'UPS', 'Printer', 'Scanner', 'Photocopier',
    'Mobile Phone', 'Tablet', 'Monitor', 'External Hard Drive',
    'Keyboard & Mouse', 'Webcam', 'Headset', 'Docking Station',
    'Lab Equipment', 'Production Equipment', 'CCTV Camera', 'NVR/DVR',
    'IP Phone', 'Projector', 'Generator / UPS (Industrial)', 'Other',
]
SW_TYPES = [
    'Operating System', 'Office Suite', 'Antivirus / Security',
    'ERP / Accounting', 'Database', 'Development Tool', 'Design / Creative',
    'Communication', 'Backup / Storage', 'Remote Access', 'Monitoring',
    'Industry-Specific', 'Other',
]
STATUSES = [
    'Active — Assigned', 'Active — Unassigned', 'Under Repair',
    'In Storage', 'Retired', 'Disposed', 'Lost / Stolen',
]
LICENSE_TYPES = [
    'Perpetual', 'Subscription (Annual)', 'Subscription (Monthly)',
    'OEM', 'Volume License', 'Open Source', 'Freeware', 'Trial',
]
CONDITIONS  = ['New', 'Excellent', 'Good', 'Fair', 'Poor']
ROLES       = ['admin', 'it_manager', 'it_staff', 'hr', 'readonly']

# ── Role permissions ──────────────────────────────────────────────────────────
ROLE_PERMISSIONS = {
    'admin':      ['read','write','assign','repair','delete','manage_users','bulk','onboarding'],
    'it_manager': ['read','write','assign','repair','bulk','onboarding'],
    'it_staff':   ['read','write','assign','repair','onboarding'],
    'hr':         ['onboarding','read_people'],
    'readonly':   ['read'],
}

def has_perm(perm):
    if not current_user.is_authenticated: return False
    return perm in ROLE_PERMISSIONS.get(current_user.role, [])

# ── Inject has_perm into every template automatically ────────────────────────
@app.context_processor
def inject_globals():
    return dict(has_perm=has_perm, days_until=days_until, hub_url=os.environ.get('HUB_URL', '').rstrip('/'))

def require_perm(perm):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if not has_perm(perm):
                flash('You do not have permission to perform this action.', 'danger')
                return redirect(url_for('dashboard'))
            return f(*args, **kwargs)
        return decorated
    return decorator

# ── User ──────────────────────────────────────────────────────────────────────
class User(UserMixin):
    def __init__(self, id, username, role, full_name, department, company):
        self.id = id; self.username = username; self.role = role
        self.full_name = full_name; self.department = department
        self.company = company

@login_manager.user_loader
def load_user(uid):
    db = get_db()
    u = db.execute('SELECT * FROM users WHERE id=?', (uid,)).fetchone()
    if u: return User(u['id'], u['username'], u['role'],
                      u['full_name'], u['department'], u['company'])

# ── Session timeout ───────────────────────────────────────────────────────────
@app.before_request
def check_session_timeout():
    if current_user.is_authenticated:
        last = session.get('last_active')
        if last:
            if datetime.now().timestamp() - last > 1800:
                logout_user()
                flash('Session expired. Please log in again.', 'warning')
                return redirect(url_for('login'))
        session['last_active'] = datetime.now().timestamp()
        session.permanent = True

# ── DB ────────────────────────────────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    db = get_db()
    db.executescript("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT,
        role TEXT DEFAULT 'it_staff',
        department TEXT,
        company TEXT,
        is_active INTEGER DEFAULT 1,
        last_login TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_tag TEXT UNIQUE NOT NULL,
        asset_name TEXT NOT NULL,
        asset_type TEXT NOT NULL,
        category TEXT DEFAULT 'Hardware',
        brand TEXT,
        model TEXT,
        serial_number TEXT,
        company TEXT,
        location TEXT,
        department TEXT,
        assigned_to TEXT,
        assigned_to_name TEXT,
        purchase_date TEXT,
        purchase_cost REAL,
        supplier TEXT,
        warranty_expiry TEXT,
        po_number TEXT,
        invoice_number TEXT,
        condition TEXT DEFAULT 'Good',
        status TEXT DEFAULT 'Active — Unassigned',
        description TEXT,
        notes TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS software (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sw_tag TEXT UNIQUE NOT NULL,
        sw_name TEXT NOT NULL,
        sw_type TEXT,
        vendor TEXT,
        version TEXT,
        license_type TEXT,
        license_key TEXT,
        total_seats INTEGER DEFAULT 1,
        used_seats INTEGER DEFAULT 0,
        purchase_date TEXT,
        expiry_date TEXT,
        purchase_cost REAL,
        supplier TEXT,
        po_number TEXT,
        company TEXT,
        installed_on TEXT,
        support_expiry TEXT,
        auto_renew INTEGER DEFAULT 0,
        status TEXT DEFAULT 'Active',
        notes TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS repairs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repair_ref TEXT UNIQUE NOT NULL,
        asset_id INTEGER REFERENCES assets(id),
        asset_tag TEXT,
        asset_name TEXT,
        fault_description TEXT NOT NULL,
        repair_type TEXT DEFAULT 'Internal',
        vendor TEXT,
        vendor_contact TEXT,
        sent_date TEXT,
        expected_return TEXT,
        actual_return TEXT,
        repair_cost REAL,
        repair_notes TEXT,
        parts_replaced TEXT,
        technician TEXT,
        status TEXT DEFAULT 'Open',
        outcome TEXT,
        logged_by TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        closed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS movement_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_tag TEXT NOT NULL,
        asset_name TEXT,
        action TEXT NOT NULL,
        from_user TEXT,
        to_user TEXT,
        from_location TEXT,
        to_location TEXT,
        from_department TEXT,
        to_department TEXT,
        from_status TEXT,
        to_status TEXT,
        performed_by TEXT NOT NULL,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        action TEXT NOT NULL,
        detail TEXT,
        ip_address TEXT,
        success INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bulk_uploads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT,
        uploaded_by TEXT,
        total_rows INTEGER DEFAULT 0,
        success_rows INTEGER DEFAULT 0,
        failed_rows INTEGER DEFAULT 0,
        errors TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS onboarding (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        onb_ref TEXT UNIQUE NOT NULL,
        full_name TEXT NOT NULL,
        preferred_name TEXT,
        job_title TEXT NOT NULL,
        department TEXT NOT NULL,
        location TEXT NOT NULL,
        employment_type TEXT DEFAULT 'Full-Time',
        manager_name TEXT,
        manager_username TEXT,
        start_date TEXT,
        email_assigned TEXT,
        ad_username TEXT,
        phone_number TEXT,
        status TEXT DEFAULT 'In Progress',
        hr_initiated_by TEXT,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS onboarding_checklist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        onboarding_id INTEGER REFERENCES onboarding(id),
        category TEXT NOT NULL,
        item_name TEXT NOT NULL,
        description TEXT,
        owner TEXT DEFAULT 'IT',
        status TEXT DEFAULT 'Pending',
        due_date TEXT,
        completed_at TEXT,
        completed_by TEXT,
        notes TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS onboarding_induction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        onboarding_id INTEGER REFERENCES onboarding(id),
        session_title TEXT NOT NULL,
        department TEXT,
        facilitator TEXT,
        scheduled_date TEXT,
        scheduled_time TEXT,
        duration_mins INTEGER DEFAULT 60,
        location TEXT,
        status TEXT DEFAULT 'Scheduled',
        notes TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
    );
    """)

    # ── DB Migrations — safely add columns that may not exist in older installs ──
    try:
        db.execute("ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1")
        db.execute("UPDATE users SET is_active=1 WHERE is_active IS NULL")
        db.commit()
    except Exception:
        pass  # column already exists — that is fine

    # Employee ID: authoritative cross-system identifier (used by the Trust Hub; optional here)
    for ddl in ("ALTER TABLE onboarding ADD COLUMN employee_id TEXT",
                "ALTER TABLE assets ADD COLUMN assigned_employee_id TEXT"):
        try:
            db.execute(ddl); db.commit()
        except Exception:
            pass  # already present

    # Seed users
    users = [
        ('admin',      'admin123',   'Alvin E.J. Dagbui',   'admin',      'Information Technology', 'DAS Plc'),
        ('it_manager', 'manager123', 'IT Manager',           'it_manager', 'Information Technology', 'DAS Plc'),
        ('it_staff',   'staff123',   'IT Staff User',        'it_staff',   'Information Technology', 'DAS Plc'),
        ('hr_officer', 'hr123',      'HR Officer',           'hr',         'Human Resources',        'DAS Plc'),
        ('viewer',     'viewer123',  'Read Only User',       'readonly',   'Administration',         'DAS Plc'),
    ]
    for uname, pwd, fname, role, dept, comp in users:
        if not db.execute("SELECT id FROM users WHERE username=?", (uname,)).fetchone():
            db.execute("INSERT INTO users (username,password_hash,full_name,role,department,company) VALUES (?,?,?,?,?,?)",
                (uname, generate_password_hash(pwd), fname, role, dept, comp))
    db.commit()
    db.close()

# ── Helpers ───────────────────────────────────────────────────────────────────
def next_ref(prefix, table, col, db):
    yr = datetime.now().year
    row = db.execute(f"SELECT {col} FROM {table} WHERE {col} LIKE ? ORDER BY id DESC LIMIT 1",
                     (f"{prefix}-{yr}-%",)).fetchone()
    num = 1
    if row:
        try: num = int(row[0].split('-')[-1]) + 1
        except: pass
    return f"{prefix}-{yr}-{num:04d}"

def log_movement(db, asset_tag, asset_name, action, from_user, to_user,
                 from_loc, to_loc, from_dept, to_dept, from_status, to_status, notes=''):
    db.execute("""INSERT INTO movement_log
        (asset_tag,asset_name,action,from_user,to_user,from_location,to_location,
         from_department,to_department,from_status,to_status,performed_by,notes)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (asset_tag, asset_name, action, from_user or '', to_user or '',
         from_loc or '', to_loc or '', from_dept or '', to_dept or '',
         from_status or '', to_status or '', current_user.username, notes))

def audit(db, action, detail='', success=1):
    ip = request.remote_addr or 'unknown'
    db.execute("INSERT INTO audit_log (username,action,detail,ip_address,success) VALUES (?,?,?,?,?)",
               (getattr(current_user,'username','anonymous'), action, detail, ip, success))

def days_until(date_str):
    if not date_str: return None
    try: return (datetime.strptime(date_str, '%Y-%m-%d').date() - date.today()).days
    except: return None

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def validate_asset_form(form, db, exclude_id=None):
    """Returns list of error strings. Empty = valid."""
    errors = []
    name   = (form.get('asset_name') or '').strip()
    atype  = (form.get('asset_type') or '').strip()
    serial = (form.get('serial_number') or '').strip()
    cost_s = (form.get('purchase_cost') or '').strip()
    pd_s   = (form.get('purchase_date') or '').strip()
    we_s   = (form.get('warranty_expiry') or '').strip()

    if not name:   errors.append('Asset Name is required.')
    if not atype:  errors.append('Asset Type is required.')
    if len(name) > 120: errors.append('Asset Name must be under 120 characters.')

    # Duplicate serial check
    if serial:
        q = "SELECT id, asset_tag FROM assets WHERE serial_number=? AND serial_number != ''"
        params = [serial]
        if exclude_id:
            q += " AND id != ?"
            params.append(exclude_id)
        dup = db.execute(q, params).fetchone()
        if dup:
            errors.append(f"Serial number '{serial}' is already registered as {dup['asset_tag']}. Duplicate asset prevented.")

    # Cost validation
    if cost_s:
        try:
            c = float(cost_s)
            if c < 0: errors.append('Purchase cost cannot be negative.')
            if c > 10_000_000: errors.append('Purchase cost seems too high — please verify.')
        except ValueError:
            errors.append('Purchase cost must be a valid number.')

    # Date validation
    for label, val in [('Purchase Date', pd_s), ('Warranty Expiry', we_s)]:
        if val:
            try: datetime.strptime(val, '%Y-%m-%d')
            except ValueError: errors.append(f'{label} must be a valid date (YYYY-MM-DD).')

    # Warranty must be after purchase
    if pd_s and we_s:
        try:
            if datetime.strptime(we_s, '%Y-%m-%d') < datetime.strptime(pd_s, '%Y-%m-%d'):
                errors.append('Warranty Expiry cannot be before Purchase Date.')
        except: pass

    return errors

def get_stats(db):
    total_hw     = db.execute("SELECT COUNT(*) FROM assets WHERE category='Hardware'").fetchone()[0]
    total_sw     = db.execute("SELECT COUNT(*) FROM software").fetchone()[0]
    assigned     = db.execute("SELECT COUNT(*) FROM assets WHERE status='Active — Assigned'").fetchone()[0]
    unassigned   = db.execute("SELECT COUNT(*) FROM assets WHERE status='Active — Unassigned'").fetchone()[0]
    under_repair = db.execute("SELECT COUNT(*) FROM assets WHERE status='Under Repair'").fetchone()[0]
    retired      = db.execute("SELECT COUNT(*) FROM assets WHERE status IN ('Retired','Disposed')").fetchone()[0]
    open_repairs = db.execute("SELECT COUNT(*) FROM repairs WHERE status='Open'").fetchone()[0]

    all_assets  = db.execute("SELECT warranty_expiry FROM assets WHERE warranty_expiry != '' AND warranty_expiry IS NOT NULL").fetchall()
    warranty_expiring = sum(1 for a in all_assets if days_until(a['warranty_expiry']) is not None and 0 <= days_until(a['warranty_expiry']) <= 30)
    warranty_expired  = sum(1 for a in all_assets if days_until(a['warranty_expiry']) is not None and days_until(a['warranty_expiry']) < 0)

    all_sw = db.execute("SELECT expiry_date FROM software WHERE expiry_date != '' AND expiry_date IS NOT NULL AND status='Active'").fetchall()
    sw_expiring = sum(1 for s in all_sw if days_until(s['expiry_date']) is not None and 0 <= days_until(s['expiry_date']) <= 30)
    sw_expired  = sum(1 for s in all_sw if days_until(s['expiry_date']) is not None and days_until(s['expiry_date']) < 0)

    by_location = db.execute("SELECT location, COUNT(*) as cnt FROM assets GROUP BY location ORDER BY cnt DESC").fetchall()
    by_company  = db.execute("SELECT company, COUNT(*) as cnt FROM assets GROUP BY company ORDER BY cnt DESC").fetchall()
    by_type     = db.execute("SELECT asset_type, COUNT(*) as cnt FROM assets WHERE category='Hardware' GROUP BY asset_type ORDER BY cnt DESC LIMIT 8").fetchall()

    return dict(total_hw=total_hw, total_sw=total_sw, assigned=assigned,
                unassigned=unassigned, under_repair=under_repair, retired=retired,
                open_repairs=open_repairs, warranty_expiring=warranty_expiring,
                warranty_expired=warranty_expired, sw_expiring=sw_expiring,
                sw_expired=sw_expired, by_location=by_location,
                by_company=by_company, by_type=by_type)

# ── Security headers (additive; no behaviour change) ──────────────────────────
@app.after_request
def _security_headers(resp):
    resp.headers.setdefault('X-Content-Type-Options', 'nosniff')
    resp.headers.setdefault('X-Frame-Options', 'SAMEORIGIN')
    resp.headers.setdefault('Referrer-Policy', 'same-origin')
    return resp

# ── Trust Hub integration: certificate sync (token-protected; disabled unless INTEGRATION_TOKEN is set) ──
@app.route('/api/hub/onboarding/training-complete', methods=['POST'])
def hub_training_complete():
    import hmac
    want = os.environ.get('INTEGRATION_TOKEN', '')
    hdr = request.headers.get('Authorization', '')
    if len(want) < 32 or not hdr.startswith('Bearer ') or not hmac.compare_digest(want, hdr[7:]):
        return jsonify({'ok': False, 'error': 'unauthorised'}), 401
    d = request.get_json(silent=True) or {}
    ref = str(d.get('onb_ref', ''))[:40]
    cert = str(d.get('cert_ref', ''))[:60]
    db = get_db()
    onb = db.execute("SELECT id FROM onboarding WHERE onb_ref=?", (ref,)).fetchone()
    if not onb:
        return jsonify({'ok': False, 'error': 'unknown onboarding'}), 404
    item = db.execute("SELECT id, status FROM onboarding_checklist WHERE onboarding_id=? AND category='IT Security' "
                      "AND item_name LIKE '%awareness briefing%' ORDER BY id LIMIT 1", (onb['id'],)).fetchone()
    if not item:
        return jsonify({'ok': False, 'error': 'checklist item not found'}), 404
    if item['status'] == 'Completed':
        return jsonify({'ok': True, 'changed': False})
    db.execute("UPDATE onboarding_checklist SET status='Completed', completed_at=datetime('now'), "
               "completed_by='CyberShield (via Trust Hub)', notes=? WHERE id=?",
               (f"Security awareness training passed. Certificate {cert}, score {str(d.get('score', '?'))[:5]}%.", item['id']))
    db.execute("INSERT INTO audit_log (username,action,detail,ip_address,success) VALUES (?,?,?,?,?)",
               ('hub-integration', 'TRAINING_SYNC', f'{ref}: awareness briefing completed from certificate {cert}', request.remote_addr, 1))
    db.commit()
    return jsonify({'ok': True, 'changed': True})

# ── Hub single sign-on (inactive unless SSO_SECRET is configured) ─────────────
_SSO_ROLE_MAP = {'admin': 'admin', 'it_manager': 'it_manager', 'it_staff': 'it_staff',
                 'hr': 'hr', 'auditor': 'readonly', 'readonly': 'readonly'}

@app.route('/sso')
def sso_login():
    try:
        from common import sso
    except ImportError:
        return 'SSO not available', 404
    claims = sso.verify(request.args.get('ticket', ''), 'itam')
    if not claims:
        return 'Invalid or expired sign-in ticket.', 403
    uname = 'hub.' + re.sub(r'[^a-z0-9._-]', '', claims['sub'].lower())
    role = _SSO_ROLE_MAP.get(claims['role'], 'readonly')
    db = get_db()
    u = db.execute("SELECT * FROM users WHERE username=?", (uname,)).fetchone()
    if not u:
        db.execute("INSERT INTO users (username,password_hash,full_name,role,department,company) VALUES (?,?,?,?,?,?)",
                   (uname, '!sso-only', claims['sub'], role, 'Information Technology', 'DAS Plc'))
    else:
        db.execute("UPDATE users SET role=? WHERE id=?", (role, u['id']))
    u = db.execute("SELECT * FROM users WHERE username=? AND is_active=1", (uname,)).fetchone()
    if not u:
        return 'Account disabled.', 403
    login_user(User(u['id'], u['username'], u['role'], u['full_name'], u['department'], u['company']))
    session['last_active'] = datetime.now().timestamp()
    db.execute("UPDATE users SET last_login=datetime('now') WHERE id=?", (u['id'],))
    db.execute("INSERT INTO audit_log (username,action,detail,ip_address,success) VALUES (?,?,?,?,?)",
               (uname, 'SSO_LOGIN', f'Signed in via Trust Hub as {role}', request.remote_addr, 1))
    db.commit()
    return redirect(url_for('dashboard'))

# ── AUTH ──────────────────────────────────────────────────────────────────────
@app.route('/login', methods=['GET','POST'])
def login():
    if request.method == 'POST':
        db    = get_db()
        uname = (request.form.get('username') or '').strip().lower()  # always lowercase
        pwd   = request.form.get('password') or ''
        u = db.execute("SELECT * FROM users WHERE username=? AND is_active=1", (uname,)).fetchone()
        if u and check_password_hash(u['password_hash'], pwd):
            login_user(User(u['id'], u['username'], u['role'],
                            u['full_name'], u['department'], u['company']))
            session['last_active'] = datetime.now().timestamp()
            db.execute("UPDATE users SET last_login=datetime('now') WHERE id=?", (u['id'],))
            db.execute("INSERT INTO audit_log (username,action,detail,ip_address,success) VALUES (?,?,?,?,?)",
                (uname, 'LOGIN', 'Successful login', request.remote_addr, 1))
            db.commit()
            return redirect(request.args.get('next') or url_for('dashboard'))
        db.execute("INSERT INTO audit_log (username,action,detail,ip_address,success) VALUES (?,?,?,?,?)",
            (uname, 'LOGIN_FAIL', 'Invalid credentials', request.remote_addr, 0))
        db.commit()
        flash('Invalid username or password.', 'danger')
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    db = get_db()
    audit(db, 'LOGOUT')
    db.commit()
    logout_user()
    return redirect(url_for('login'))

# ── DASHBOARD ─────────────────────────────────────────────────────────────────
@app.route('/')
@login_required
def dashboard():
    # HR users go straight to their onboarding dashboard
    if current_user.role == 'hr':
        return redirect(url_for('onboarding'))
    db = get_db()
    stats        = get_stats(db)
    recent_log   = db.execute("SELECT * FROM movement_log ORDER BY created_at DESC LIMIT 10").fetchall()
    open_repairs = db.execute("SELECT r.*, a.asset_type FROM repairs r LEFT JOIN assets a ON r.asset_id=a.id WHERE r.status='Open' ORDER BY r.created_at LIMIT 6").fetchall()
    expiring_w   = [a for a in db.execute("SELECT * FROM assets WHERE warranty_expiry != '' AND warranty_expiry IS NOT NULL ORDER BY warranty_expiry ASC LIMIT 10").fetchall()
                    if days_until(a['warranty_expiry']) is not None and days_until(a['warranty_expiry']) <= 30]
    unassigned   = db.execute("SELECT * FROM assets WHERE status='Active — Unassigned' ORDER BY created_at DESC LIMIT 6").fetchall()
    return render_template('dashboard.html', stats=stats, recent_log=recent_log,
        open_repairs=open_repairs, expiring_w=expiring_w, unassigned=unassigned,
        days_until=days_until, has_perm=has_perm)

# ── ASSETS ────────────────────────────────────────────────────────────────────
PER_PAGE = 25

@app.route('/assets')
@login_required
def assets():
    db   = get_db()
    page = max(1, int(request.args.get('page', 1)))
    q         = request.args.get('q','')
    status_f  = request.args.get('status','')
    type_f    = request.args.get('type','')
    loc_f     = request.args.get('location','')
    company_f = request.args.get('company','')
    dept_f    = request.args.get('department','')

    sql    = "SELECT * FROM assets WHERE 1=1"
    params = []
    if q:
        sql += " AND (asset_tag LIKE ? OR asset_name LIKE ? OR serial_number LIKE ? OR assigned_to_name LIKE ? OR brand LIKE ? OR model LIKE ? OR po_number LIKE ?)"
        params += [f'%{q}%']*7
    if status_f:    sql += " AND status=?";       params.append(status_f)
    if type_f:      sql += " AND asset_type=?";   params.append(type_f)
    if loc_f:       sql += " AND location=?";     params.append(loc_f)
    if company_f:   sql += " AND company=?";      params.append(company_f)
    if dept_f:      sql += " AND department=?";   params.append(dept_f)

    total_count = db.execute(sql.replace("SELECT *", "SELECT COUNT(*)"), params).fetchone()[0]
    sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    params += [PER_PAGE, (page-1)*PER_PAGE]
    asset_list  = db.execute(sql, params).fetchall()
    total_pages = max(1, (total_count + PER_PAGE - 1) // PER_PAGE)
    all_types   = db.execute("SELECT DISTINCT asset_type FROM assets ORDER BY asset_type").fetchall()

    return render_template('assets.html', assets=asset_list, q=q,
        status_f=status_f, type_f=type_f, loc_f=loc_f,
        company_f=company_f, dept_f=dept_f, all_types=all_types,
        statuses=STATUSES, locations=LOCATIONS, companies=COMPANIES,
        departments=DEPARTMENTS, page=page, total_pages=total_pages,
        total_count=total_count, has_perm=has_perm, days_until=days_until)

@app.route('/assets/new', methods=['GET','POST'])
@login_required
@require_perm('write')
def new_asset():
    db = get_db()
    if request.method == 'POST':
        errors = validate_asset_form(request.form, db)
        if errors:
            for e in errors: flash(e, 'danger')
            return render_template('asset_form.html', asset=None, form=dict(request.form),
                hw_types=HW_TYPES, locations=LOCATIONS, departments=DEPARTMENTS,
                companies=COMPANIES, conditions=CONDITIONS, has_perm=has_perm)

        tag = next_ref('DAS-HW', 'assets', 'asset_tag', db)
        db.execute("""INSERT INTO assets
            (asset_tag,asset_name,asset_type,category,brand,model,serial_number,
             company,location,department,purchase_date,purchase_cost,supplier,
             warranty_expiry,po_number,invoice_number,condition,status,
             description,notes,created_by)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (tag, request.form['asset_name'].strip(),
             request.form['asset_type'],
             'Hardware', request.form.get('brand','').strip(),
             request.form.get('model','').strip(),
             request.form.get('serial_number','').strip(),
             request.form.get('company',''), request.form.get('location',''),
             request.form.get('department',''),
             request.form.get('purchase_date',''),
             float(request.form.get('purchase_cost') or 0),
             request.form.get('supplier','').strip(),
             request.form.get('warranty_expiry',''),
             request.form.get('po_number','').strip(),
             request.form.get('invoice_number','').strip(),
             request.form.get('condition','Good'),
             'Active — Unassigned',
             request.form.get('description','').strip(),
             request.form.get('notes','').strip(),
             current_user.username))
        log_movement(db, tag, request.form['asset_name'], 'Asset Registered',
                     None, None, None, request.form.get('location',''),
                     None, request.form.get('department',''),
                     None, 'Active — Unassigned',
                     f"Registered by {current_user.full_name}")
        audit(db, 'ASSET_CREATE', f'Created {tag} — {request.form["asset_name"]}')
        db.commit()
        flash(f'✓ Asset {tag} registered successfully.', 'success')
        asset_id = db.execute("SELECT id FROM assets WHERE asset_tag=?", (tag,)).fetchone()['id']
        return redirect(url_for('view_asset', asset_id=asset_id))

    return render_template('asset_form.html', asset=None, form={},
        hw_types=HW_TYPES, locations=LOCATIONS, departments=DEPARTMENTS,
        companies=COMPANIES, conditions=CONDITIONS, has_perm=has_perm)

@app.route('/assets/<int:asset_id>')
@login_required
def view_asset(asset_id):
    db     = get_db()
    asset  = db.execute("SELECT * FROM assets WHERE id=?", (asset_id,)).fetchone()
    if not asset: return redirect(url_for('assets'))
    history = db.execute("SELECT * FROM movement_log WHERE asset_tag=? ORDER BY created_at DESC", (asset['asset_tag'],)).fetchall()
    repairs = db.execute("SELECT * FROM repairs WHERE asset_id=? ORDER BY created_at DESC", (asset_id,)).fetchall()
    w_days  = days_until(asset['warranty_expiry'])
    return render_template('asset_detail.html', asset=asset, history=history,
        repairs=repairs, w_days=w_days, has_perm=has_perm,
        locations=LOCATIONS, departments=DEPARTMENTS)

@app.route('/assets/<int:asset_id>/edit', methods=['GET','POST'])
@login_required
@require_perm('write')
def edit_asset(asset_id):
    db    = get_db()
    asset = db.execute("SELECT * FROM assets WHERE id=?", (asset_id,)).fetchone()
    if request.method == 'POST':
        errors = validate_asset_form(request.form, db, exclude_id=asset_id)
        if errors:
            for e in errors: flash(e, 'danger')
            return render_template('asset_form.html', asset=asset, form=dict(request.form),
                hw_types=HW_TYPES, locations=LOCATIONS, departments=DEPARTMENTS,
                companies=COMPANIES, conditions=CONDITIONS, has_perm=has_perm)
        old_loc  = asset['location']
        old_dept = asset['department']
        new_loc  = request.form.get('location','')
        new_dept = request.form.get('department','')
        db.execute("""UPDATE assets SET
            asset_name=?,asset_type=?,brand=?,model=?,serial_number=?,company=?,
            location=?,department=?,purchase_date=?,purchase_cost=?,supplier=?,
            warranty_expiry=?,po_number=?,invoice_number=?,condition=?,
            description=?,notes=?,updated_at=datetime('now') WHERE id=?""",
            (request.form['asset_name'].strip(), request.form['asset_type'],
             request.form.get('brand','').strip(), request.form.get('model','').strip(),
             request.form.get('serial_number','').strip(), request.form.get('company',''),
             new_loc, new_dept, request.form.get('purchase_date',''),
             float(request.form.get('purchase_cost') or 0),
             request.form.get('supplier','').strip(), request.form.get('warranty_expiry',''),
             request.form.get('po_number','').strip(), request.form.get('invoice_number','').strip(),
             request.form.get('condition','Good'),
             request.form.get('description','').strip(),
             request.form.get('notes','').strip(), asset_id))
        if old_loc != new_loc or old_dept != new_dept:
            log_movement(db, asset['asset_tag'], request.form['asset_name'],
                'Asset Updated', None, None, old_loc, new_loc, old_dept, new_dept,
                asset['status'], asset['status'], 'Details updated')
        audit(db, 'ASSET_UPDATE', f'Updated {asset["asset_tag"]}')
        db.commit()
        flash('Asset updated.', 'success')
        return redirect(url_for('view_asset', asset_id=asset_id))
    return render_template('asset_form.html', asset=asset, form=dict(asset),
        hw_types=HW_TYPES, locations=LOCATIONS, departments=DEPARTMENTS,
        companies=COMPANIES, conditions=CONDITIONS, has_perm=has_perm)

# ── SEARCH UNASSIGNED ASSETS API (for People profile assign panel) ────────────
@app.route('/api/search-unassigned')
@login_required
def search_unassigned():
    q  = (request.args.get('q') or '').strip()
    db = get_db()
    if not q:
        assets = db.execute("""SELECT id, asset_tag, asset_name, asset_type, location, department
                               FROM assets WHERE status='Active — Unassigned'
                               ORDER BY asset_type, asset_name LIMIT 30""").fetchall()
    else:
        assets = db.execute("""SELECT id, asset_tag, asset_name, asset_type, location, department
                               FROM assets
                               WHERE status='Active — Unassigned'
                               AND (asset_tag LIKE ? OR asset_name LIKE ?
                                    OR asset_type LIKE ? OR brand LIKE ?)
                               ORDER BY asset_type, asset_name LIMIT 30""",
                            (f'%{q}%', f'%{q}%', f'%{q}%', f'%{q}%')).fetchall()
    return jsonify([dict(a) for a in assets])


# ── DUPLICATE CHECK API ───────────────────────────────────────────────────────
@app.route('/api/check-serial')
@login_required
def check_serial():
    serial   = request.args.get('serial','').strip()
    exclude  = request.args.get('exclude_id')
    if not serial: return jsonify({'duplicate': False})
    db = get_db()
    q  = "SELECT id, asset_tag, asset_name FROM assets WHERE serial_number=? AND serial_number != ''"
    p  = [serial]
    if exclude:
        q += " AND id != ?"; p.append(exclude)
    row = db.execute(q, p).fetchone()
    if row:
        return jsonify({'duplicate': True, 'asset_tag': row['asset_tag'], 'asset_name': row['asset_name']})
    return jsonify({'duplicate': False})

# ── ASSIGN / UNASSIGN / STATUS ────────────────────────────────────────────────
@app.route('/assets/<int:asset_id>/assign', methods=['POST'])
@login_required
@require_perm('assign')
def assign_asset(asset_id):
    db     = get_db()
    asset  = db.execute("SELECT * FROM assets WHERE id=?", (asset_id,)).fetchone()
    to_user      = (request.form.get('assigned_to') or '').strip()
    to_user_name = (request.form.get('assigned_to_name') or '').strip()
    to_loc       = request.form.get('location', asset['location'])
    to_dept      = request.form.get('department', asset['department'])
    notes        = (request.form.get('notes') or '').strip()
    if not to_user or not to_user_name:
        flash('Username and full name are required for assignment.', 'danger')
        return redirect(url_for('view_asset', asset_id=asset_id))
    action = 'Reassigned' if asset['assigned_to'] else 'Assigned'
    log_movement(db, asset['asset_tag'], asset['asset_name'], action,
                 asset['assigned_to'], to_user, asset['location'], to_loc,
                 asset['department'], to_dept, asset['status'], 'Active — Assigned', notes)
    db.execute("""UPDATE assets SET assigned_to=?,assigned_to_name=?,location=?,
                  department=?,status='Active — Assigned',updated_at=datetime('now')
                  WHERE id=?""", (to_user, to_user_name, to_loc, to_dept, asset_id))
    db.execute("UPDATE assets SET assigned_employee_id=? WHERE id=?",
               ((request.form.get('assigned_employee_id') or '').strip()[:40] or None, asset_id))
    audit(db, 'ASSET_ASSIGN', f'{asset["asset_tag"]} → {to_user_name}')
    db.commit()
    flash(f'✓ Asset assigned to {to_user_name}.', 'success')
    return redirect(url_for('view_asset', asset_id=asset_id))

@app.route('/assets/<int:asset_id>/unassign', methods=['POST'])
@login_required
@require_perm('assign')
def unassign_asset(asset_id):
    db    = get_db()
    asset = db.execute("SELECT * FROM assets WHERE id=?", (asset_id,)).fetchone()
    notes = (request.form.get('notes') or '').strip()
    log_movement(db, asset['asset_tag'], asset['asset_name'], 'Unassigned',
                 asset['assigned_to'], None, asset['location'], asset['location'],
                 asset['department'], asset['department'],
                 asset['status'], 'Active — Unassigned', notes)
    db.execute("""UPDATE assets SET assigned_to=NULL,assigned_to_name=NULL,
                  status='Active — Unassigned',updated_at=datetime('now') WHERE id=?""", (asset_id,))
    audit(db, 'ASSET_UNASSIGN', f'{asset["asset_tag"]} returned to pool')
    db.commit()
    flash('Asset returned to unassigned pool.', 'success')
    return redirect(url_for('view_asset', asset_id=asset_id))

@app.route('/assets/<int:asset_id>/status', methods=['POST'])
@login_required
@require_perm('write')
def update_status(asset_id):
    db = get_db()
    asset      = db.execute("SELECT * FROM assets WHERE id=?", (asset_id,)).fetchone()
    new_status = request.form.get('status')
    notes      = (request.form.get('notes') or '').strip()
    log_movement(db, asset['asset_tag'], asset['asset_name'], f'Status → {new_status}',
                 asset['assigned_to'], asset['assigned_to'],
                 asset['location'], asset['location'],
                 asset['department'], asset['department'],
                 asset['status'], new_status, notes)
    db.execute("UPDATE assets SET status=?,updated_at=datetime('now') WHERE id=?", (new_status, asset_id))
    audit(db, 'STATUS_CHANGE', f'{asset["asset_tag"]} → {new_status}')
    db.commit()
    flash(f'Status updated to {new_status}.', 'success')
    return redirect(url_for('view_asset', asset_id=asset_id))

# ── BULK STATUS UPDATE ────────────────────────────────────────────────────────
@app.route('/assets/bulk-status', methods=['POST'])
@login_required
@require_perm('bulk')
def bulk_status():
    db         = get_db()
    ids        = request.form.getlist('asset_ids')
    new_status = request.form.get('bulk_status')
    notes      = (request.form.get('bulk_notes') or '').strip()
    if not ids or not new_status:
        flash('Select assets and a status.', 'warning')
        return redirect(url_for('assets'))
    count = 0
    for aid in ids:
        asset = db.execute("SELECT * FROM assets WHERE id=?", (aid,)).fetchone()
        if asset:
            log_movement(db, asset['asset_tag'], asset['asset_name'],
                f'Bulk Status → {new_status}', asset['assigned_to'], asset['assigned_to'],
                asset['location'], asset['location'], asset['department'], asset['department'],
                asset['status'], new_status, notes or 'Bulk update')
            db.execute("UPDATE assets SET status=?,updated_at=datetime('now') WHERE id=?", (new_status, aid))
            count += 1
    audit(db, 'BULK_STATUS', f'{count} assets → {new_status}')
    db.commit()
    flash(f'✓ {count} assets updated to {new_status}.', 'success')
    return redirect(url_for('assets'))

# ── REPAIR ────────────────────────────────────────────────────────────────────
@app.route('/repairs')
@login_required
def repairs():
    db  = get_db()
    all_repairs = db.execute("SELECT * FROM repairs ORDER BY created_at DESC").fetchall()
    stats = {
        'open':     db.execute("SELECT COUNT(*) FROM repairs WHERE status='Open'").fetchone()[0],
        'progress': db.execute("SELECT COUNT(*) FROM repairs WHERE status='In Progress'").fetchone()[0],
        'closed':   db.execute("SELECT COUNT(*) FROM repairs WHERE status='Closed'").fetchone()[0],
        'total':    db.execute("SELECT COUNT(*) FROM repairs").fetchone()[0],
    }
    return render_template('repairs.html', repairs=all_repairs, stats=stats, has_perm=has_perm)

@app.route('/assets/<int:asset_id>/repair/new', methods=['POST'])
@login_required
@require_perm('repair')
def new_repair(asset_id):
    db    = get_db()
    asset = db.execute("SELECT * FROM assets WHERE id=?", (asset_id,)).fetchone()
    fault = (request.form.get('fault_description') or '').strip()
    if not fault:
        flash('Fault description is required.', 'danger')
        return redirect(url_for('view_asset', asset_id=asset_id))
    ref = next_ref('REP', 'repairs', 'repair_ref', db)
    db.execute("""INSERT INTO repairs
        (repair_ref,asset_id,asset_tag,asset_name,fault_description,repair_type,
         vendor,vendor_contact,sent_date,expected_return,repair_cost,
         repair_notes,technician,status,logged_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (ref, asset_id, asset['asset_tag'], asset['asset_name'], fault,
         request.form.get('repair_type','Internal'),
         (request.form.get('vendor') or '').strip(),
         (request.form.get('vendor_contact') or '').strip(),
         request.form.get('sent_date',''),
         request.form.get('expected_return',''),
         float(request.form.get('repair_cost') or 0),
         (request.form.get('repair_notes') or '').strip(),
         (request.form.get('technician') or '').strip(),
         'Open', current_user.username))
    log_movement(db, asset['asset_tag'], asset['asset_name'], 'Sent for Repair',
                 asset['assigned_to'], None, asset['location'],
                 (request.form.get('vendor') or 'Repair Centre').strip(),
                 asset['department'], asset['department'],
                 asset['status'], 'Under Repair', f"Fault: {fault}")
    db.execute("UPDATE assets SET status='Under Repair',updated_at=datetime('now') WHERE id=?", (asset_id,))
    audit(db, 'REPAIR_LOG', f'{asset["asset_tag"]} → Repair {ref}')
    db.commit()
    flash(f'✓ Repair {ref} logged. Asset → Under Repair.', 'success')
    return redirect(url_for('view_asset', asset_id=asset_id))

@app.route('/repairs/<int:repair_id>/close', methods=['POST'])
@login_required
@require_perm('repair')
def close_repair(repair_id):
    db     = get_db()
    repair = db.execute("SELECT * FROM repairs WHERE id=?", (repair_id,)).fetchone()
    outcome = request.form.get('outcome','Repaired')
    notes   = (request.form.get('repair_notes') or '').strip()
    parts   = (request.form.get('parts_replaced') or '').strip()
    new_status = 'Active — Unassigned' if outcome in ('Repaired','Replaced') else 'Retired'
    db.execute("""UPDATE repairs SET status='Closed',actual_return=date('now'),
                  outcome=?,repair_notes=?,parts_replaced=?,closed_at=datetime('now') WHERE id=?""",
               (outcome, notes, parts, repair_id))
    log_movement(db, repair['asset_tag'], repair['asset_name'],
                 f'Returned from Repair ({outcome})', None, None,
                 'Repair Centre', None, None, None,
                 'Under Repair', new_status, notes)
    db.execute("UPDATE assets SET status=?,updated_at=datetime('now') WHERE asset_tag=?",
               (new_status, repair['asset_tag']))
    audit(db, 'REPAIR_CLOSE', f'{repair["asset_tag"]} — {outcome}')
    db.commit()
    flash(f'✓ Repair closed. Asset → {new_status}.', 'success')
    return redirect(url_for('repairs'))

# ── SOFTWARE ──────────────────────────────────────────────────────────────────
@app.route('/software')
@login_required
def software():
    db     = get_db()
    all_sw = db.execute("SELECT * FROM software ORDER BY sw_name").fetchall()
    stats  = {
        'total':    db.execute("SELECT COUNT(*) FROM software").fetchone()[0],
        'active':   db.execute("SELECT COUNT(*) FROM software WHERE status='Active'").fetchone()[0],
        'expiring': sum(1 for s in all_sw if days_until(s['expiry_date']) is not None and 0 <= days_until(s['expiry_date']) <= 30),
        'expired':  sum(1 for s in all_sw if days_until(s['expiry_date']) is not None and days_until(s['expiry_date']) < 0),
    }
    return render_template('software.html', software=all_sw, stats=stats,
        days_until=days_until, has_perm=has_perm)

@app.route('/software/new', methods=['GET','POST'])
@login_required
@require_perm('write')
def new_software():
    db = get_db()
    if request.method == 'POST':
        name = (request.form.get('sw_name') or '').strip()
        if not name:
            flash('Software name is required.', 'danger')
            return render_template('software_form.html', sw=None, form=request.form,
                sw_types=SW_TYPES, license_types=LICENSE_TYPES, companies=COMPANIES)
        tag = next_ref('DAS-SW', 'software', 'sw_tag', db)
        db.execute("""INSERT INTO software
            (sw_tag,sw_name,sw_type,vendor,version,license_type,license_key,
             total_seats,used_seats,purchase_date,expiry_date,purchase_cost,
             supplier,po_number,company,installed_on,support_expiry,auto_renew,status,notes,created_by)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (tag, name, request.form.get('sw_type',''),
             (request.form.get('vendor') or '').strip(),
             (request.form.get('version') or '').strip(),
             request.form.get('license_type','Perpetual'),
             (request.form.get('license_key') or '').strip(),
             int(request.form.get('total_seats') or 1),
             int(request.form.get('used_seats') or 0),
             request.form.get('purchase_date',''), request.form.get('expiry_date',''),
             float(request.form.get('purchase_cost') or 0),
             (request.form.get('supplier') or '').strip(),
             (request.form.get('po_number') or '').strip(),
             request.form.get('company',''),
             (request.form.get('installed_on') or '').strip(),
             request.form.get('support_expiry',''),
             1 if request.form.get('auto_renew') else 0,
             'Active', (request.form.get('notes') or '').strip(),
             current_user.username))
        audit(db, 'SW_CREATE', f'Created {tag} — {name}')
        db.commit()
        flash(f'✓ Software {tag} registered.', 'success')
        return redirect(url_for('software'))
    return render_template('software_form.html', sw=None, form={},
        sw_types=SW_TYPES, license_types=LICENSE_TYPES, companies=COMPANIES)

@app.route('/software/<int:sw_id>/edit', methods=['GET','POST'])
@login_required
@require_perm('write')
def edit_software(sw_id):
    db = get_db()
    sw = db.execute("SELECT * FROM software WHERE id=?", (sw_id,)).fetchone()
    if request.method == 'POST':
        db.execute("""UPDATE software SET
            sw_name=?,sw_type=?,vendor=?,version=?,license_type=?,license_key=?,
            total_seats=?,used_seats=?,purchase_date=?,expiry_date=?,purchase_cost=?,
            supplier=?,po_number=?,company=?,installed_on=?,support_expiry=?,
            auto_renew=?,status=?,notes=?,updated_at=datetime('now') WHERE id=?""",
            ((request.form.get('sw_name') or '').strip(),
             request.form.get('sw_type',''),
             (request.form.get('vendor') or '').strip(),
             (request.form.get('version') or '').strip(),
             request.form.get('license_type',''),
             (request.form.get('license_key') or '').strip(),
             int(request.form.get('total_seats') or 1),
             int(request.form.get('used_seats') or 0),
             request.form.get('purchase_date',''), request.form.get('expiry_date',''),
             float(request.form.get('purchase_cost') or 0),
             (request.form.get('supplier') or '').strip(),
             (request.form.get('po_number') or '').strip(),
             request.form.get('company',''),
             (request.form.get('installed_on') or '').strip(),
             request.form.get('support_expiry',''),
             1 if request.form.get('auto_renew') else 0,
             request.form.get('status','Active'),
             (request.form.get('notes') or '').strip(), sw_id))
        audit(db, 'SW_UPDATE', f'Updated {sw["sw_tag"]}')
        db.commit()
        flash('Software updated.', 'success')
        return redirect(url_for('software'))
    return render_template('software_form.html', sw=sw, form=sw,
        sw_types=SW_TYPES, license_types=LICENSE_TYPES, companies=COMPANIES)

# ── EXCEL TEMPLATE DOWNLOAD ───────────────────────────────────────────────────
@app.route('/assets/download-template')
@login_required
def download_template():
    if not HAS_EXCEL:
        flash('openpyxl not installed. Run: pip install openpyxl', 'warning')
        return redirect(url_for('assets'))

    wb = openpyxl.Workbook()

    # ── INSTRUCTIONS sheet ───────────────────────────────────────────────────
    ws_info = wb.active
    ws_info.title = 'Instructions'
    hdr_fill  = PatternFill('solid', fgColor='0A3D2A')
    hdr_font  = Font(bold=True, color='00C896', size=14)
    body_font = Font(size=11)

    ws_info['A1'] = 'ITAM — DAS Plc IT Asset Register'
    ws_info['A1'].font = Font(bold=True, size=16, color='00C896')
    ws_info['A2'] = 'Bulk Upload Template — Instructions'
    ws_info['A2'].font = Font(bold=True, size=12, color='888888')
    ws_info['A3'] = ''
    instructions = [
        ('STEP 1', 'Fill in the "Asset Data" sheet. Do NOT rename or delete any column headers.'),
        ('STEP 2', 'Required fields are marked with * — Asset Name, Asset Type, Location, Company, Department.'),
        ('STEP 3', 'Serial Number must be unique. Duplicate serials will be rejected on upload.'),
        ('STEP 4', 'Use the exact values from the dropdown lists in columns C, I, J, K, P.'),
        ('STEP 5', 'Dates must be in YYYY-MM-DD format (e.g. 2026-03-14).'),
        ('STEP 6', 'Purchase Cost must be a number only — no currency symbols (e.g. 2500.00).'),
        ('STEP 7', 'Leave Asset Tag blank — it will be auto-generated (DAS-HW-2026-XXXX).'),
        ('STEP 8', 'Assigned To and Assigned To Name should both be filled or both left blank.'),
        ('STEP 9', 'Save the file as .xlsx before uploading.'),
        ('STEP 10','Maximum 500 rows per upload.'),
    ]
    for i, (step, text) in enumerate(instructions, start=4):
        ws_info[f'A{i}'] = step
        ws_info[f'A{i}'].font = Font(bold=True, color='00C896', size=11)
        ws_info[f'B{i}'] = text
        ws_info[f'B{i}'].font = body_font
    ws_info.column_dimensions['A'].width = 12
    ws_info.column_dimensions['B'].width = 80

    # Reference values sheet
    ws_ref = wb.create_sheet('Reference Values')
    ws_ref['A1'] = 'Asset Types'; ws_ref['B1'] = 'Locations'; ws_ref['C1'] = 'Companies'
    ws_ref['D1'] = 'Departments'; ws_ref['E1'] = 'Conditions'; ws_ref['F1'] = 'Statuses'
    for cell in ws_ref['1:1']:
        cell.font = Font(bold=True, color='FFFFFF', size=10)
        cell.fill = PatternFill('solid', fgColor='0A3D2A')
    lists = [HW_TYPES, LOCATIONS, COMPANIES, DEPARTMENTS, CONDITIONS, STATUSES]
    for col_idx, lst in enumerate(lists, start=1):
        for row_idx, val in enumerate(lst, start=2):
            ws_ref.cell(row=row_idx, column=col_idx, value=val)
    for col in ['A','B','C','D','E','F']:
        ws_ref.column_dimensions[col].width = 35

    # ── ASSET DATA sheet ─────────────────────────────────────────────────────
    ws = wb.create_sheet('Asset Data')
    columns = [
        ('asset_tag',        'Asset Tag (leave blank — auto-generated)', 20),
        ('asset_name',       'Asset Name *',                             35),
        ('asset_type',       'Asset Type *',                             22),
        ('brand',            'Brand / Manufacturer',                     20),
        ('model',            'Model',                                    20),
        ('serial_number',    'Serial Number',                            22),
        ('company',          'Company *',                                28),
        ('location',         'Location *',                               18),
        ('department',       'Department *',                             25),
        ('assigned_to',      'Assigned To (Username)',                   22),
        ('assigned_to_name', 'Assigned To (Full Name)',                  25),
        ('purchase_date',    'Purchase Date (YYYY-MM-DD)',               24),
        ('purchase_cost',    'Purchase Cost (GHS)',                      22),
        ('supplier',         'Supplier',                                 25),
        ('po_number',        'PO Number',                                18),
        ('invoice_number',   'Invoice Number',                           18),
        ('warranty_expiry',  'Warranty Expiry (YYYY-MM-DD)',             26),
        ('condition',        'Condition',                                14),
        ('status',           'Status',                                   24),
        ('description',      'Description',                              35),
        ('notes',            'Notes',                                    35),
    ]

    # Header row
    hdr_fill_dark = PatternFill('solid', fgColor='0A3D2A')
    hdr_fill_req  = PatternFill('solid', fgColor='0D5C38')
    for col_idx, (field, label, width) in enumerate(columns, start=1):
        cell = ws.cell(row=1, column=col_idx, value=label)
        cell.font      = Font(bold=True, color='FFFFFF', size=10)
        cell.fill      = hdr_fill_req if '*' in label else hdr_fill_dark
        cell.alignment = Alignment(horizontal='center', wrap_text=True)
        ws.column_dimensions[get_column_letter(col_idx)].width = width

    ws.row_dimensions[1].height = 30
    ws.freeze_panes = 'A2'

    # Data validations (dropdowns)
    dv_map = {
        3:  (HW_TYPES,    'Asset Type'),
        7:  (COMPANIES,   'Company'),
        8:  (LOCATIONS,   'Location'),
        9:  (DEPARTMENTS, 'Department'),
        18: (CONDITIONS,  'Condition'),
        19: (STATUSES,    'Status'),
    }
    for col_idx, (lst, title) in dv_map.items():
        col_letter = get_column_letter(col_idx)
        formula    = f'"Reference Values"!${col_letter}$2:${col_letter}${len(lst)+1}'
        dv = DataValidation(type='list', formula1=formula, allow_blank=True)
        dv.error      = f'Please select a valid {title} from the list.'
        dv.errorTitle = 'Invalid Value'
        dv.prompt     = f'Select from list'
        dv.promptTitle = title
        dv.sqref      = f'{get_column_letter(col_idx)}2:{get_column_letter(col_idx)}501'
        ws.add_data_validation(dv)

    # Sample row
    sample = ['', 'Dell Latitude 5540', 'Laptop', 'Dell', 'Latitude 5540',
              'SN12345678', 'DAS Plc', 'NIA — HQ', 'Information Technology',
              'alvin.dagbui', 'Alvin E.J. Dagbui', '2026-01-15', '5500.00',
              'Tech Ghana Ltd', 'PO-2026-001', 'INV-2026-001',
              '2028-01-15', 'New', 'Active — Assigned', 'IT staff laptop', '']
    sample_fill = PatternFill('solid', fgColor='1C3328')
    for col_idx, val in enumerate(sample, start=1):
        cell = ws.cell(row=2, column=col_idx, value=val)
        cell.fill = sample_fill
        cell.font = Font(color='7aB898', size=10, italic=True)

    # Row alternating colours for rows 3-501
    for row in range(3, 502):
        fill = PatternFill('solid', fgColor='122018' if row % 2 == 0 else '0d1f1a')
        for col in range(1, len(columns)+1):
            ws.cell(row=row, column=col).fill = fill

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    response = make_response(buf.read())
    response.headers['Content-Type']        = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    response.headers['Content-Disposition'] = f'attachment; filename=DAS_ITAM_Asset_Upload_Template.xlsx'
    return response

# ── EXCEL BULK UPLOAD ─────────────────────────────────────────────────────────
@app.route('/assets/upload', methods=['GET','POST'])
@login_required
@require_perm('bulk')
def bulk_upload():
    if request.method == 'GET':
        db = get_db()
        recent = db.execute("SELECT * FROM bulk_uploads ORDER BY created_at DESC LIMIT 10").fetchall()
        return render_template('bulk_upload.html', recent=recent, has_excel=HAS_EXCEL, has_perm=has_perm)

    if not HAS_EXCEL:
        flash('openpyxl not installed. Run: pip install openpyxl', 'danger')
        return redirect(url_for('bulk_upload'))

    file = request.files.get('file')
    if not file or not file.filename:
        flash('No file selected.', 'danger')
        return redirect(url_for('bulk_upload'))
    if not allowed_file(file.filename):
        flash('Invalid file type. Upload .xlsx files only.', 'danger')
        return redirect(url_for('bulk_upload'))

    try:
        wb      = openpyxl.load_workbook(BytesIO(file.read()), data_only=True)
        ws      = wb['Asset Data']
    except Exception as e:
        flash(f'Could not read file: {e}', 'danger')
        return redirect(url_for('bulk_upload'))

    db = get_db()
    success_count = 0
    failed_count  = 0
    errors_list   = []
    max_rows      = 500

    # Column mapping (0-indexed)
    COL = {
        'asset_tag':0, 'asset_name':1, 'asset_type':2, 'brand':3, 'model':4,
        'serial_number':5, 'company':6, 'location':7, 'department':8,
        'assigned_to':9, 'assigned_to_name':10, 'purchase_date':11,
        'purchase_cost':12, 'supplier':13, 'po_number':14, 'invoice_number':15,
        'warranty_expiry':16, 'condition':17, 'status':18,
        'description':19, 'notes':20,
    }

    def cell_val(row, key):
        idx = COL.get(key)
        if idx is None: return ''
        try:
            v = row[idx].value
            return str(v).strip() if v is not None else ''
        except: return ''

    rows = list(ws.iter_rows(min_row=2))
    if len(rows) > max_rows:
        flash(f'Maximum {max_rows} rows allowed per upload. Your file has {len(rows)} rows.', 'danger')
        return redirect(url_for('bulk_upload'))

    for row_num, row in enumerate(rows, start=2):
        # Skip empty rows
        if all((c.value is None or str(c.value).strip() == '') for c in row): continue
        # Skip sample row
        if cell_val(row, 'asset_name').lower() in ('asset name *', 'example','sample','dell latitude 5540'): continue

        row_errors = []
        name   = cell_val(row, 'asset_name')
        atype  = cell_val(row, 'asset_type')
        loc    = cell_val(row, 'location')
        comp   = cell_val(row, 'company')
        dept   = cell_val(row, 'department')
        serial = cell_val(row, 'serial_number')

        if not name:  row_errors.append('Asset Name is required')
        if not atype: row_errors.append('Asset Type is required')
        if not loc:   row_errors.append('Location is required')
        if not comp:  row_errors.append('Company is required')
        if not dept:  row_errors.append('Department is required')

        # Serial duplicate check
        if serial:
            dup = db.execute("SELECT asset_tag FROM assets WHERE serial_number=? AND serial_number != ''", (serial,)).fetchone()
            if dup:
                row_errors.append(f"Serial '{serial}' already registered as {dup['asset_tag']}")

        # Cost parse
        cost = 0.0
        cost_s = cell_val(row, 'purchase_cost')
        if cost_s:
            try: cost = float(cost_s.replace(',',''))
            except: row_errors.append('Purchase Cost must be numeric')

        # Date validation
        for date_field in ['purchase_date','warranty_expiry']:
            val = cell_val(row, date_field)
            if val:
                try: datetime.strptime(val, '%Y-%m-%d')
                except: row_errors.append(f'{date_field} must be YYYY-MM-DD')

        if row_errors:
            failed_count += 1
            errors_list.append(f'Row {row_num}: {"; ".join(row_errors)}')
            continue

        # Insert
        try:
            tag    = next_ref('DAS-HW', 'assets', 'asset_tag', db)
            status = cell_val(row, 'status') or ('Active — Assigned' if cell_val(row,'assigned_to') else 'Active — Unassigned')
            db.execute("""INSERT INTO assets
                (asset_tag,asset_name,asset_type,category,brand,model,serial_number,
                 company,location,department,assigned_to,assigned_to_name,
                 purchase_date,purchase_cost,supplier,warranty_expiry,po_number,
                 invoice_number,condition,status,description,notes,created_by)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (tag, name, atype, 'Hardware',
                 cell_val(row,'brand'), cell_val(row,'model'), serial, comp, loc, dept,
                 cell_val(row,'assigned_to') or None,
                 cell_val(row,'assigned_to_name') or None,
                 cell_val(row,'purchase_date') or None, cost,
                 cell_val(row,'supplier'), cell_val(row,'warranty_expiry') or None,
                 cell_val(row,'po_number'), cell_val(row,'invoice_number'),
                 cell_val(row,'condition') or 'Good', status,
                 cell_val(row,'description'), cell_val(row,'notes'),
                 current_user.username))
            log_movement(db, tag, name, 'Bulk Upload Import', None,
                         cell_val(row,'assigned_to') or None, None, loc, None, dept,
                         None, status, f'Bulk upload by {current_user.full_name}')
            success_count += 1
        except Exception as e:
            failed_count += 1
            errors_list.append(f'Row {row_num}: Database error — {str(e)[:80]}')

    # Log the upload
    db.execute("""INSERT INTO bulk_uploads (filename,uploaded_by,total_rows,success_rows,failed_rows,errors)
                  VALUES (?,?,?,?,?,?)""",
               (secure_filename(file.filename), current_user.username,
                success_count + failed_count, success_count, failed_count,
                '\n'.join(errors_list[:50]) if errors_list else ''))
    audit(db, 'BULK_UPLOAD', f'{success_count} imported, {failed_count} failed from {file.filename}')
    db.commit()

    if success_count:
        flash(f'✓ {success_count} assets imported successfully.', 'success')
    if failed_count:
        flash(f'⚠ {failed_count} rows failed — see details below.', 'warning')

    return render_template('bulk_upload.html',
        recent=db.execute("SELECT * FROM bulk_uploads ORDER BY created_at DESC LIMIT 10").fetchall(),
        errors=errors_list, success_count=success_count, failed_count=failed_count,
        has_excel=HAS_EXCEL, has_perm=has_perm)

# ── EXPORT TO EXCEL ───────────────────────────────────────────────────────────
@app.route('/assets/export')
@login_required
def export_assets():
    if not HAS_EXCEL:
        flash('openpyxl not installed.', 'warning')
        return redirect(url_for('assets'))

    db    = get_db()
    rows  = db.execute("SELECT * FROM assets ORDER BY asset_tag").fetchall()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'DAS Asset Register'

    headers = ['Asset Tag','Asset Name','Asset Type','Brand','Model','Serial Number',
               'Company','Location','Department','Assigned To','Assigned To Name',
               'Purchase Date','Purchase Cost (GHS)','Supplier','PO Number','Invoice',
               'Warranty Expiry','Condition','Status','Description','Notes',
               'Created By','Created At','Last Updated']

    hdr_fill = PatternFill('solid', fgColor='0A3D2A')
    for col_idx, h in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col_idx, value=h)
        cell.font      = Font(bold=True, color='00C896', size=10)
        cell.fill      = hdr_fill
        cell.alignment = Alignment(horizontal='center')

    for row_idx, r in enumerate(rows, start=2):
        vals = [r['asset_tag'],r['asset_name'],r['asset_type'],r['brand'],r['model'],
                r['serial_number'],r['company'],r['location'],r['department'],
                r['assigned_to'],r['assigned_to_name'],r['purchase_date'],
                r['purchase_cost'],r['supplier'],r['po_number'],r['invoice_number'],
                r['warranty_expiry'],r['condition'],r['status'],
                r['description'],r['notes'],r['created_by'],r['created_at'],r['updated_at']]
        fill = PatternFill('solid', fgColor='122018' if row_idx % 2 == 0 else '0d1f1a')
        for col_idx, v in enumerate(vals, start=1):
            cell = ws.cell(row=row_idx, column=col_idx, value=v)
            cell.fill = fill
            cell.font = Font(size=10, color='E2EDE8')

    for col in ws.columns:
        ws.column_dimensions[col[0].column_letter].width = max(len(str(col[0].value or '')), 12)

    ws.freeze_panes = 'A2'
    buf = BytesIO()
    wb.save(buf); buf.seek(0)

    fname = f'DAS_Assets_{datetime.now().strftime("%Y%m%d_%H%M")}.xlsx'
    response = make_response(buf.read())
    response.headers['Content-Type']        = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    response.headers['Content-Disposition'] = f'attachment; filename={fname}'
    audit(db, 'EXPORT', f'Exported {len(rows)} assets to Excel'); db.commit()
    return response

# ── MOVEMENT LOG ──────────────────────────────────────────────────────────────
@app.route('/log')
@login_required
def movement_log_view():
    db     = get_db()
    q      = request.args.get('q','')
    action = request.args.get('action','')
    page   = max(1, int(request.args.get('page',1)))
    sql    = "SELECT * FROM movement_log WHERE 1=1"
    params = []
    if q:
        sql += " AND (asset_tag LIKE ? OR asset_name LIKE ? OR from_user LIKE ? OR to_user LIKE ? OR performed_by LIKE ?)"
        params += [f'%{q}%']*5
    if action: sql += " AND action LIKE ?"; params.append(f'%{action}%')
    total   = db.execute(sql.replace("SELECT *","SELECT COUNT(*)"), params).fetchone()[0]
    sql    += " ORDER BY created_at DESC LIMIT 50 OFFSET ?"
    params.append((page-1)*50)
    logs    = db.execute(sql, params).fetchall()
    actions = db.execute("SELECT DISTINCT action FROM movement_log ORDER BY action").fetchall()
    return render_template('movement_log.html', logs=logs, q=q, action=action,
        actions=actions, total=total, page=page, total_pages=max(1,(total+49)//50))

# ── REPORTS ───────────────────────────────────────────────────────────────────
@app.route('/reports')
@login_required
def reports():
    db         = get_db()
    stats      = get_stats(db)
    report     = request.args.get('report','summary')
    filter_val = request.args.get('filter','')
    data = []

    if report == 'by_department':
        data = (db.execute("SELECT * FROM assets WHERE department=? ORDER BY asset_type,asset_name", (filter_val,)).fetchall()
                if filter_val else
                db.execute("SELECT department, COUNT(*) as cnt FROM assets GROUP BY department ORDER BY cnt DESC").fetchall())
    elif report == 'by_location':
        data = (db.execute("SELECT * FROM assets WHERE location=? ORDER BY asset_type,asset_name", (filter_val,)).fetchall()
                if filter_val else
                db.execute("SELECT location, COUNT(*) as cnt FROM assets GROUP BY location ORDER BY cnt DESC").fetchall())
    elif report == 'by_user':
        data = (db.execute("SELECT * FROM assets WHERE assigned_to_name LIKE ? ORDER BY asset_type", (f'%{filter_val}%',)).fetchall()
                if filter_val else
                db.execute("SELECT assigned_to_name, COUNT(*) as cnt FROM assets WHERE assigned_to IS NOT NULL GROUP BY assigned_to_name ORDER BY cnt DESC").fetchall())
    elif report == 'by_company':
        data = (db.execute("SELECT * FROM assets WHERE company=? ORDER BY asset_type,asset_name", (filter_val,)).fetchall()
                if filter_val else
                db.execute("SELECT company, COUNT(*) as cnt FROM assets GROUP BY company ORDER BY cnt DESC").fetchall())
    elif report == 'under_repair':
        data = db.execute("SELECT r.*, a.asset_type, a.location, a.department FROM repairs r LEFT JOIN assets a ON r.asset_id=a.id WHERE r.status='Open' ORDER BY r.created_at").fetchall()
    elif report == 'warranty':
        all_a = db.execute("SELECT * FROM assets WHERE warranty_expiry != '' AND warranty_expiry IS NOT NULL ORDER BY warranty_expiry").fetchall()
        data  = [(a, days_until(a['warranty_expiry'])) for a in all_a if days_until(a['warranty_expiry']) is not None and days_until(a['warranty_expiry']) <= 60]
    elif report == 'software_licenses':
        data = db.execute("SELECT * FROM software ORDER BY expiry_date, sw_name").fetchall()
    elif report == 'full_log':
        data = db.execute("SELECT * FROM movement_log ORDER BY created_at DESC LIMIT 300").fetchall()
    elif report == 'audit_log':
        if has_perm('manage_users'):
            data = db.execute("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200").fetchall()

    return render_template('reports.html', stats=stats, report=report,
        filter_val=filter_val, data=data,
        report_date=datetime.now().strftime('%d %B %Y %H:%M'),
        departments=DEPARTMENTS, locations=LOCATIONS, companies=COMPANIES,
        days_until=days_until, has_perm=has_perm)

# ── USER MANAGEMENT ───────────────────────────────────────────────────────────
@app.route('/users')
@login_required
@require_perm('manage_users')
def users():
    db    = get_db()
    users = db.execute("SELECT * FROM users ORDER BY role, username").fetchall()
    return render_template('users.html', users=users, roles=ROLES,
        departments=DEPARTMENTS, companies=COMPANIES, has_perm=has_perm)

@app.route('/users/new', methods=['GET','POST'])
@login_required
@require_perm('manage_users')
def new_user():
    db = get_db()
    if request.method == 'POST':
        uname = (request.form.get('username') or '').strip().lower()
        pwd   = request.form.get('password') or ''
        fname = (request.form.get('full_name') or '').strip()
        role  = request.form.get('role','it_staff')
        if not uname or not pwd or not fname:
            flash('Username, full name and password are required.', 'danger')
            return redirect(url_for('new_user'))
        if len(pwd) < 8:
            flash('Password must be at least 8 characters.', 'danger')
            return redirect(url_for('new_user'))
        if db.execute("SELECT id FROM users WHERE username=?", (uname,)).fetchone():
            flash(f'Username "{uname}" already exists.', 'danger')
            return redirect(url_for('new_user'))
        db.execute("INSERT INTO users (username,password_hash,full_name,role,department,company) VALUES (?,?,?,?,?,?)",
            (uname, generate_password_hash(pwd), fname, role,
             request.form.get('department',''), request.form.get('company','')))
        audit(db, 'USER_CREATE', f'Created user {uname} ({role})')
        db.commit()
        flash(f'✓ User {uname} created with role: {role}.', 'success')
        return redirect(url_for('users'))
    return render_template('user_form.html', user=None, roles=ROLES,
        departments=DEPARTMENTS, companies=COMPANIES)

@app.route('/users/<int:user_id>/toggle', methods=['POST'])
@login_required
@require_perm('manage_users')
def toggle_user(user_id):
    db   = get_db()
    user = db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    if user['id'] == current_user.id:
        flash('Cannot deactivate your own account.', 'danger')
        return redirect(url_for('users'))
    new_state = 0 if user['is_active'] else 1
    db.execute("UPDATE users SET is_active=? WHERE id=?", (new_state, user_id))
    audit(db, 'USER_TOGGLE', f'{"Activated" if new_state else "Deactivated"} {user["username"]}')
    db.commit()
    flash(f'User {"activated" if new_state else "deactivated"}.', 'success')
    return redirect(url_for('users'))

# ── ASSET TAG PDF ─────────────────────────────────────────────────────────────
@app.route('/assets/<int:asset_id>/tag')
@login_required
def asset_tag(asset_id):
    db    = get_db()
    asset = db.execute("SELECT * FROM assets WHERE id=?", (asset_id,)).fetchone()
    if not asset: return redirect(url_for('assets'))

    if not HAS_PDF:
        flash('ReportLab not installed. Run: pip install reportlab', 'warning')
        return redirect(url_for('view_asset', asset_id=asset_id))

    buf  = BytesIO()
    w, h = 90*mm, 55*mm
    c    = rlcanvas.Canvas(buf, pagesize=(w, h))
    c.setFillColor(rlcolors.HexColor('#0d1f1a'))
    c.rect(0, 0, w, h, fill=1, stroke=0)
    c.setFillColor(rlcolors.HexColor('#00c896'))
    c.rect(0, h-14*mm, w, 14*mm, fill=1, stroke=0)
    c.setFillColor(rlcolors.HexColor('#0d1f1a'))
    c.setFont('Helvetica-Bold', 10)
    c.drawString(3*mm, h-9*mm, 'DAS Plc — IT Asset Register')
    c.setFillColor(rlcolors.HexColor('#00c896'))
    c.setFont('Helvetica-Bold', 16)
    c.drawString(3*mm, h-23*mm, asset['asset_tag'])
    c.setFillColor(rlcolors.white)
    c.setFont('Helvetica-Bold', 9)
    c.drawString(3*mm, h-30*mm, (asset['asset_name'] or '')[:38])
    c.setFont('Helvetica', 7)
    y = h - 36*mm
    for label, val in [('Type', asset['asset_type']),
                       ('S/N',  asset['serial_number'] or '—'),
                       ('Dept', (asset['department'] or '—')[:30]),
                       ('Site', (asset['location'] or '—')[:30])]:
        c.setFillColor(rlcolors.HexColor('#00c896'))
        c.drawString(3*mm, y, f'{label}:')
        c.setFillColor(rlcolors.white)
        c.drawString(13*mm, y, val)
        y -= 5*mm
    c.setFillColor(rlcolors.HexColor('#1c3328'))
    c.rect(0, 0, w, 6*mm, fill=1, stroke=0)
    c.setFillColor(rlcolors.HexColor('#6a9a80'))
    c.setFont('Helvetica', 6)
    c.drawString(3*mm, 2*mm, f'{asset["company"] or "DAS Plc"}  |  Registered: {(asset["created_at"] or "")[:10]}')
    c.save()
    buf.seek(0)
    response = make_response(buf.read())
    response.headers['Content-Type']        = 'application/pdf'
    response.headers['Content-Disposition'] = f'inline; filename=tag_{asset["asset_tag"]}.pdf'
    return response

# ── PEOPLE MODULE ─────────────────────────────────────────────────────────────
@app.route('/people')
@login_required
def people():
    if not has_perm('read') and not has_perm('read_people'):
        flash('Access denied.', 'danger')
        return redirect(url_for('onboarding'))
    """All staff who currently have at least one asset assigned."""
    db = get_db()
    q  = request.args.get('q', '').strip()

    sql = """
        SELECT
            assigned_to          AS username,
            assigned_to_name     AS full_name,
            COUNT(*)             AS total_assets,
            GROUP_CONCAT(DISTINCT asset_type)  AS asset_types,
            GROUP_CONCAT(DISTINCT location)    AS locations,
            GROUP_CONCAT(DISTINCT department)  AS departments,
            MIN(updated_at)      AS first_assigned,
            MAX(updated_at)      AS last_assigned
        FROM assets
        WHERE assigned_to IS NOT NULL
          AND status = 'Active — Assigned'
    """
    params = []
    if q:
        sql += " AND (assigned_to LIKE ? OR assigned_to_name LIKE ?)"
        params += [f'%{q}%', f'%{q}%']
    sql += " GROUP BY assigned_to ORDER BY full_name"

    staff      = db.execute(sql, params).fetchall()
    total_ppl  = db.execute(
        "SELECT COUNT(DISTINCT assigned_to) FROM assets WHERE assigned_to IS NOT NULL AND status='Active — Assigned'"
    ).fetchone()[0]
    total_assigned = db.execute(
        "SELECT COUNT(*) FROM assets WHERE status='Active — Assigned'"
    ).fetchone()[0]

    return render_template('people.html', staff=staff, q=q,
                           total_ppl=total_ppl, total_assigned=total_assigned)


@app.route('/people/<path:username>')
@login_required
def person_profile(username):
    """All assets currently assigned to one person + full history."""
    db       = get_db()
    username = username.strip()

    # Current assets
    current = db.execute(
        """SELECT * FROM assets
           WHERE assigned_to = ? AND status = 'Active — Assigned'
           ORDER BY asset_type, asset_name""",
        (username,)
    ).fetchall()

    # Also fetch any assets previously held (history from movement log)
    history = db.execute(
        """SELECT * FROM movement_log
           WHERE (from_user = ? OR to_user = ?)
           ORDER BY created_at DESC
           LIMIT 200""",
        (username, username)
    ).fetchall()

    # Repair history for this person's current assets
    asset_tags = [a['asset_tag'] for a in current]
    repairs    = []
    if asset_tags:
        placeholders = ','.join('?' * len(asset_tags))
        repairs = db.execute(
            f"SELECT * FROM repairs WHERE asset_tag IN ({placeholders}) ORDER BY created_at DESC",
            asset_tags
        ).fetchall()

    # Person details from first current asset (or history)
    # full_name: use assigned_to_name if set, else fall back to the assigned_to field, then username
    raw_name = (current[0]['assigned_to_name'] if current else None)
    if not raw_name and current:
        raw_name = current[0]['assigned_to']   # use assigned_to if assigned_to_name is blank
    if not raw_name:
        raw_name = next((h['to_user'] for h in history if h['to_user'] == username), username)
    full_name = raw_name or username
    department = current[0]['department'] if current else '—'
    location   = current[0]['location']   if current else '—'

    return render_template('person_profile.html',
        username=username, full_name=full_name,
        department=department, location=location,
        current=current, history=history, repairs=repairs,
        has_perm=has_perm, days_until=days_until)


@app.route('/people/<path:username>/handover', methods=['POST'])
@login_required
@require_perm('assign')
def person_handover(username):
    """Return ALL assets from one person to unassigned pool in one action."""
    db     = get_db()
    notes  = (request.form.get('handover_notes') or '').strip()
    reason = (request.form.get('reason') or 'Staff handover').strip()

    assets = db.execute(
        "SELECT * FROM assets WHERE assigned_to=? AND status='Active — Assigned'",
        (username,)
    ).fetchall()

    if not assets:
        flash('No active assigned assets found for this user.', 'warning')
        return redirect(url_for('person_profile', username=username))

    count     = 0
    full_name = assets[0]['assigned_to_name'] if assets else username

    for asset in assets:
        log_movement(db, asset['asset_tag'], asset['asset_name'],
                     f'Handover — {reason}',
                     username, None,
                     asset['location'], asset['location'],
                     asset['department'], asset['department'],
                     'Active — Assigned', 'Active — Unassigned',
                     notes or f'Full handover from {full_name}')
        db.execute("""UPDATE assets SET
                      assigned_to=NULL, assigned_to_name=NULL,
                      status='Active — Unassigned',
                      updated_at=datetime('now')
                      WHERE id=?""", (asset['id'],))
        count += 1

    audit(db, 'HANDOVER',
          f'Full handover: {count} assets returned from {full_name} ({username}). Reason: {reason}')
    db.commit()

    flash(f'✓ {count} asset{"s" if count != 1 else ""} returned from {full_name} to the unassigned pool.', 'success')
    return redirect(url_for('people'))


@app.route('/people/<path:username>/update-profile', methods=['POST'])
@login_required
@require_perm('assign')
def update_person_profile(username):
    """Update location and/or department for ALL assets assigned to a person."""
    db          = get_db()
    new_location   = (request.form.get('new_location') or '').strip()
    new_department = (request.form.get('new_department') or '').strip()
    reason         = (request.form.get('reason') or '').strip()

    if not new_location:
        flash('Please select a new location.', 'danger')
        return redirect(url_for('person_profile', username=username))

    if not reason:
        flash('Please provide a reason for the change.', 'danger')
        return redirect(url_for('person_profile', username=username))

    assets = db.execute(
        "SELECT * FROM assets WHERE assigned_to=? AND status='Active — Assigned'",
        (username,)
    ).fetchall()

    if not assets:
        flash('No active assigned assets found for this user.', 'warning')
        return redirect(url_for('person_profile', username=username))

    count     = 0
    full_name = assets[0]['assigned_to_name'] if assets else username

    for asset in assets:
        old_location   = asset['location']   or ''
        old_department = asset['department'] or ''
        upd_location   = new_location
        upd_department = new_department if new_department else old_department

        # Only log if something actually changed
        if upd_location == old_location and upd_department == old_department:
            continue

        action = []
        if upd_location != old_location:
            action.append(f'Location: {old_location} → {upd_location}')
        if upd_department != old_department:
            action.append(f'Dept: {old_department} → {upd_department}')

        log_movement(db, asset['asset_tag'], asset['asset_name'],
                     'Profile Update — ' + ' | '.join(action),
                     username, username,
                     old_location, upd_location,
                     old_department, upd_department,
                     asset['status'], asset['status'],
                     reason)
        db.execute("""UPDATE assets SET
                      location=?, department=?, updated_at=datetime('now')
                      WHERE id=?""",
                   (upd_location, upd_department, asset['id']))
        count += 1

    audit(db, 'PROFILE_UPDATE',
          f'{full_name} ({username}): {count} assets updated → {new_location}'
          + (f' / {new_department}' if new_department else ''))
    db.commit()

    if count == 0:
        flash('No changes detected — location and department are already the same.', 'warning')
    else:
        flash(f'✓ {count} asset{"s" if count != 1 else ""} updated to {new_location}'
              + (f' / {new_department}' if new_department else '') + '.', 'success')

    return redirect(url_for('person_profile', username=username))


@app.route('/people/<path:username>/return-one/<int:asset_id>', methods=['POST'])
@login_required
@require_perm('assign')
def return_one_asset(username, asset_id):
    """Return a single asset from a user's profile page."""
    db    = get_db()
    asset = db.execute("SELECT * FROM assets WHERE id=? AND assigned_to=?",
                       (asset_id, username)).fetchone()
    if not asset:
        flash('Asset not found or not assigned to this user.', 'danger')
        return redirect(url_for('person_profile', username=username))

    notes = (request.form.get('notes') or '').strip()
    log_movement(db, asset['asset_tag'], asset['asset_name'],
                 'Returned to Pool',
                 username, None,
                 asset['location'], asset['location'],
                 asset['department'], asset['department'],
                 'Active — Assigned', 'Active — Unassigned',
                 notes or f'Returned from {asset["assigned_to_name"]}')
    db.execute("""UPDATE assets SET
                  assigned_to=NULL, assigned_to_name=NULL,
                  status='Active — Unassigned',
                  updated_at=datetime('now') WHERE id=?""", (asset_id,))
    audit(db, 'RETURN_ONE', f'{asset["asset_tag"]} returned from {username}')
    db.commit()
    flash(f'✓ {asset["asset_tag"]} returned to unassigned pool.', 'success')
    return redirect(url_for('person_profile', username=username))


# ══════════════════════════════════════════════════════════════════════════════
# ONBOARDING MODULE
# ══════════════════════════════════════════════════════════════════════════════

# ── Default checklist items auto-generated for every new joiner ───────────────
def default_checklist():
    """
    Returns list of (category, item_name, description, owner, sort_order)
    Matched to DAS/IT-SOP/G/008 — SOP for User Account Creation v03
    Username format: first initial + last name (e.g. adagbui)
    Email format: username@daspharma.com
    """
    return [
        # ── 7.1 Receiving the Onboarding Form ────────────────────────────────
        ('Onboarding Form', 'Receive completed onboarding form from supervisor',
         'Supervisor must have completed the User Account Creation Form specifying '
         'which resources the new employee requires (computer login, email, '
         'Business Central, network shared folders).',
         'HR', 1),
        ('Onboarding Form', 'Verify all required fields are completed on the form',
         'Check that all sections of the form are filled in — department, job title, '
         'required resources ticked, and start date confirmed.',
         'IT', 2),
        ('Onboarding Form', 'Confirm form is signed by supervisor',
         'The supervisor must sign the onboarding form before IT can proceed with '
         'account creation. Do not create accounts without supervisor signature.',
         'IT', 3),
        ('Onboarding Form', 'Confirm form is signed by new employee',
         'The new employee must also sign the form acknowledging the resources '
         'they will be granted access to.',
         'IT', 4),
        ('Onboarding Form', 'Assign unique username — first initial + last name',
         'Determine username using DAS Plc format: first initial + last name '
         '(e.g. Alvin Dagbui → adagbui). Confirm the username is unique in '
         'Active Directory — no conflicts with existing accounts.',
         'IT', 5),
        ('Onboarding Form', 'File the completed onboarding form',
         'Store the signed onboarding form in a secure location — digitally in '
         'the IT department shared folder or physically in the IT records file '
         'as per company policy.',
         'IT', 6),

        # ── 7.2 Computer Login (Active Directory) ─────────────────────────────
        ('IT Accounts', 'Create Active Directory (AD) user account',
         'Access Active Directory. Create a new user account with the assigned '
         'username (first initial + last name format). Set a temporary password '
         'that the employee must change on first login.',
         'IT', 1),
        ('IT Accounts', 'Assign AD security group based on department',
         'Add the new user to the appropriate AD security group for their '
         'department. This controls access to department resources and shared '
         'drives automatically.',
         'IT', 2),
        ('IT Accounts', 'Configure account to force password change on first login',
         'Enable "User must change password at next logon" on the AD account. '
         'The temporary password issued must not be the permanent password.',
         'IT', 3),

        # ── 7.2 Email Login (Microsoft 365) ──────────────────────────────────
        ('IT Accounts', 'Create Microsoft 365 email account',
         'Access the Microsoft 365 Admin Portal. Create email account using '
         'the assigned username: username@daspharma.com. Assign the appropriate '
         'M365 licence (Business Standard or equivalent).',
         'IT', 4),
        ('IT Accounts', 'Set temporary email password — force change on first login',
         'Set a temporary password on the M365 account and configure it to '
         'prompt for a password change upon the first login.',
         'IT', 5),
        ('IT Accounts', 'Configure email account settings and signature',
         'Set the display name, configure the email signature template, and '
         'add the user to relevant Microsoft Teams channels and shared '
         'mailboxes for their department.',
         'IT', 6),

        # ── 7.2 Business Central (replaces Dynamics NAV 2016) ─────────────────
        ('IT Accounts', 'Create Business Central user account (if required)',
         'Access Microsoft Dynamics 365 Business Central Admin. Add the new '
         'user under the Users section. Assign the appropriate permission set '
         'based on their role and department as indicated on the onboarding form.',
         'IT', 7),
        ('IT Accounts', 'Notify supervisor of Business Central training (if required)',
         'If the new employee requires Business Central training or additional '
         'configuration, notify the supervisor and schedule accordingly before '
         'granting full access.',
         'IT', 8),

        # ── 7.2 Network Shared Folder Access ─────────────────────────────────
        ('Access Rights', 'Determine network shared folder access required',
         'Review the onboarding form to identify which shared folders and file '
         'shares the employee needs access to, as indicated by the supervisor.',
         'IT', 1),
        ('Access Rights', 'Assign permissions to relevant network shared folders',
         'Add the user to the specific access groups or set folder-level '
         'permissions for all required shared drives. Use AD group membership '
         'where possible for easier future management.',
         'IT', 2),
        ('Access Rights', 'Final review — verify all accounts match onboarding form',
         'Cross-check that all accounts created and all permissions granted '
         'exactly match the resources ticked on the signed onboarding form. '
         'Verify login credentials are correctly configured and secured.',
         'IT', 3),
        ('Access Rights', 'Line manager / supervisor access sign-off',
         'Confirm with the supervisor that all access granted matches the '
         'employee\'s job requirements. Supervisor to acknowledge in writing '
         'or via email.',
         'Manager', 4),

        # ── 7.3 Providing Credentials to the New Employee ─────────────────────
        ('Credential Handover', 'Prepare secure credentials document',
         'Prepare a document containing: username, temporary password for each '
         'system (AD/Windows, email, Business Central), and step-by-step '
         'instructions on how to access each system for the first time.',
         'IT', 1),
        ('Credential Handover', 'Deliver credentials in person or via secure channel',
         'Hand over the credentials document in person where possible. If remote, '
         'use a secure channel — do not send passwords via plain email or '
         'WhatsApp.',
         'IT', 2),
        ('Credential Handover', 'Instruct employee to change all temporary passwords on first login',
         'Clearly instruct the new employee that all temporary passwords must '
         'be changed immediately on first login. Confirm they understand the '
         'DAS Plc password policy: minimum 8 characters.',
         'IT', 3),
        ('Credential Handover', 'Brief employee on IT security and acceptable use policies',
         'Inform the new employee about: company policies on account usage and '
         'security, password management rules, data handling, and who to contact '
         'for IT support (IT helpdesk / IT Assistant Manager).',
         'IT', 4),
        ('Credential Handover', 'Provide IT helpdesk contact details',
         'Give the employee the IT support contact information in case they '
         'encounter any login issues or require assistance with their accounts.',
         'IT', 5),

        # ── 7.4 Documentation & Record-Keeping ───────────────────────────────
        ('Documentation', 'Update IT employee directory with new account details',
         'Update the IT department\'s employee directory / asset register to '
         'reflect the new account details, username, and all access granted. '
         'Record in ITAM against the employee\'s profile.',
         'IT', 1),
        ('Documentation', 'Record equipment assigned in ITAM',
         'Log all physical equipment (laptop, desktop, phone, accessories) '
         'assigned to the new employee in the ITAM system. Link to their '
         'user profile using their AD username.',
         'IT', 2),
        ('Documentation', 'Confirm all documentation filed and record-keeping complete',
         'Verify: signed onboarding form filed, IT directory updated, ITAM '
         'updated, credentials delivered. Onboarding IT setup is complete.',
         'IT', 3),

        # ── HR Documents ──────────────────────────────────────────────────────
        ('HR Documents', 'Collect valid photo ID (Ghana Card or Passport)',
         'Photocopy and file. Verify against employment letter.',
         'HR', 1),
        ('HR Documents', 'Signed employment contract on file',
         'Confirm signed contract received and filed in HR records.',
         'HR', 2),
        ('HR Documents', 'NDA / Confidentiality agreement signed',
         'Issue, obtain signature, and file in HR records.',
         'HR', 3),
        ('HR Documents', 'Staff photo taken for ID card',
         'Take photo for company ID card production.',
         'HR', 4),
        ('HR Documents', 'Emergency contact form completed',
         'Obtain next-of-kin and emergency contact details from employee.',
         'HR', 5),
        ('HR Documents', 'Bank account details submitted for payroll',
         'Confirm bank name, branch, and account number received by payroll.',
         'HR', 6),
        ('HR Documents', 'SSNIT number recorded',
         'Record Social Security and National Insurance Trust number.',
         'HR', 7),

        # ── IT Security Acknowledgement ───────────────────────────────────────
        ('IT Security', 'IT Security Policy read and acknowledged',
         'Employee reads the DAS Plc IT Security Policy and signs acknowledgement.',
         'IT', 1),
        ('IT Security', 'Acceptable Use Policy (AUP) signed',
         'Employee signs the Acceptable Use Policy for all IT systems and resources.',
         'IT', 2),
        ('IT Security', 'Password policy briefing completed',
         'Brief employee on DAS Plc password requirements: minimum 8 characters, '
         'must change temporary password on first login, no sharing of credentials.',
         'IT', 3),
        ('IT Security', 'Phishing and email security awareness briefing',
         'Brief employee on how to identify phishing emails, suspicious links, '
         'and what to do if they receive a suspicious message.',
         'IT', 4),
        ('IT Security', 'Data handling and Ghana Data Protection Act briefing',
         'Brief employee on obligations under the Ghana Data Protection Act 2012 '
         'and DAS Plc data handling rules.',
         'IT', 5),
        ('IT Security', 'IT Security acknowledgement form signed and filed',
         'Employee signs the IT Security Acknowledgement Form confirming all '
         'security briefings have been received and understood. File in IT records.',
         'IT', 6),
    ]

def default_induction(department):
    """Returns list of (session_title, dept_to_visit, facilitator, sort_order)"""
    sessions = [
        ('Welcome & Company Overview',    'Executive Management', 'HR Manager',             1),
        ('HR Policies & Benefits',        'Human Resources',      'HR Officer',             2),
        ('IT Systems & Tools Overview',   'Information Technology','IT Assistant Manager',  3),
        ('Health & Safety Induction',     'Maintenance / HSE',    'HSE Officer',            4),
        ('Finance & Expense Procedures',  'Finance & Accounts',   'Finance Manager',        5),
        ('Quality & Compliance Overview', 'Quality Assurance',    'QA Manager',             6),
        ('Department Induction',          department,             'Line Manager',           7),
        ('Site Tour',                     'All Departments',      'HR Officer',             8),
        ('Day 30 Check-In',               'Human Resources',      'HR Manager',             9),
    ]
    return sessions

def onboarding_progress(db, onb_id):
    """Calculate overall % completion across checklist + induction."""
    total = db.execute(
        "SELECT COUNT(*) FROM onboarding_checklist WHERE onboarding_id=?", (onb_id,)
    ).fetchone()[0]
    done = db.execute(
        "SELECT COUNT(*) FROM onboarding_checklist WHERE onboarding_id=? AND status='Complete'",
        (onb_id,)
    ).fetchone()[0]
    ind_total = db.execute(
        "SELECT COUNT(*) FROM onboarding_induction WHERE onboarding_id=?", (onb_id,)
    ).fetchone()[0]
    ind_done = db.execute(
        "SELECT COUNT(*) FROM onboarding_induction WHERE onboarding_id=? AND status='Completed'",
        (onb_id,)
    ).fetchone()[0]
    grand_total = total + ind_total
    grand_done  = done  + ind_done
    return round(grand_done / grand_total * 100) if grand_total else 0


# ── List all onboarding records ───────────────────────────────────────────────
@app.route('/onboarding')
@login_required
def onboarding():
    db     = get_db()
    status = request.args.get('status', '')
    q      = request.args.get('q', '').strip()
    sql    = "SELECT * FROM onboarding WHERE 1=1"
    params = []
    if status:
        sql += " AND status=?"; params.append(status)
    if q:
        sql += " AND (full_name LIKE ? OR job_title LIKE ? OR department LIKE ? OR onb_ref LIKE ?)"
        params += [f'%{q}%'] * 4
    sql += " ORDER BY created_at DESC"
    records = db.execute(sql, params).fetchall()

    # Attach progress to each record
    records_with_progress = []
    for r in records:
        prog = onboarding_progress(db, r['id'])
        records_with_progress.append((r, prog))

    stats = {
        'total':       db.execute("SELECT COUNT(*) FROM onboarding").fetchone()[0],
        'in_progress': db.execute("SELECT COUNT(*) FROM onboarding WHERE status='In Progress'").fetchone()[0],
        'completed':   db.execute("SELECT COUNT(*) FROM onboarding WHERE status='Completed'").fetchone()[0],
        'this_month':  db.execute(
            "SELECT COUNT(*) FROM onboarding WHERE strftime('%Y-%m',created_at)=strftime('%Y-%m','now')"
        ).fetchone()[0],
    }
    return render_template('onboarding.html', records=records_with_progress,
                           stats=stats, q=q, status_f=status)


# ── New onboarding record ─────────────────────────────────────────────────────
@app.route('/onboarding/new', methods=['GET', 'POST'])
@login_required
def new_onboarding():
    if request.method == 'POST':
        db       = get_db()
        f        = request.form
        onb_ref  = next_ref('ONB', 'onboarding', 'onb_ref', db)
        full_name = (f.get('full_name') or '').strip()
        job_title = (f.get('job_title') or '').strip()
        dept      = (f.get('department') or '').strip()
        location  = (f.get('location') or '').strip()

        if not full_name or not job_title or not dept or not location:
            flash('Full name, job title, department and location are required.', 'danger')
            return render_template('onboarding_form.html',
                                   form=dict(f), locations=LOCATIONS,
                                   departments=DEPARTMENTS)

        # Create main record
        db.execute("""INSERT INTO onboarding
            (onb_ref, full_name, preferred_name, job_title, department, location,
             employment_type, manager_name, manager_username, start_date,
             email_assigned, ad_username, phone_number, status, hr_initiated_by, notes)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (onb_ref, full_name, f.get('preferred_name','').strip(), job_title,
             dept, location, f.get('employment_type', 'Full-Time'),
             f.get('manager_name','').strip(), f.get('manager_username','').strip(),
             f.get('start_date',''), f.get('email_assigned','').strip(),
             f.get('ad_username','').strip(), f.get('phone_number','').strip(),
             'In Progress', current_user.username, f.get('notes','').strip()))
        onb_id = db.execute("SELECT id FROM onboarding WHERE onb_ref=?",
                            (onb_ref,)).fetchone()['id']
        db.execute("UPDATE onboarding SET employee_id=? WHERE id=?",
                   ((f.get('employee_id') or '').strip()[:40] or None, onb_id))

        # Auto-generate default checklist
        for category, item_name, desc, owner, order in default_checklist():
            db.execute("""INSERT INTO onboarding_checklist
                (onboarding_id, category, item_name, description, owner, status, sort_order)
                VALUES (?,?,?,?,?,?,?)""",
                (onb_id, category, item_name, desc, owner, 'Pending', order))

        # Auto-generate induction schedule
        for title, dept_visit, facilitator, order in default_induction(dept):
            db.execute("""INSERT INTO onboarding_induction
                (onboarding_id, session_title, department, facilitator, status, sort_order)
                VALUES (?,?,?,?,?,?)""",
                (onb_id, title, dept_visit, facilitator, 'Scheduled', order))

        audit(db, 'ONBOARDING_CREATE',
              f'Created {onb_ref} for {full_name} — {job_title}')
        db.commit()
        flash(f'✓ Onboarding record {onb_ref} created for {full_name}. '
              f'Full checklist auto-generated.', 'success')
        return redirect(url_for('view_onboarding', onb_id=onb_id))

    return render_template('onboarding_form.html', form={},
                           locations=LOCATIONS, departments=DEPARTMENTS)


# ── View single onboarding record ────────────────────────────────────────────
@app.route('/onboarding/<int:onb_id>')
@login_required
def view_onboarding(onb_id):
    db  = get_db()
    rec = db.execute("SELECT * FROM onboarding WHERE id=?", (onb_id,)).fetchone()
    if not rec: return redirect(url_for('onboarding'))

    # Checklist grouped by category
    all_items = db.execute(
        "SELECT * FROM onboarding_checklist WHERE onboarding_id=? ORDER BY category, sort_order",
        (onb_id,)
    ).fetchall()
    categories = ['Onboarding Form', 'IT Accounts', 'Access Rights',
                  'Credential Handover', 'Documentation',
                  'HR Documents', 'IT Security']
    checklist = {}
    for cat in categories:
        checklist[cat] = [i for i in all_items if i['category'] == cat]

    # Induction sessions
    induction = db.execute(
        "SELECT * FROM onboarding_induction WHERE onboarding_id=? ORDER BY sort_order",
        (onb_id,)
    ).fetchall()

    # Assigned assets from ITAM
    assigned_assets = []
    if rec['ad_username']:
        assigned_assets = db.execute(
            "SELECT * FROM assets WHERE assigned_to=? AND status='Active — Assigned'",
            (rec['ad_username'],)
        ).fetchall()

    # Progress per category
    progress = {}
    for cat in categories:
        items = checklist.get(cat, [])
        done  = sum(1 for i in items if i['status'] == 'Complete')
        progress[cat] = {'done': done, 'total': len(items),
                         'pct': round(done / len(items) * 100) if items else 0}

    ind_done  = sum(1 for i in induction if i['status'] == 'Completed')
    progress['Induction'] = {'done': ind_done, 'total': len(induction),
                              'pct': round(ind_done / len(induction) * 100) if induction else 0}

    overall = onboarding_progress(db, onb_id)

    return render_template('onboarding_detail.html', rec=rec,
                           checklist=checklist, induction=induction,
                           categories=categories, progress=progress,
                           overall=overall, assigned_assets=assigned_assets)


# ── Update a single checklist item ───────────────────────────────────────────
@app.route('/onboarding/<int:onb_id>/checklist/<int:item_id>/update', methods=['POST'])
@login_required
def update_checklist_item(onb_id, item_id):
    db     = get_db()
    status = request.form.get('status', 'Pending')
    notes  = (request.form.get('notes') or '').strip()
    closed = datetime.now().isoformat() if status == 'Complete' else None
    db.execute("""UPDATE onboarding_checklist SET
                  status=?, notes=?, completed_by=?, completed_at=?
                  WHERE id=? AND onboarding_id=?""",
               (status, notes, current_user.username if status == 'Complete' else None,
                closed, item_id, onb_id))
    # Auto-complete the onboarding record if everything done
    prog = onboarding_progress(db, onb_id)
    if prog == 100:
        db.execute("UPDATE onboarding SET status='Completed', updated_at=datetime('now') WHERE id=?",
                   (onb_id,))
    db.commit()
    return redirect(url_for('view_onboarding', onb_id=onb_id))


# ── Update induction session ──────────────────────────────────────────────────
@app.route('/onboarding/<int:onb_id>/induction/<int:session_id>/update', methods=['POST'])
@login_required
def update_induction_session(onb_id, session_id):
    db     = get_db()
    status = request.form.get('status', 'Scheduled')
    date_  = request.form.get('scheduled_date', '')
    time_  = request.form.get('scheduled_time', '')
    notes  = (request.form.get('notes') or '').strip()
    db.execute("""UPDATE onboarding_induction SET
                  status=?, scheduled_date=?, scheduled_time=?, notes=?
                  WHERE id=? AND onboarding_id=?""",
               (status, date_, time_, notes, session_id, onb_id))
    db.commit()
    return redirect(url_for('view_onboarding', onb_id=onb_id) + '#induction')


# ── Update onboarding record details ─────────────────────────────────────────
@app.route('/onboarding/<int:onb_id>/update-details', methods=['POST'])
@login_required
def update_onboarding_details(onb_id):
    db = get_db()
    f  = request.form
    db.execute("""UPDATE onboarding SET
                  email_assigned=?, ad_username=?, phone_number=?,
                  manager_name=?, manager_username=?, start_date=?,
                  notes=?, updated_at=datetime('now') WHERE id=?""",
               (f.get('email_assigned','').strip(), f.get('ad_username','').strip(),
                f.get('phone_number','').strip(), f.get('manager_name','').strip(),
                f.get('manager_username','').strip(), f.get('start_date',''),
                f.get('notes','').strip(), onb_id))
    audit(db, 'ONBOARDING_UPDATE', f'Updated details for ONB id {onb_id}')
    db.commit()
    flash('✓ Onboarding details updated.', 'success')
    return redirect(url_for('view_onboarding', onb_id=onb_id))


# ── Mark onboarding complete / cancel ────────────────────────────────────────
@app.route('/onboarding/<int:onb_id>/set-status', methods=['POST'])
@login_required
def set_onboarding_status(onb_id):
    db     = get_db()
    status = request.form.get('status', 'In Progress')
    db.execute("UPDATE onboarding SET status=?, updated_at=datetime('now') WHERE id=?",
               (status, onb_id))
    audit(db, 'ONBOARDING_STATUS', f'ONB {onb_id} → {status}')
    db.commit()
    flash(f'Onboarding status set to {status}.', 'success')
    return redirect(url_for('view_onboarding', onb_id=onb_id))


# ── MAIN ──────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    init_db()
    print("=" * 60)
    print("  ITAM v2 — IT Asset Management System")
    print("  DAS Plc | Port 5057")
    print("  Accounts:")
    print("    admin      / admin123    (Full Admin)")
    print("    it_manager / manager123  (IT Manager)")
    print("    it_staff   / staff123    (IT Staff)")
    print("    viewer     / viewer123   (Read-Only)")
    print("=" * 60)
    app.run(host=os.environ.get('ITAM_HOST', '0.0.0.0'), debug=False,
            port=int(os.environ.get('ITAM_PORT', '5057')))
