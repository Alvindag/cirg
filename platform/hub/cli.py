"""Operational commands: python -m hub.cli {sync,verify,score,create-user}"""
import sys
from hub import auth, controls, db, ledger


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
