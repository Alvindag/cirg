"""
DAS Plc ITAM v2 — Location Fix Script
======================================
Fixes asset location values in the ITAM database so the dashboard
shows correct counts for NIA — HQ and all other sites.

HOW TO RUN:
  1. Stop your ITAM server (close the run.bat window)
  2. Copy this file into your itam2 folder:
     C:\\Users\\Alvin\\Videos\\itam2\\fix_locations.py
  3. Open Command Prompt and run:
     cd C:\\Users\\Alvin\\Videos\\itam2
     python fix_locations.py
  4. Restart ITAM (double-click run.bat)
"""

import sqlite3
import os
import sys

# ── Find the database ─────────────────────────────────────────────────────────
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance', 'itam.db')

if not os.path.exists(DB_PATH):
    print(f"ERROR: Database not found at {DB_PATH}")
    print("Make sure this script is in your itam2 folder and the server has been run at least once.")
    input("\nPress Enter to exit...")
    sys.exit(1)

# ── Location fix mapping ──────────────────────────────────────────────────────
# Format: 'wrong value in DB' : 'correct ITAM value'
FIXES = {
    'NIA — Head Office':  'NIA — HQ',
    'NIA-HQ':             'NIA — HQ',
    'NIA':                'NIA — HQ',
    'Head Office':        'NIA — HQ',
    'TAMALE':             'TAMELE',
    'Tamale':             'TAMELE',
    'tamale':             'TAMELE',
    'TAKORADI':           'TAKRODI',
    'Takoradi':           'TAKRODI',
    'takoradi':           'TAKRODI',
    'Kumasi':             'KUMASI',
    'kumasi':             'KUMASI',
    'FA1':                'TA-F1',
    'fa1':                'TA-F1',
    'Factory 1':          'TA-F1',
    'FA2':                'TA-F2',
    'fa2':                'TA-F2',
    'Factory 2':          'TA-F2',
}

VALID = ['NIA — HQ', 'TA-F1', 'TA-F2', 'TAMELE', 'KUMASI', 'TAKRODI', 'Off-Site / Remote']

print("=" * 60)
print("  DAS Plc ITAM v2 — Location Fix")
print("=" * 60)
print(f"\nDatabase: {DB_PATH}")
print()

db = sqlite3.connect(DB_PATH)
db.row_factory = sqlite3.Row

# ── Show current state ────────────────────────────────────────────────────────
print("BEFORE FIX — Current location breakdown:")
rows = db.execute("SELECT location, COUNT(*) as cnt FROM assets GROUP BY location ORDER BY cnt DESC").fetchall()
total = 0
for r in rows:
    flag = "✓" if r['location'] in VALID else "✗ NEEDS FIX"
    print(f"  {flag:12s}  {r['cnt']:4d}  '{r['location']}'")
    total += r['cnt']
print(f"  {'TOTAL':12s}  {total:4d}")
print()

# ── Apply fixes ───────────────────────────────────────────────────────────────
total_fixed = 0
for wrong, correct in FIXES.items():
    count = db.execute("SELECT COUNT(*) FROM assets WHERE location=?", (wrong,)).fetchone()[0]
    if count > 0:
        db.execute("UPDATE assets SET location=? WHERE location=?", (correct, wrong))
        print(f"  Fixed {count:3d} assets:  '{wrong}'  →  '{correct}'")
        total_fixed += count

if total_fixed == 0:
    print("  No location fixes needed — all values are already correct.")
else:
    db.commit()
    print(f"\n  Total fixed: {total_fixed} assets")

# ── Show result ───────────────────────────────────────────────────────────────
print()
print("AFTER FIX — Location breakdown:")
rows = db.execute("SELECT location, COUNT(*) as cnt FROM assets GROUP BY location ORDER BY cnt DESC").fetchall()
total = 0
for r in rows:
    flag = "✓" if r['location'] in VALID else "✗ STILL WRONG"
    print(f"  {flag:12s}  {r['cnt']:4d}  '{r['location']}'")
    total += r['cnt']
print(f"  {'TOTAL':12s}  {total:4d}")

db.close()

print()
print("=" * 60)
print("  Done! Now restart your ITAM server (run.bat)")
print("  The NIA — HQ card should now show the correct count.")
print("=" * 60)
print()
input("Press Enter to close this window...")
