-- ══════════════════════════════════════════════════════════════════════════════
-- DAS Plc ITAM v2 — Location Fix Script
-- Run this in your ITAM database to fix any assets uploaded with wrong locations
-- 
-- HOW TO RUN:
--   1. Stop your ITAM server (close the run.bat window)
--   2. Open a command prompt and navigate to your itam2 folder:
--      cd C:\Users\Alvin\Videos\itam2
--   3. Run: sqlite3 instance\itam.db < fix_locations.sql
--   4. Restart your ITAM server
-- ══════════════════════════════════════════════════════════════════════════════

-- Show current wrong values (run this first to see what will be changed)
SELECT location, COUNT(*) as count 
FROM assets 
WHERE location NOT IN ('NIA — HQ','TA-F1','TA-F2','TAMELE','KUMASI','TAKRODI','Off-Site / Remote')
GROUP BY location;

-- Fix 1: 'NIA — Head Office' → 'NIA — HQ'
UPDATE assets SET location = 'NIA — HQ' WHERE location = 'NIA — Head Office';

-- Fix 2: 'TAMALE' → 'TAMELE'  (ITAM uses 'TAMELE' — matches the dropdown)
UPDATE assets SET location = 'TAMELE' WHERE location = 'TAMALE';

-- Fix 3: Any other variations
UPDATE assets SET location = 'NIA — HQ'   WHERE location IN ('NIA','NIA-HQ','NIA-HQ Accra','Head Office');
UPDATE assets SET location = 'TAKRODI'    WHERE location IN ('TAKORADI','Takoradi');
UPDATE assets SET location = 'KUMASI'     WHERE location IN ('Kumasi','kumasi');
UPDATE assets SET location = 'TAMELE'     WHERE location IN ('Tamale','tamale');
UPDATE assets SET location = 'TA-F1'      WHERE location IN ('FA1','fa1','Factory 1');
UPDATE assets SET location = 'TA-F2'      WHERE location IN ('FA2','fa2','Factory 2');

-- Confirm fix worked
SELECT location, COUNT(*) as count FROM assets GROUP BY location ORDER BY count DESC;

