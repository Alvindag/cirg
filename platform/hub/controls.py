"""Control catalogue mapped to ISO/IEC 27001:2022 Annex A, NIST CSF 2.0, CIS Controls v8
and Ghana law, evaluated from live ITAM / CyberShield / Hub evidence.

Automated controls compute pass / partial / fail from data. Manual controls need a signed
attestation with evidence and a review date; an unattested control scores zero, so the score
cannot be inflated by leaving things unassessed.

This is an evidence-based internal readiness assessment, not a certification or legal opinion.
"""
from datetime import date, datetime
from . import connectors, db, ledger, lifecycle

FRAMEWORKS = {
    'iso27001': 'ISO/IEC 27001:2022 Annex A',
    'nist_csf': 'NIST CSF 2.0',
    'cis': 'CIS Controls v8',
    'ghana': 'Ghana Act 843 / Act 1038',
}

PASS, PARTIAL, FAIL, NA, UNASSESSED = 'pass', 'partial', 'fail', 'na', 'unassessed'
POINTS = {PASS: 1.0, PARTIAL: 0.5, FAIL: 0.0, UNASSESSED: 0.0}


def _pct(part, whole):
    return round(100.0 * part / whole, 1) if whole else None


def _band(pct, ok=95, partial=80):
    if pct is None:
        return NA
    return PASS if pct >= ok else PARTIAL if pct >= partial else FAIL


def _res(status, metric, evidence, action=''):
    return {'status': status, 'metric': metric, 'evidence': evidence, 'action': action}


# ── Automated evaluators ────────────────────────────────────────────────────
def c_inventory(ctx):
    a = ctx['assets']
    if not a['available']:
        return _res(FAIL, 'ITAM unavailable', 'ITAM database not reachable.', 'Connect ITAM.')
    p = _pct(a['hardware'] - a['missing_serial'], a['hardware'])
    return _res(_band(p, 98, 90), f'{p}% of hardware assets have a serial number' if p is not None else 'no hardware',
                f"{a['live']} live assets; {a['missing_serial']} hardware assets lack a serial number.",
                'Record serial numbers for every hardware asset so it can be matched to purchase and discovery data.')


def c_ownership(ctx):
    a = ctx['assets']
    if not a['available']:
        return _res(FAIL, 'ITAM unavailable', '', 'Connect ITAM.')
    bad = a['assigned_no_owner'] + a['missing_location']
    p = _pct(a['live'] - bad, a['live'])
    return _res(_band(p, 98, 90), f'{p}% of live assets have an accountable owner/location' if p is not None else 'no assets',
                f"{a['assigned_no_owner']} assigned assets have no named holder; {a['missing_location']} have no location.",
                'Every asset needs a named owner or custodian and a location.')


def c_lifecycle(ctx):
    a = ctx['assets']
    if not a['available']:
        return _res(FAIL, 'ITAM unavailable', '', 'Connect ITAM.')
    p = _pct(a['warranty_dated'] - a['warranty_expired'], a['warranty_dated'])
    st = _band(p, 90, 70)
    return _res(st, f"{a['warranty_expired']} assets past warranty; {a['warranty_expiring']} expire within 30 days",
                f"{a['stale_repairs']} repairs open >30 days; {a['open_repairs']} open in total.",
                'Renew warranties or plan refresh for out-of-support equipment; close stale repairs.')


def c_software(ctx):
    a = ctx['assets']
    if not a['available']:
        return _res(FAIL, 'ITAM unavailable', '', 'Connect ITAM.')
    bad = a['software_expired'] + a['software_overused']
    if not a['software_total']:
        return _res(FAIL, 'No software register', 'No software records exist.', 'Register licensed software in ITAM.')
    return _res(PASS if bad == 0 else PARTIAL if bad <= 2 else FAIL,
                f"{a['software_expired']} expired, {a['software_overused']} over-allocated of {a['software_total']} titles",
                'Licence expiry and seat usage are tracked in the ITAM software register.',
                'Renew or retire expired licences and reconcile seat usage.')


def c_return(ctx):
    a = ctx['assets']
    if not a['available']:
        return _res(FAIL, 'ITAM unavailable', '', 'Connect ITAM.')
    n = a['in_use']
    p = _pct(a['assigned_with_movement'], n)
    return _res(_band(p, 95, 75) if n else NA, f'{p}% of assigned assets have a recorded movement history' if p is not None else 'no assigned assets',
                f"{a['movements']} movement records (assign/return/transfer) evidence custody changes.",
                'Issue and return assets only through ITAM so handover is recorded.')


def c_training_coverage(ctx):
    t = ctx['training']
    if not t['available']:
        return _res(FAIL, 'CyberShield unavailable', '', 'Connect CyberShield.')
    p = t['completion_pct']
    return _res(_band(p, 95, 80) if t['people'] else FAIL, f"{p}% of enrolled staff hold current security training" if p is not None else 'no trainees',
                f"{t['completed']} of {t['people']} complete; {t['in_progress']} in progress; {t['overdue']} overdue; {t['expired']} lapsed.",
                'Enrol all staff and chase overdue modules; repeat annually.')


def c_training_overdue(ctx):
    t = ctx['training']
    if not t['available']:
        return _res(FAIL, 'CyberShield unavailable', '', 'Connect CyberShield.')
    bad = t['overdue'] + t['expired']
    return _res(PASS if bad == 0 else PARTIAL if bad <= 2 else FAIL, f'{bad} overdue or lapsed',
                'Overdue and lapsed training is escalated by CyberShield and visible on the Hub exposure list.',
                'Clear overdue training; escalate repeat offenders to line managers.')


def c_training_quality(ctx):
    t = ctx['training']
    if not t['available'] or t['avg_score'] is None:
        return _res(UNASSESSED if t['available'] else FAIL, 'no scored results', 'No completed assessments yet.', 'Complete assessments to measure comprehension.')
    s = t['avg_score']
    return _res(PASS if s >= 80 else PARTIAL if s >= 70 else FAIL, f'average assessment score {s}%',
                'Quiz scores demonstrate comprehension, not just attendance.', 'Review weak questions and refresh lessons.')


def c_exposure(ctx):
    rows = ctx['people']
    holders = [p for p in rows if p['asset_count']]
    exposed = [p for p in holders if p['exposed']]
    if not holders:
        return _res(NA, 'no asset holders', '', '')
    p = _pct(len(holders) - len(exposed), len(holders))
    return _res(_band(p, 98, 85), f'{len(exposed)} of {len(holders)} asset holders lack current training',
                'Joint control: company equipment should only be held by staff who completed security awareness.',
                'Withhold or recall devices from holders until training is complete (see Exposure list).')


def c_identity(ctx):
    rows = ctx['people']
    if not rows:
        return _res(NA, 'no people', '', '')
    weak = [p for p in rows if p['quality'] in ('name', 'ambiguous')]
    amb = [p for p in rows if p['quality'] == 'ambiguous']
    p = _pct(len(rows) - len(weak), len(rows))
    return _res(_band(p, 95, 80) if not amb else FAIL, f"{p}% of people matched by employee ID or username; {len(weak)} rely on a name ({len(amb)} ambiguous)",
                'Exact identity matters when a name is shared, and before any account is disabled.',
                'Capture employee IDs in ITAM onboarding and asset assignment; settle legacy names on the Identity page.')


def c_ledger(ctx):
    v = ctx['ledger']
    if v['entries'] == 0:
        return _res(UNASSESSED, 'ledger empty', 'No events sealed yet.', 'Run a sync to seal ITAM and CyberShield audit trails.')
    return _res(PASS if v['ok'] else FAIL, f"{v['entries']} events; chain {'intact' if v['ok'] else 'BROKEN'}",
                '; '.join(v['problems'][:3]) or 'Hash chain and source-log cross-check verified.',
                'Investigate tampering immediately and preserve the evidence.' if not v['ok'] else '')


def c_mfa(ctx):
    users = [u for u in ctx['hub_users'] if u['is_active'] and u['role'] in ('admin', 'it_manager', 'auditor')]
    if not users:
        return _res(FAIL, 'no privileged users', '', 'Create named administrator accounts.')
    n = sum(1 for u in users if u['mfa_enabled'])
    return _res(PASS if n == len(users) else PARTIAL if n else FAIL, f'{n} of {len(users)} privileged Hub users use MFA',
                'Privileged Hub access (which can launch ITAM/CyberShield admin) should require a second factor.',
                'Enrol every privileged user in TOTP on the Account page.')


def c_default_creds(ctx):
    i, c = ctx['itam_hygiene'], ctx['cs_hygiene']
    found = (i['default_password'] if i else []) + (c['default_password'] if c else [])
    if i is None and c is None:
        return _res(FAIL, 'systems unavailable', '', '')
    return _res(PASS if not found else FAIL, f"{len(found)} accounts still use a shipped default password" if found else 'no default passwords in use',
                ('Accounts: ' + ', '.join(found)) if found else 'Checked ITAM users and the CyberShield admin against shipped defaults.',
                'Change every default password now; the defaults are published in the source and run scripts.')


def c_dormant(ctx):
    i = ctx['itam_hygiene']
    if i is None:
        return _res(FAIL, 'ITAM unavailable', '', '')
    n = len(i['dormant'])
    p = _pct(i['total'] - n, i['total'])
    return _res(_band(p, 90, 70), f"{n} of {i['total']} ITAM accounts dormant (>90 days or never used)",
                'Dormant accounts widen the attack surface.', 'Disable accounts unused for 90 days.')


def c_privileged(ctx):
    i = ctx['itam_hygiene']
    if i is None:
        return _res(FAIL, 'ITAM unavailable', '', '')
    return _res(PASS if i['admins'] <= 2 else PARTIAL, f"{i['admins']} ITAM administrators",
                'Least privilege: keep administrator accounts to the minimum needed.', 'Reduce administrators; use it_manager/it_staff roles.')


def c_joiners(ctx):
    due = [j for j in ctx['joiners'] if j['days_since_start'] is not None and j['days_since_start'] > 7]
    if not due:
        return _res(NA, 'no joiners past 7 days', 'No new starters are due for training yet.', '')
    late = [j for j in due if j['late']]
    p = _pct(len(due) - len(late), len(due))
    return _res(_band(p, 95, 80), f'{len(late)} of {len(due)} joiners not enrolled in security training within 7 days',
                ('Not enrolled: ' + ', '.join(j['name'] for j in late[:5])) if late else 'Every joiner is enrolled in CyberShield.',
                'Enrol each joiner in CyberShield on their first day.')


def c_leavers(ctx):
    cs = [c for c in ctx['leavers'] if c['status'] == 'open']
    closed = [c for c in ctx['leavers'] if c['status'] == 'closed']
    if not ctx['leavers']:
        return _res(UNASSESSED, 'no leaver cases recorded', 'Either nobody has left, or leavers are not being run through the Hub.', 'Raise a leaver case for every departure.')
    risky = [c for c in cs if c['at_risk']]
    held = sum(len(c['assets_held'] or []) for c in cs if c['past_last_day'])
    if risky:
        return _res(FAIL, f'{len(risky)} leaver(s) past their last day with assets or steps outstanding ({held} assets)',
                    'Leavers: ' + ', '.join(c['ref'] for c in risky[:5]), 'Recover assets and disable access immediately.')
    late = sum(c['overdue_steps'] for c in cs)
    return _res(PASS if not late else PARTIAL, f'{len(closed)} closed, {len(cs)} open; {late} overdue steps',
                'Leaver cases track asset return and access removal to completion.', 'Clear overdue leaver steps.' if late else '')


# ── Catalogue ───────────────────────────────────────────────────────────────
# (id, title, weight, evaluator, mappings)
AUTO = [
    ('AC-01', 'Hardware asset inventory is complete and identifiable', 3, c_inventory,
     {'iso27001': ['A.5.9'], 'nist_csf': ['ID.AM-01'], 'cis': ['1.1']}),
    ('AC-02', 'Every asset has an accountable owner and location', 3, c_ownership,
     {'iso27001': ['A.5.9', 'A.5.10'], 'nist_csf': ['ID.AM-08'], 'cis': ['1.1']}),
    ('AC-03', 'Equipment is maintained and supported through its lifecycle', 2, c_lifecycle,
     {'iso27001': ['A.7.13', 'A.8.1'], 'nist_csf': ['ID.AM-08'], 'cis': ['1.1']}),
    ('AC-04', 'Software and licences are inventoried and in date', 2, c_software,
     {'iso27001': ['A.5.9', 'A.5.32'], 'nist_csf': ['ID.AM-02'], 'cis': ['2.1', '2.2']}),
    ('AC-05', 'Asset custody changes (issue / return) are traceable', 2, c_return,
     {'iso27001': ['A.5.11'], 'nist_csf': ['ID.AM-08'], 'cis': ['1.1']}),
    ('AC-06', 'Staff hold current security awareness training', 3, c_training_coverage,
     {'iso27001': ['A.6.3'], 'nist_csf': ['PR.AT-01'], 'cis': ['14.1'], 'ghana': ['Act 843 – security safeguards']}),
    ('AC-07', 'Overdue or lapsed training is eliminated', 2, c_training_overdue,
     {'iso27001': ['A.6.3'], 'nist_csf': ['PR.AT-01', 'PR.AT-02'], 'cis': ['14.1']}),
    ('AC-08', 'Training is effective (assessment performance)', 1, c_training_quality,
     {'iso27001': ['A.6.3'], 'nist_csf': ['PR.AT-01'], 'cis': ['14.2']}),
    ('AC-09', 'Asset holders are trained (joint ITAM × CyberShield)', 3, c_exposure,
     {'iso27001': ['A.6.3', 'A.5.10', 'A.8.1'], 'nist_csf': ['PR.AT-01', 'GV.RR-04'], 'cis': ['14.1']}),
    ('AC-17', 'People are matched across systems by a reliable identifier', 2, c_identity,
     {'iso27001': ['A.5.16'], 'nist_csf': ['PR.AA-01'], 'cis': ['5.1']}),
    ('AC-10', 'Audit trails are complete and tamper-evident', 3, c_ledger,
     {'iso27001': ['A.8.15', 'A.5.28'], 'nist_csf': ['DE.CM-09', 'PR.PS-04'], 'cis': ['8.2', '8.9'], 'ghana': ['Act 1038 – evidence preservation']}),
    ('AC-11', 'Privileged access uses multi-factor authentication', 3, c_mfa,
     {'iso27001': ['A.8.5'], 'nist_csf': ['PR.AA-03'], 'cis': ['6.5']}),
    ('AC-12', 'No default credentials remain in use', 3, c_default_creds,
     {'iso27001': ['A.5.17', 'A.8.5'], 'nist_csf': ['PR.AA-01'], 'cis': ['4.7', '5.2']}),
    ('AC-13', 'Dormant accounts are disabled', 2, c_dormant,
     {'iso27001': ['A.5.18'], 'nist_csf': ['PR.AA-05'], 'cis': ['5.3']}),
    ('AC-15', 'New joiners are enrolled in security training promptly', 2, c_joiners,
     {'iso27001': ['A.6.1', 'A.6.3'], 'nist_csf': ['PR.AT-01', 'GV.RR-04'], 'cis': ['14.1', '6.1']}),
    ('AC-16', 'Leavers: assets returned and access removed on time', 3, c_leavers,
     {'iso27001': ['A.6.5', 'A.5.11', 'A.5.18'], 'nist_csf': ['PR.AA-05', 'ID.AM-08'], 'cis': ['6.2', '5.3']}),
    ('AC-14', 'Administrator accounts are minimised (least privilege)', 1, c_privileged,
     {'iso27001': ['A.8.2'], 'nist_csf': ['PR.AA-05'], 'cis': ['5.4', '6.8']}),
]

# Manual controls: need a signed attestation with evidence (policy, test record, register, etc.).
MANUAL = [
    ('MC-01', 'Information security policy approved, communicated, reviewed annually', 2,
     {'iso27001': ['A.5.1'], 'nist_csf': ['GV.PO-01'], 'cis': ['14.1']}),
    ('MC-02', 'Documented incident response plan tested at least annually (link CIRG reports)', 3,
     {'iso27001': ['A.5.24', 'A.5.26'], 'nist_csf': ['RS.MA-01', 'RC.RP-01'], 'cis': ['17.1', '17.4'],
      'ghana': ['Act 1038 – incident reporting to CSA']}),
    ('MC-03', 'Information risk assessment performed and risk register maintained', 3,
     {'iso27001': ['6.1.2', 'A.5.7'], 'nist_csf': ['ID.RA-05', 'GV.RM-01'], 'cis': ['—']}),
    ('MC-04', 'Backups taken and restoration tested (ITAM, CyberShield, Hub databases)', 3,
     {'iso27001': ['A.8.13'], 'nist_csf': ['PR.DS-11'], 'cis': ['11.1', '11.5']}),
    ('MC-05', 'Personal data inventory and lawful-processing register (staff and trainee data)', 2,
     {'iso27001': ['A.5.34'], 'nist_csf': ['GV.OC-03'], 'cis': ['3.2'], 'ghana': ['Act 843 – processing principles, registration with the Data Protection Commission']}),
    ('MC-06', 'Breach notification procedure to regulator and data subjects', 2,
     {'iso27001': ['A.5.5', 'A.5.26'], 'nist_csf': ['RS.CO-02'], 'cis': ['17.2'], 'ghana': ['Act 843 – security compromise notification', 'Act 1038']}),
    ('MC-07', 'Secure disposal / re-use of retired equipment with data sanitisation records', 2,
     {'iso27001': ['A.7.14', 'A.8.10'], 'nist_csf': ['PR.DS-03'], 'cis': ['3.5']}),
    ('MC-08', 'Supplier / vendor security assessed (warranty, repair and cloud vendors)', 1,
     {'iso27001': ['A.5.19', 'A.5.20'], 'nist_csf': ['GV.SC-06'], 'cis': ['15.1']}),
    ('MC-09', 'Vulnerability and patch management on managed endpoints', 3,
     {'iso27001': ['A.8.8'], 'nist_csf': ['ID.RA-01', 'PR.PS-02'], 'cis': ['7.1', '7.3']}),
    ('MC-10', 'Network and email security (TLS, SPF/DKIM/DMARC, filtering) verified', 2,
     {'iso27001': ['A.8.20', 'A.8.21'], 'nist_csf': ['PR.IR-01'], 'cis': ['9.2', '12.1']}),
    ('MC-11', 'Management review and internal audit of the ISMS completed in the last 12 months', 2,
     {'iso27001': ['9.2', '9.3'], 'nist_csf': ['GV.OV-01'], 'cis': ['—']}),
    ('MC-12', 'Legal and regulatory register maintained (Acts 843 and 1038, CSA directives)', 1,
     {'iso27001': ['A.5.31'], 'nist_csf': ['GV.OC-03'], 'cis': ['—'], 'ghana': ['Acts 843 and 1038']}),
]


def attestations():
    conn = db.connect()
    rows = {r['control_id']: dict(r) for r in conn.execute('SELECT * FROM attestations')}
    conn.close()
    return rows


def _manual_result(att):
    if not att:
        return _res(UNASSESSED, 'not attested', 'No attestation recorded.', 'Assign an owner and record evidence.')
    if att['status'] == 'not_applicable':
        return _res(NA, 'not applicable', att.get('evidence') or '', '')
    overdue = bool(att.get('review_due')) and att['review_due'] < date.today().isoformat()
    if not (att.get('evidence') or '').strip():
        return _res(UNASSESSED, 'no evidence recorded', 'An attestation without evidence does not count.', 'Add evidence.')
    if overdue:
        return _res(PARTIAL if att['status'] == 'implemented' else FAIL, f"review overdue since {att['review_due']}",
                    att['evidence'], 'Re-attest: the evidence is out of date.')
    st = {'implemented': PASS, 'partial': PARTIAL, 'not_implemented': FAIL}[att['status']]
    return _res(st, att['status'].replace('_', ' '), att['evidence'], '' if st == PASS else 'Complete the implementation.')


def context():
    conn = db.connect()
    hub_users = [dict(r) for r in conn.execute('SELECT * FROM users')]
    conn.close()
    return {'assets': connectors.asset_stats(), 'training': connectors.training_stats(),
            'people': connectors.people(), 'ledger': ledger.verify(), 'hub_users': hub_users,
            'joiners': connectors.joiners(), 'leavers': lifecycle.cases(),
            'itam_hygiene': connectors.itam_account_hygiene(), 'cs_hygiene': connectors.cs_account_hygiene()}


def evaluate(ctx=None):
    ctx = ctx or context()
    att = attestations()
    items = []
    for cid, title, w, fn, maps in AUTO:
        items.append({'id': cid, 'title': title, 'weight': w, 'kind': 'automated', 'maps': maps, **fn(ctx)})
    for cid, title, w, maps in MANUAL:
        a = att.get(cid)
        items.append({'id': cid, 'title': title, 'weight': w, 'kind': 'manual', 'maps': maps,
                      'attestation': a, **_manual_result(a)})
    return items, summarise(items)


def summarise(items):
    def score(subset):
        scored = [i for i in subset if i['status'] != NA]
        tot = sum(i['weight'] for i in scored)
        got = sum(i['weight'] * POINTS[i['status']] for i in scored)
        return round(100 * got / tot, 1) if tot else None
    by_fw = {}
    for key, label in FRAMEWORKS.items():
        sub = [i for i in items if i['maps'].get(key)]
        by_fw[key] = {'label': label, 'score': score(sub), 'controls': len(sub),
                      'passing': sum(i['status'] == PASS for i in sub)}
    overall = score(items)
    auto, man = [i for i in items if i['kind'] == 'automated'], [i for i in items if i['kind'] == 'manual']
    counts = {s: sum(i['status'] == s for i in items) for s in (PASS, PARTIAL, FAIL, UNASSESSED, NA)}
    return {'overall': overall, 'rating': rating(overall), 'automated': score(auto), 'manual': score(man),
            'frameworks': by_fw, 'counts': counts, 'total': len(items)}


def rating(s):
    if s is None:
        return 'Not assessed'
    return ('Managed' if s >= 85 else 'Defined' if s >= 70 else 'Developing' if s >= 45 else 'Initial')


def gaps(items):
    """Remediation backlog ordered by weight x shortfall."""
    out = [i for i in items if i['status'] in (FAIL, PARTIAL, UNASSESSED)]
    out.sort(key=lambda i: (-(i['weight'] * (1 - POINTS[i['status']])), i['id']))
    return out


def snapshot(summary):
    conn = db.connect()
    conn.execute('INSERT INTO score_history (score, detail) VALUES (?,?)',
                 (summary['overall'] or 0, f"auto={summary['automated']} manual={summary['manual']}"))
    conn.commit(); conn.close()


def history(limit=30):
    conn = db.connect()
    rows = conn.execute('SELECT taken_at, score FROM score_history ORDER BY id DESC LIMIT ?', (limit,)).fetchall()
    conn.close()
    return list(reversed(rows))
