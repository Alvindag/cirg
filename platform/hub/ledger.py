"""Tamper-evident, hash-chained audit ledger.

Every event is stored with hash = SHA256(prev_hash | canonical(event)). Events from ITAM's
audit_log and CyberShield's compliance_log are copied in (with a content hash of the source row),
so later edits or deletions in either source are detected by `verify()`.
"""
import hashlib, json
from datetime import datetime, timezone
from . import connectors, db

GENESIS = '0' * 64


def _h(*parts):
    return hashlib.sha256('|'.join(str(p) for p in parts).encode('utf-8')).hexdigest()


def _canon(ts, source, source_id, actor, action, detail):
    return json.dumps([ts, source, source_id, actor, action, detail], ensure_ascii=False, separators=(',', ':'))


def append(conn, source, actor, action, detail='', source_id=None, ts=None, content_hash=None):
    ts = ts or datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    last = conn.execute('SELECT hash FROM ledger ORDER BY id DESC LIMIT 1').fetchone()
    prev = last['hash'] if last else GENESIS
    canon = _canon(ts, source, source_id, actor, action, detail)
    content_hash = content_hash or _h(canon)
    h = _h(prev, canon, content_hash)
    conn.execute('INSERT INTO ledger (ts,source,source_id,actor,action,detail,content_hash,prev_hash,hash) VALUES (?,?,?,?,?,?,?,?,?)',
                 (ts, source, source_id, actor, action, detail, content_hash, prev, h))
    return h


def log(actor, action, detail=''):
    """Record a Hub event (login, attestation, export...)."""
    conn = db.connect()
    try:
        conn.execute('BEGIN IMMEDIATE')
        append(conn, 'hub', actor, action, detail)
        conn.commit()
    finally:
        conn.close()


def _itam_hash(r):
    return _h('itam', r['id'], r['username'], r['action'], r['detail'], r['ip_address'], r['success'], r['created_at'])


def _cs_hash(r):
    return _h('cs', r['id'], r['trainee_id'], r['action'], r['reason'], r['actioned_by'], r['actioned_at'], r['new_deadline'], r['emails_sent'])


def sync():
    """Pull new rows from both source audit trails into the chain. Returns counts."""
    conn = db.connect()
    added = {'itam': 0, 'cybershield': 0}
    try:
        conn.execute('BEGIN IMMEDIATE')
        src = connectors.itam()
        if src is not None:
            cur = conn.execute("SELECT last_id FROM ledger_cursor WHERE source='itam'").fetchone()
            last = cur['last_id'] if cur else 0
            for r in connectors._rows(src, 'SELECT * FROM audit_log WHERE id>? ORDER BY id', (last,)):
                ts = (r['created_at'] or '').replace(' ', 'T')
                detail = f"{r['detail'] or ''} [ip={r['ip_address']}, ok={r['success']}]"
                append(conn, 'itam', r['username'], r['action'], detail, r['id'], ts, _itam_hash(r))
                last = r['id']; added['itam'] += 1
            conn.execute('INSERT INTO ledger_cursor(source,last_id) VALUES(?,?) ON CONFLICT(source) DO UPDATE SET last_id=excluded.last_id', ('itam', last))
            src.close()
        src = connectors.cybershield()
        if src is not None:
            cur = conn.execute("SELECT last_id FROM ledger_cursor WHERE source='cybershield'").fetchone()
            last = cur['last_id'] if cur else 0
            for r in connectors._rows(src, 'SELECT * FROM compliance_log WHERE id>? ORDER BY id', (last,)):
                detail = f"trainee={r['trainee_id']} {r['reason'] or ''}"
                append(conn, 'cybershield', r['actioned_by'], r['action'], detail, r['id'], (r['actioned_at'] or ''), _cs_hash(r))
                last = r['id']; added['cybershield'] += 1
            conn.execute('INSERT INTO ledger_cursor(source,last_id) VALUES(?,?) ON CONFLICT(source) DO UPDATE SET last_id=excluded.last_id', ('cybershield', last))
            src.close()
        conn.commit()
    finally:
        conn.close()
    return added


def verify():
    """Check the chain and cross-check source rows. Returns a result dict."""
    conn = db.connect()
    problems = []
    prev = GENESIS
    n = 0
    for r in conn.execute('SELECT * FROM ledger ORDER BY id'):
        n += 1
        if r['prev_hash'] != prev:
            problems.append(f"Entry {r['id']}: chain broken (previous hash mismatch)")
        canon = _canon(r['ts'], r['source'], r['source_id'], r['actor'], r['action'], r['detail'])
        if r['source'] == 'hub' and r['content_hash'] != _h(canon):
            problems.append(f"Entry {r['id']}: content altered")
        if r['hash'] != _h(r['prev_hash'], canon, r['content_hash']):
            problems.append(f"Entry {r['id']}: hash mismatch (record edited)")
        prev = r['hash']
    # Cross-check: source rows already sealed in the chain must be unchanged and present.
    for source, getter, table, hasher in (('itam', connectors.itam, 'audit_log', _itam_hash),
                                          ('cybershield', connectors.cybershield, 'compliance_log', _cs_hash)):
        src = getter()
        if src is None:
            continue
        sealed = {r['source_id']: r['content_hash'] for r in
                  conn.execute('SELECT source_id, content_hash FROM ledger WHERE source=?', (source,))}
        live = {r['id']: hasher(r) for r in connectors._rows(src, f'SELECT * FROM {table}')}  # nosec B608 - table name is a hard-coded constant
        for sid, ch in sealed.items():
            if sid not in live:
                problems.append(f"{source} {table} row {sid} was deleted after being sealed")
            elif live[sid] != ch:
                problems.append(f"{source} {table} row {sid} was modified after being sealed")
        src.close()
    head = prev
    conn.close()
    return {'ok': not problems, 'entries': n, 'head': head, 'problems': problems}


def recent(limit=200, source=None, q=None):
    conn = db.connect()
    sql, args = 'SELECT * FROM ledger', []
    where = []
    if source:
        where.append('source=?'); args.append(source)
    if q:
        where.append('(actor LIKE ? OR action LIKE ? OR detail LIKE ?)'); args += [f'%{q}%'] * 3
    if where:
        sql += ' WHERE ' + ' AND '.join(where)
    rows = conn.execute(sql + ' ORDER BY id DESC LIMIT ?', args + [limit]).fetchall()
    conn.close()
    return rows
