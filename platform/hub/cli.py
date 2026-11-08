"""Operational commands: python -m hub.cli {sync,verify,score,preflight,ad-check,create-user}"""
import sys
from hub import auth, controls, db, ledger


def preflight():
    """Read-only readiness report for a COPY of your real data. Writes nothing to ITAM or CyberShield."""
    from hub import connectors, directory, identity, integration, lifecycle
    a, t = connectors.asset_stats(), connectors.training_stats()
    ppl = connectors.people()
    rows, amb = identity.review()
    q = {}
    for p in ppl:
        q[p['quality']] = q.get(p['quality'], 0) + 1
    print('== DAS Trust Hub preflight (read-only) ==')
    print(f"ITAM        : {'connected, ' + str(a['live']) + ' live assets' if a['available'] else 'NOT FOUND'}")
    print(f"CyberShield : {'connected, ' + str(t['people']) + ' people with training records' if t['available'] else 'NOT FOUND'}")
    print(f"People      : {len(ppl)} total; matched by {q}")
    print(f"Identity    : {len(rows)} rely on a bare name; {len(amb)} name(s) shared by several employee IDs {list(amb)[:5]}")
    j = connectors.joiners()
    print(f"Joiners     : {len(j)} in ITAM onboarding; {sum(x['training'] == 'not_enrolled' for x in j)} not enrolled in training")
    print(f"Leavers     : {len(lifecycle.cases())} case(s) in the Hub")
    print(f"Automation  : INTEGRATION_TOKEN {'set' if integration.enabled() else 'NOT set (joiner/leaver automation off)'}")
    print(f"AD          : {'configured' if directory.configured() else 'not configured'}; mode {'DRY RUN' if directory.settings()['dry_run'] else 'LIVE'}")
    if integration.enabled():
        r = integration.run('preflight', dry_run=True)
        print(f"\nIf you ran the automation now it WOULD ({len(r['plan'])} action(s)):")
        for line in r['plan'][:25]:
            print('  -', line)
    print('\nNothing was changed.')
    return 0


def ad_check(args):
    """Read-only AD test: python -m hub.cli ad-check [employee_id_or_username]. Binds, searches, changes nothing."""
    from hub import directory
    if not directory.configured():
        print('AD is not configured: set AD_URL (ldaps://...), AD_BIND_DN, AD_BIND_PASSWORD, AD_BASE_DN.'); return 1
    s = directory.settings()
    print(f"Server {s['url']}  base {s['base_dn']}  mode {'DRY RUN' if s['dry_run'] else 'LIVE'}  auto-disable {s['auto']}")
    d = directory.default()
    try:
        d._factory().unbind()
        print('Bind OK (LDAPS, certificate verified).')
    except Exception as e:                                           # noqa: BLE001
        print('Bind FAILED:', type(e).__name__, e); return 2
    if args:
        found = d.find(employee_id=args[0], username=args[0])
        print(f'{len(found)} match(es) for {args[0]!r}:')
        for c in found:
            print(f"  {c['sam']:<18} {c['display']:<28} empID={c['employee_id'] or '-':<14} {'enabled' if c['enabled'] else 'DISABLED'}{'  PROTECTED' if c['protected'] else ''}")
    print('No changes were made.')
    return 0


def main(argv):
    db.init()
    cmd = argv[0] if argv else 'score'
    if cmd == 'sync':
        print(ledger.sync())
    elif cmd == 'verify':
        v = ledger.verify(); print(v)
        return 0 if v['ok'] else 2
    elif cmd == 'score':
        _, s = controls.evaluate(); print(s['overall'], s['rating'], s['counts'])
    elif cmd == 'preflight':
        return preflight()
    elif cmd == 'ad-check':
        return ad_check(argv[1:])
    elif cmd == 'create-user' and len(argv) >= 4:
        errs = auth.policy_errors(argv[2], argv[1])
        if errs:
            print('Weak password:', '; '.join(errs)); return 1
        auth.create_user(argv[1], argv[2], argv[3]); print('created')
    else:
        print(__doc__); return 1
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
