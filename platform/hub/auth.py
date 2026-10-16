"""Hub authentication: scrypt passwords, lockout, password policy, RFC 6238 TOTP."""
import base64, hashlib, hmac, secrets, struct, time
from werkzeug.security import check_password_hash, generate_password_hash
from . import db

ROLES = ['admin', 'auditor', 'it_manager', 'it_staff', 'hr', 'readonly']
PERMS = {
    'admin':      {'view', 'launch', 'sync', 'attest', 'export', 'manage_users', 'ledger'},
    'auditor':    {'view', 'launch', 'export', 'ledger'},
    'it_manager': {'view', 'launch', 'sync', 'attest', 'export', 'ledger'},
    'it_staff':   {'view', 'launch'},
    'hr':         {'view', 'launch'},
    'readonly':   {'view'},
}
MAX_FAILS, LOCK_SECONDS = 5, 15 * 60
COMMON = {'password', 'password123', 'admin123', 'welcome123', 'qwerty123456', 'letmein12345',
          'changeme1234', 'dasplc123456', 'administrator'}


def can(role, perm):
    return perm in PERMS.get(role, set())


def policy_errors(pw, username=''):
    errs = []
    if len(pw) < 12:
        errs.append('at least 12 characters')
    if pw.lower() in COMMON or (username and username.lower() in pw.lower()):
        errs.append('must not be common or contain the username')
    if sum(bool(x) for x in (any(c.islower() for c in pw), any(c.isupper() for c in pw),
                             any(c.isdigit() for c in pw), any(not c.isalnum() for c in pw))) < 3:
        errs.append('use at least 3 of: lowercase, uppercase, digit, symbol')
    return errs


def create_user(username, password, role='readonly', full_name='', must_change=True):
    if role not in ROLES:
        raise ValueError('bad role')
    conn = db.connect()
    conn.execute('INSERT INTO users (username,full_name,role,password_hash,must_change_pw) VALUES (?,?,?,?,?)',
                 (username.lower(), full_name or username, role, generate_password_hash(password), int(must_change)))
    conn.commit(); conn.close()


def authenticate(username, password):
    """Return (user_row|None, error|None). Applies lockout; constant-ish work on unknown users."""
    conn = db.connect()
    u = conn.execute('SELECT * FROM users WHERE username=?', (username.lower().strip(),)).fetchone()
    now = time.time()
    if u is None:
        check_password_hash(generate_password_hash('x'), password)   # equalise timing
        conn.close()
        return None, 'Invalid username or password.'
    if u['locked_until'] > now:
        conn.close()
        return None, f"Account locked. Try again in {int((u['locked_until'] - now) // 60) + 1} min."
    if not u['is_active'] or not check_password_hash(u['password_hash'], password):
        fails = u['failed_count'] + 1
        lock = now + LOCK_SECONDS if fails >= MAX_FAILS else 0
        conn.execute('UPDATE users SET failed_count=?, locked_until=? WHERE id=?', (0 if lock else fails, lock, u['id']))
        conn.commit(); conn.close()
        return None, 'Invalid username or password.'
    conn.execute('UPDATE users SET failed_count=0, locked_until=0 WHERE id=?', (u['id'],))
    conn.commit(); conn.close()
    return u, None


# ── TOTP (RFC 6238, SHA-1, 6 digits, 30 s) ──────────────────────────────────
def new_totp_secret():
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip('=')


def _totp(secret, counter):
    key = base64.b32decode(secret + '=' * (-len(secret) % 8), casefold=True)
    mac = hmac.new(key, struct.pack('>Q', counter), hashlib.sha1).digest()
    o = mac[-1] & 0x0F
    return f'{(struct.unpack(">I", mac[o:o + 4])[0] & 0x7FFFFFFF) % 10**6:06d}'


def totp_now(secret, at=None):
    return _totp(secret, int((at or time.time()) // 30))


def totp_verify(secret, code, window=1, at=None):
    code = (code or '').strip().replace(' ', '')
    if not (secret and code.isdigit() and len(code) == 6):
        return False
    c = int((at or time.time()) // 30)
    return any(hmac.compare_digest(_totp(secret, c + d), code) for d in range(-window, window + 1))


def otpauth_uri(secret, username):
    return f'otpauth://totp/DAS%20Trust%20Hub:{username}?secret={secret}&issuer=DAS%20Trust%20Hub'
