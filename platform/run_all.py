"""Start ITAM (5057), CyberShield (5076) and the Hub (5080) together for local use.

    python run_all.py [--data DIR]       # DIR holds itam.db, cybershield.db, hub.db
Production: use docker-compose.yml (waitress, one container per service).
"""
import os, secrets, subprocess, sys, time

ROOT = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[1:]
data = os.path.abspath(args[args.index('--data') + 1]) if '--data' in args else None
env = dict(os.environ)
if data:
    os.makedirs(data, exist_ok=True)
    env.setdefault('ITAM_DB_PATH', os.path.join(data, 'itam.db'))
    env.setdefault('CYBERSHIELD_DB_PATH', os.path.join(data, 'cybershield.db'))
    env.setdefault('HUB_DB_PATH', os.path.join(data, 'hub.db'))
env.setdefault('SSO_SECRET', secrets.token_hex(32))     # shared by all three; regenerated each run
env.setdefault('HUB_AUTO_SYNC_SECONDS', '300')
boot = ("import importlib.util,sys,os;p=sys.argv[1];s=importlib.util.spec_from_file_location('a',p);m=importlib.util.module_from_spec(s);"
        "sys.modules['a']=m;s.loader.exec_module(m);m.init_db() if hasattr(m,'init_db') else None;"
        "from waitress import serve;serve(m.app,host='127.0.0.1',port=int(sys.argv[2]))")
procs = [subprocess.Popen([sys.executable, '-c', boot, os.path.join(ROOT, 'itam', 'app.py'), '5057'], env=env),
         subprocess.Popen([sys.executable, '-c', boot, os.path.join(ROOT, 'cybershield', 'app.py'), '5076'], env=env),
         subprocess.Popen([sys.executable, '-m', 'waitress', '--listen=127.0.0.1:5080', '--call', 'hub.wsgi:factory'], env=env, cwd=ROOT)]
print('Hub http://127.0.0.1:5080 | ITAM http://127.0.0.1:5057 | CyberShield http://127.0.0.1:5076  (Ctrl+C to stop)')
try:
    while all(p.poll() is None for p in procs):
        time.sleep(1)
finally:
    for p in procs:
        p.terminate()
