"""Create a SYNTHETIC demo environment (no real data) under ./demo-data.

    python scripts/seed_demo.py [dir]
then:  python run_all.py --data demo-data
"""
import importlib.util, os, sqlite3, sys
from datetime import datetime, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'demo-data'))
os.makedirs(out, exist_ok=True)
os.environ['ITAM_DB_PATH'] = os.path.join(out, 'itam.db')
os.environ['CYBERSHIELD_DB_PATH'] = os.path.join(out, 'cybershield.db')
os.environ['HUB_DB_PATH'] = os.path.join(out, 'hub.db')


def load(name, rel):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, rel))
    m = importlib.util.module_from_spec(spec); sys.modules[name] = m; spec.loader.exec_module(m); return m


itam = load('itam_app', 'itam/app.py'); itam.init_db()
cs = load('cs_app', 'cybershield/app.py'); cs.init_db()
now = datetime.now()
people = [('Ama Mensah', 'Information Technology'), ('Kofi Boateng', 'Finance & Accounts'), ('Esi Owusu', 'Human Resources'),
          ('Yaw Darko', 'Production'), ('Abena Sarpong', 'Procurement'), ('Kwame Asante', 'Sales & Marketing'),
          ('Efua Quaye', 'Quality Assurance'), ('Nana Ofori', 'Warehouse & Logistics')]
i = sqlite3.connect(itam.DB_PATH)
for n, (p, dept) in enumerate(people, 1):
    for k, (typ, name) in enumerate([('Laptop', 'Dell Latitude 5440'), ('Phone', 'Samsung A54')][: 1 + n % 2]):
        i.execute("""INSERT OR IGNORE INTO assets (asset_tag,asset_name,asset_type,category,brand,serial_number,location,department,status,
                     assigned_to_name,warranty_expiry,purchase_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                  (f'DAS-{typ[:2].upper()}-{n:03d}{k}', name, typ, 'Hardware', name.split()[0],
                   '' if n == 4 and k == 0 else f'SN{n}{k}{typ[:2].upper()}', 'NIA — HQ', dept, 'Active — Assigned', p,
                   (now + timedelta(days=(-200 if n == 2 else 400))).strftime('%Y-%m-%d'), '2024-03-01'))
        i.execute("INSERT INTO movement_log (asset_tag,asset_name,action,to_user,performed_by) VALUES (?,?,?,?,?)",
                  (f'DAS-{typ[:2].upper()}-{n:03d}{k}', name, 'ASSIGN', p, 'it_manager'))
i.execute("INSERT OR IGNORE INTO assets (asset_tag,asset_name,asset_type,category,serial_number,location,status) VALUES ('DAS-LA-900','Spare laptop','Laptop','Hardware','SN900','Store','Active — Unassigned')")
i.execute("INSERT OR IGNORE INTO software (sw_tag,sw_name,total_seats,used_seats,expiry_date) VALUES ('SW-1','Microsoft 365',100,80,'2027-03-31')")
i.execute("INSERT OR IGNORE INTO software (sw_tag,sw_name,total_seats,used_seats,expiry_date) VALUES ('SW-2','Antivirus suite',60,60,'2026-05-01')")
i.commit(); i.close()
c = sqlite3.connect(cs.DB)
for n, (p, dept) in enumerate(people, 1):
    started = now - timedelta(days=40 - n * 3)
    done = started + timedelta(days=1, hours=2) if n not in (2, 4, 6) else None
    c.execute("""INSERT INTO trainees (name,employee_id,department,track,started_at,deadline_at,completed_at,score,cert_ref)
                 VALUES (?,?,?,?,?,?,?,?,?)""",
              (p, f'DEMO{n:04d}', dept, 'onboarding', started.isoformat(), (started + timedelta(days=5)).isoformat(),
               done.isoformat() if done else None, 70 + n * 3 if done else None, f'CERT-DEMO-{n}' if done else None))
c.commit(); c.close()
print('Demo data written to', out)
