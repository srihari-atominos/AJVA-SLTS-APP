-- SLTS: bring an existing SQL Server database up to the current table shape.
--
-- The app applies exactly these changes itself at every start
-- (src/features/vehicles/dataSchema.js ADDED_COLUMNS + src/features/audit/schema.js),
-- so this file is only needed when the app's login is NOT allowed to ALTER
-- tables, or a start was skipped. Every statement is guarded, so it is safe
-- to run repeatedly. Run in SSMS against the SLTS database (e.g. "warranty").
--
-- Symptom when this is missing: an import fails with
--   "Invalid column name 'changedAt'"  (or changeType / prevTotTime / prodStart / rowsModified)
-- and the container log shows "[schema] MISSING COLUMNS: ...".

-- vehicles: production window parsed from regional (EU) extracts
IF COL_LENGTH('vehicles', 'prodStart') IS NULL ALTER TABLE vehicles ADD prodStart NVARCHAR(10) NULL;
IF COL_LENGTH('vehicles', 'prodEnd')   IS NULL ALTER TABLE vehicles ADD prodEnd   NVARCHAR(10) NULL;

-- laborops: per-entry "new / time modified" markers (7-day highlight window)
IF COL_LENGTH('laborops', 'changeType')  IS NULL ALTER TABLE laborops ADD changeType  NVARCHAR(10) NULL;
IF COL_LENGTH('laborops', 'prevTotTime') IS NULL ALTER TABLE laborops ADD prevTotTime FLOAT NULL;
IF COL_LENGTH('laborops', 'changedAt')   IS NULL ALTER TABLE laborops ADD changedAt   NVARCHAR(40) NULL;

-- audit_log: entries-modified count (table itself is created by the app on start)
IF OBJECT_ID('audit_log', 'U') IS NOT NULL AND COL_LENGTH('audit_log', 'rowsModified') IS NULL
  ALTER TABLE audit_log ADD rowsModified INT NOT NULL CONSTRAINT DF_audit_rowsModified DEFAULT 0;

-- Verify: every row should show a non-NULL length.
SELECT 'vehicles.prodStart'     AS col, COL_LENGTH('vehicles', 'prodStart')     AS len UNION ALL
SELECT 'vehicles.prodEnd',             COL_LENGTH('vehicles', 'prodEnd')               UNION ALL
SELECT 'laborops.changeType',          COL_LENGTH('laborops', 'changeType')            UNION ALL
SELECT 'laborops.prevTotTime',         COL_LENGTH('laborops', 'prevTotTime')           UNION ALL
SELECT 'laborops.changedAt',           COL_LENGTH('laborops', 'changedAt')             UNION ALL
SELECT 'audit_log.rowsModified',       COL_LENGTH('audit_log', 'rowsModified');
