-- Backfill market / model year / production window for the European (EU) extracts
-- loaded before vehicleMeta.js existed (their header says GSA=ALL, MODYR=ALL).
-- Generated 2026-10-18 from the 78 files in the EUEN folder with
-- src/features/vehicles/vehicleMeta.js — the same rules every upload now applies.
-- Equivalent to: npm run backfill:vehicle-meta -- --apply   (which reads the DB instead).
-- T-SQL (Microsoft SQL Server). Review, then run against the SLTS database in one go.
-- vehKey is never changed: it is the upsert key the app matches re-uploads on.

-- Vehicles whose description carries no model year (year derived from the production window, or left NULL):
--   EU-ALL-ALL-34 (EUEN_Bronco.xml): modYear: no model year or production window in "Bronco" — left blank
--   EU-ALL-ALL-30 (EUEN_Capri_CX-740L.xml): modYear: no model year or production window in "Capri CX-740L" — left blank
--   EU-ALL-ALL-29 (EUEN_Explorer_CX-740S.xml): modYear: no model year or production window in "Explorer CX-740S" — left blank
--   EU-ALL-ALL-33 (EUEN_F150.xml): modYear: no model year or production window in "F150" — left blank
--   EU-ALL-ALL-92 (EUEN_Focus_Electric_10_2012.xml): modYear: no model year in "Focus Electric (10/2012-)" — using production start year 2012
--   EU-ALL-ALL-93 (EUEN_Mustang_Mach-E.xml): modYear: no model year or production window in "Mustang Mach-E" — left blank
--   EU-ALL-ALL-01 (EUEN_Test.xml): modYear: no model year or production window in "Test" — left blank
--   EU-ALL-ALL-89 (EUEN_Transit_City.xml): modYear: no model year or production window in "Transit City" — left blank
--   EU-ALL-ALL-88 (EUEN_Transit_Elektric.xml): modYear: no model year or production window in "Transit Elektric" — left blank
--   EU-ALL-ALL-95 (EUEN_Transit_Tourneo_Courier_10_2023.xml): modYear: no model year in "Transit/Tourneo Courier (10/2023-)" — using production start year 2023
--   EU-ALL-ALL-51 (EUEN_Windstar_10_1994-07_2000.xml): modYear: no model year in "Windstar (10/1994-07/2000)" — using production start year 1994

BEGIN TRANSACTION;

-- 1. Columns added by this release (no-op if the app has already started once on the new build).
IF COL_LENGTH('vehicles', 'prodStart') IS NULL ALTER TABLE vehicles ADD prodStart NVARCHAR(10) NULL;
IF COL_LENGTH('vehicles', 'prodEnd')   IS NULL ALTER TABLE vehicles ADD prodEnd   NVARCHAR(10) NULL;

-- 2. Per-vehicle values derived from VEHDESC.
-- B-MAX 2012.75 (01/2012-)  [EUEN_B-MAX_2012_75_01_2012.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2012.75', prodStart = '2012-01', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-10';
UPDATE laborops SET gsa = 'EU', modYear = '2012.75' WHERE vehKey = 'EU-ALL-ALL-10';
-- Bronco  [EUEN_Bronco.xml]
UPDATE vehicles SET gsa = 'EU', modYear = NULL, prodStart = NULL, prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-34';
UPDATE laborops SET gsa = 'EU', modYear = NULL WHERE vehKey = 'EU-ALL-ALL-34';
-- C-MAX 2003.75 (06/2003-)  [EUEN_C-MAX_2003_75_06_2003.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2003.75', prodStart = '2003-06', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-22';
UPDATE laborops SET gsa = 'EU', modYear = '2003.75' WHERE vehKey = 'EU-ALL-ALL-22';
-- C-MAX 2010.75 (07/2010-)  [EUEN_C-MAX_2010_75_07_2010.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2010.75', prodStart = '2010-07', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-24';
UPDATE laborops SET gsa = 'EU', modYear = '2010.75' WHERE vehKey = 'EU-ALL-ALL-24';
-- C-MAX 2015.5 (03.2015-)  [EUEN_C-MAX_2015_5_03_2015.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2015.5', prodStart = '2015-03', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-18';
UPDATE laborops SET gsa = 'EU', modYear = '2015.5' WHERE vehKey = 'EU-ALL-ALL-18';
-- Capri CX-740L  [EUEN_Capri_CX-740L.xml]
UPDATE vehicles SET gsa = 'EU', modYear = NULL, prodStart = NULL, prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-30';
UPDATE laborops SET gsa = 'EU', modYear = NULL WHERE vehKey = 'EU-ALL-ALL-30';
-- Cougar 1999 (08/1998-01/2001)  [EUEN_Cougar_1999_08_1998-01_2001.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '1999', prodStart = '1998-08', prodEnd = '2001-01' WHERE vehKey = 'EU-ALL-ALL-55';
UPDATE laborops SET gsa = 'EU', modYear = '1999' WHERE vehKey = 'EU-ALL-ALL-55';
-- EcoSport 2012.75 (05/2012-)  [EUEN_EcoSport_2012_75_05_2012.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2012.75', prodStart = '2012-05', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-12';
UPDATE laborops SET gsa = 'EU', modYear = '2012.75' WHERE vehKey = 'EU-ALL-ALL-12';
-- Edge 2016 (08/2015-)  [EUEN_Edge_2016_08_2015.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2016', prodStart = '2015-08', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-32';
UPDATE laborops SET gsa = 'EU', modYear = '2016' WHERE vehKey = 'EU-ALL-ALL-32';
-- Escort 1995 (02/1995-09/2001)  [EUEN_Escort_1995_02_1995-09_2001.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '1995', prodStart = '1995-02', prodEnd = '2001-09' WHERE vehKey = 'EU-ALL-ALL-17';
UPDATE laborops SET gsa = 'EU', modYear = '1995' WHERE vehKey = 'EU-ALL-ALL-17';
-- Explorer 1995 (08/1994-09/2000)  [EUEN_Explorer_1995_08_1994-09_2000.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '1995', prodStart = '1994-08', prodEnd = '2000-09' WHERE vehKey = 'EU-ALL-ALL-61';
UPDATE laborops SET gsa = 'EU', modYear = '1995' WHERE vehKey = 'EU-ALL-ALL-61';
-- Explorer 2011 (04/2011-)  [EUEN_Explorer_2011_04_2011.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2011', prodStart = '2011-04', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-62';
UPDATE laborops SET gsa = 'EU', modYear = '2011' WHERE vehKey = 'EU-ALL-ALL-62';
-- Explorer 2020 (03/2019-)  [EUEN_Explorer_2020_03_2019.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2020', prodStart = '2019-03', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-71';
UPDATE laborops SET gsa = 'EU', modYear = '2020' WHERE vehKey = 'EU-ALL-ALL-71';
-- Explorer CX-740S  [EUEN_Explorer_CX-740S.xml]
UPDATE vehicles SET gsa = 'EU', modYear = NULL, prodStart = NULL, prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-29';
UPDATE laborops SET gsa = 'EU', modYear = NULL WHERE vehKey = 'EU-ALL-ALL-29';
-- F150  [EUEN_F150.xml]
UPDATE vehicles SET gsa = 'EU', modYear = NULL, prodStart = NULL, prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-33';
UPDATE laborops SET gsa = 'EU', modYear = NULL WHERE vehKey = 'EU-ALL-ALL-33';
-- Fiesta 1989 (03/1989-09/1996)  [EUEN_Fiesta_1989_03_1989-09_1996.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '1989', prodStart = '1989-03', prodEnd = '1996-09' WHERE vehKey = 'EU-ALL-ALL-03';
UPDATE laborops SET gsa = 'EU', modYear = '1989' WHERE vehKey = 'EU-ALL-ALL-03';
-- Fiesta 1996 (08/1995-02/2002)  [EUEN_Fiesta_1996_08_1995-02_2002.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '1996', prodStart = '1995-08', prodEnd = '2002-02' WHERE vehKey = 'EU-ALL-ALL-04';
UPDATE laborops SET gsa = 'EU', modYear = '1996' WHERE vehKey = 'EU-ALL-ALL-04';
-- Fiesta 2002.25 (11/2001-)  [EUEN_Fiesta_2002_25_11_2001.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2002.25', prodStart = '2001-11', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-05';
UPDATE laborops SET gsa = 'EU', modYear = '2002.25' WHERE vehKey = 'EU-ALL-ALL-05';
-- Fiesta 2008.75 (07/2008-)  [EUEN_Fiesta_2008_75_07_2008.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2008.75', prodStart = '2008-07', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-06';
UPDATE laborops SET gsa = 'EU', modYear = '2008.75' WHERE vehKey = 'EU-ALL-ALL-06';
-- Fiesta 2013 (05/2012-)  [EUEN_Fiesta_2013_05_2012.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2013', prodStart = '2012-05', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-11';
UPDATE laborops SET gsa = 'EU', modYear = '2013' WHERE vehKey = 'EU-ALL-ALL-11';
-- Fiesta 2017 (05.2017-)  [EUEN_Fiesta_2017_05_2017.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2017', prodStart = '2017-05', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-13';
UPDATE laborops SET gsa = 'EU', modYear = '2017' WHERE vehKey = 'EU-ALL-ALL-13';
-- Focus 1999 (08/1998-12/2004)  [EUEN_Focus_1999_08_1998-12_2004.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '1999', prodStart = '1998-08', prodEnd = '2004-12' WHERE vehKey = 'EU-ALL-ALL-19';
UPDATE laborops SET gsa = 'EU', modYear = '1999' WHERE vehKey = 'EU-ALL-ALL-19';
-- Focus 2004.75 (07/2004-)  [EUEN_Focus_2004_75_07_2004.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2004.75', prodStart = '2004-07', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-23';
UPDATE laborops SET gsa = 'EU', modYear = '2004.75' WHERE vehKey = 'EU-ALL-ALL-23';
-- Focus 2011.25 (01/2011-)  [EUEN_Focus_2011_25_01_2011.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2011.25', prodStart = '2011-01', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-25';
UPDATE laborops SET gsa = 'EU', modYear = '2011.25' WHERE vehKey = 'EU-ALL-ALL-25';
-- Focus 2015 (05/2014-)  [EUEN_Focus_2015_05_2014.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2015', prodStart = '2014-05', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-20';
UPDATE laborops SET gsa = 'EU', modYear = '2015' WHERE vehKey = 'EU-ALL-ALL-20';
-- Focus 2019 (01/2018-)  [EUEN_Focus_2019_01_2018.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2019', prodStart = '2018-01', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-15';
UPDATE laborops SET gsa = 'EU', modYear = '2019' WHERE vehKey = 'EU-ALL-ALL-15';
-- Focus Electric (10/2012-)  [EUEN_Focus_Electric_10_2012.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2012', prodStart = '2012-10', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-92';
UPDATE laborops SET gsa = 'EU', modYear = '2012' WHERE vehKey = 'EU-ALL-ALL-92';
-- Fusion 2002.75 (06/2002-)  [EUEN_Fusion_2002_75_06_2002.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2002.75', prodStart = '2002-06', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-09';
UPDATE laborops SET gsa = 'EU', modYear = '2002.75' WHERE vehKey = 'EU-ALL-ALL-09';
-- Galaxy 1995 (02/1995-03/2000)  [EUEN_Galaxy_1995_02_1995-03_2000.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '1995', prodStart = '1995-02', prodEnd = '2000-03' WHERE vehKey = 'EU-ALL-ALL-50';
UPDATE laborops SET gsa = 'EU', modYear = '1995' WHERE vehKey = 'EU-ALL-ALL-50';
-- Galaxy 2000.75 (04/2000-02/2006)  [EUEN_Galaxy_2000_75_04_2000-02_2006.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2000.75', prodStart = '2000-04', prodEnd = '2006-02' WHERE vehKey = 'EU-ALL-ALL-52';
UPDATE laborops SET gsa = 'EU', modYear = '2000.75' WHERE vehKey = 'EU-ALL-ALL-52';
-- Galaxy 2006.5 (04/2006-)  [EUEN_Galaxy_2006_5_04_2006.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2006.5', prodStart = '2006-04', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-54';
UPDATE laborops SET gsa = 'EU', modYear = '2006.5' WHERE vehKey = 'EU-ALL-ALL-54';
-- Galaxy 2015.5 (01/2015-)  [EUEN_Galaxy_2015_5_01_2015.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2015.5', prodStart = '2015-01', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-64';
UPDATE laborops SET gsa = 'EU', modYear = '2015.5' WHERE vehKey = 'EU-ALL-ALL-64';
-- Ikon 1999 (01/2000-)  [EUEN_Ikon_1999_01_2000.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '1999', prodStart = '2000-01', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-90';
UPDATE laborops SET gsa = 'EU', modYear = '1999' WHERE vehKey = 'EU-ALL-ALL-90';
-- Ikon 2006 (10/2005-)  [EUEN_Ikon_2006_10_2005.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2006', prodStart = '2005-10', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-91';
UPDATE laborops SET gsa = 'EU', modYear = '2006' WHERE vehKey = 'EU-ALL-ALL-91';
-- Ka 1997 (09/1996-07/2008)  [EUEN_Ka_1997_09_1996-07_2008.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '1997', prodStart = '1996-09', prodEnd = '2008-07' WHERE vehKey = 'EU-ALL-ALL-07';
UPDATE laborops SET gsa = 'EU', modYear = '1997' WHERE vehKey = 'EU-ALL-ALL-07';
-- Ka 2009 (08/2008-)  [EUEN_Ka_2009_08_2008.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2009', prodStart = '2008-08', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-08';
UPDATE laborops SET gsa = 'EU', modYear = '2009' WHERE vehKey = 'EU-ALL-ALL-08';
-- Ka 2016.5 (04/2016-)  [EUEN_Ka_2016_5_04_2016.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2016.5', prodStart = '2016-04', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-02';
UPDATE laborops SET gsa = 'EU', modYear = '2016.5' WHERE vehKey = 'EU-ALL-ALL-02';
-- Kuga 2008.5 (02/2008-)  [EUEN_Kuga_2008_5_02_2008.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2008.5', prodStart = '2008-02', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-46';
UPDATE laborops SET gsa = 'EU', modYear = '2008.5' WHERE vehKey = 'EU-ALL-ALL-46';
-- Kuga 2013.25 (10/2012-)  [EUEN_Kuga_2013_25_10_2012.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2013.25', prodStart = '2012-10', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-47';
UPDATE laborops SET gsa = 'EU', modYear = '2013.25' WHERE vehKey = 'EU-ALL-ALL-47';
-- Kuga 2020 (07/2019-)  [EUEN_Kuga_2020_07_2019.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2020', prodStart = '2019-07', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-48';
UPDATE laborops SET gsa = 'EU', modYear = '2020' WHERE vehKey = 'EU-ALL-ALL-48';
-- Maverick 2001 (12/2000-)  [EUEN_Maverick_2001_12_2000.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2001', prodStart = '2000-12', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-66';
UPDATE laborops SET gsa = 'EU', modYear = '2001' WHERE vehKey = 'EU-ALL-ALL-66';
-- Mondeo 1993 (01/1993-07/1996)  [EUEN_Mondeo_1993_01_1993-07_1996.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '1993', prodStart = '1993-01', prodEnd = '1996-07' WHERE vehKey = 'EU-ALL-ALL-35';
UPDATE laborops SET gsa = 'EU', modYear = '1993' WHERE vehKey = 'EU-ALL-ALL-35';
-- Mondeo 1997 (08/1996-09/2000)  [EUEN_Mondeo_1997_08_1996-09_2000.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '1997', prodStart = '1996-08', prodEnd = '2000-09' WHERE vehKey = 'EU-ALL-ALL-36';
UPDATE laborops SET gsa = 'EU', modYear = '1997' WHERE vehKey = 'EU-ALL-ALL-36';
-- Mondeo 2001 (10/2000-02/2007)  [EUEN_Mondeo_2001_10_2000-02_2007.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2001', prodStart = '2000-10', prodEnd = '2007-02' WHERE vehKey = 'EU-ALL-ALL-38';
UPDATE laborops SET gsa = 'EU', modYear = '2001' WHERE vehKey = 'EU-ALL-ALL-38';
-- Mondeo 2007.5 (02/2007-)  [EUEN_Mondeo_2007_5_02_2007.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2007.5', prodStart = '2007-02', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-39';
UPDATE laborops SET gsa = 'EU', modYear = '2007.5' WHERE vehKey = 'EU-ALL-ALL-39';
-- Mondeo 2014.75 (03/2014-)  [EUEN_Mondeo_2014_75_03_2014.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2014.75', prodStart = '2014-03', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-40';
UPDATE laborops SET gsa = 'EU', modYear = '2014.75' WHERE vehKey = 'EU-ALL-ALL-40';
-- Mustang 2015 (02.2014-)  [EUEN_Mustang_2015_02_2014.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2015', prodStart = '2014-02', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-56';
UPDATE laborops SET gsa = 'EU', modYear = '2015' WHERE vehKey = 'EU-ALL-ALL-56';
-- Mustang 2024  [EUEN_Mustang_2024.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2024', prodStart = NULL, prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-60';
UPDATE laborops SET gsa = 'EU', modYear = '2024' WHERE vehKey = 'EU-ALL-ALL-60';
-- Mustang Mach-E  [EUEN_Mustang_Mach-E.xml]
UPDATE vehicles SET gsa = 'EU', modYear = NULL, prodStart = NULL, prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-93';
UPDATE laborops SET gsa = 'EU', modYear = NULL WHERE vehKey = 'EU-ALL-ALL-93';
-- Puma 1998 (06/1997-12/2001)  [EUEN_Puma_1998_06_1997-12_2001.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '1998', prodStart = '1997-06', prodEnd = '2001-12' WHERE vehKey = 'EU-ALL-ALL-21';
UPDATE laborops SET gsa = 'EU', modYear = '1998' WHERE vehKey = 'EU-ALL-ALL-21';
-- Puma 2020 (06/2019-)  [EUEN_Puma_2020_06_2019.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2020', prodStart = '2019-06', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-14';
UPDATE laborops SET gsa = 'EU', modYear = '2020' WHERE vehKey = 'EU-ALL-ALL-14';
-- Ranger 1999 (02/1999-)  [EUEN_Ranger_1999_02_1999.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '1999', prodStart = '1999-02', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-65';
UPDATE laborops SET gsa = 'EU', modYear = '1999' WHERE vehKey = 'EU-ALL-ALL-65';
-- Ranger 2012 (04/2012-)  [EUEN_Ranger_2012_04_2012.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2012', prodStart = '2012-04', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-67';
UPDATE laborops SET gsa = 'EU', modYear = '2012' WHERE vehKey = 'EU-ALL-ALL-67';
-- Ranger 2022  [EUEN_Ranger_2022.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2022', prodStart = NULL, prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-68';
UPDATE laborops SET gsa = 'EU', modYear = '2022' WHERE vehKey = 'EU-ALL-ALL-68';
-- S-MAX 2006.5 (03/2006-)  [EUEN_S-MAX_2006_5_03_2006.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2006.5', prodStart = '2006-03', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-53';
UPDATE laborops SET gsa = 'EU', modYear = '2006.5' WHERE vehKey = 'EU-ALL-ALL-53';
-- S-MAX 2015.5 (01/2015-)  [EUEN_S-MAX_2015_5_01_2015.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2015.5', prodStart = '2015-01', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-63';
UPDATE laborops SET gsa = 'EU', modYear = '2015.5' WHERE vehKey = 'EU-ALL-ALL-63';
-- Scorpio 1995 (10/1994-06/1998)  [EUEN_Scorpio_1995_10_1994-06_1998.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '1995', prodStart = '1994-10', prodEnd = '1998-06' WHERE vehKey = 'EU-ALL-ALL-43';
UPDATE laborops SET gsa = 'EU', modYear = '1995' WHERE vehKey = 'EU-ALL-ALL-43';
-- Test  [EUEN_Test.xml]
UPDATE vehicles SET gsa = 'EU', modYear = NULL, prodStart = NULL, prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-01';
UPDATE laborops SET gsa = 'EU', modYear = NULL WHERE vehKey = 'EU-ALL-ALL-01';
-- Tourneo Connect 2022 (02/2022-)  [EUEN_Tourneo_Connect_2022_02_2022.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2022', prodStart = '2022-02', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-28';
UPDATE laborops SET gsa = 'EU', modYear = '2022' WHERE vehKey = 'EU-ALL-ALL-28';
-- Transit 2000.5 FWD(01/2000-05/2006)  [EUEN_Transit_2000_5_FWD_01_2000-05_2006.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2000.5', prodStart = '2000-01', prodEnd = '2006-05' WHERE vehKey = 'EU-ALL-ALL-78';
UPDATE laborops SET gsa = 'EU', modYear = '2000.5' WHERE vehKey = 'EU-ALL-ALL-78';
-- Transit 2000.5 RWD(01/2000-05/2006)  [EUEN_Transit_2000_5_RWD_01_2000-05_2006.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2000.5', prodStart = '2000-01', prodEnd = '2006-05' WHERE vehKey = 'EU-ALL-ALL-77';
UPDATE laborops SET gsa = 'EU', modYear = '2000.5' WHERE vehKey = 'EU-ALL-ALL-77';
-- Transit 2006.5 (04/2006-)  [EUEN_Transit_2006_5_04_2006.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2006.5', prodStart = '2006-04', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-79';
UPDATE laborops SET gsa = 'EU', modYear = '2006.5' WHERE vehKey = 'EU-ALL-ALL-79';
-- Transit 2014 (08/2013-)  [EUEN_Transit_2014_08_2013.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2014', prodStart = '2013-08', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-81';
UPDATE laborops SET gsa = 'EU', modYear = '2014' WHERE vehKey = 'EU-ALL-ALL-81';
-- Transit 2019 (12/2018-)  [EUEN_Transit_2019_12_2018.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2019', prodStart = '2018-12', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-85';
UPDATE laborops SET gsa = 'EU', modYear = '2019' WHERE vehKey = 'EU-ALL-ALL-85';
-- Transit City  [EUEN_Transit_City.xml]
UPDATE vehicles SET gsa = 'EU', modYear = NULL, prodStart = NULL, prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-89';
UPDATE laborops SET gsa = 'EU', modYear = NULL WHERE vehKey = 'EU-ALL-ALL-89';
-- Transit Connect 2002.5 (06/2002-)  [EUEN_Transit_Connect_2002_5_06_2002.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2002.5', prodStart = '2002-06', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-26';
UPDATE laborops SET gsa = 'EU', modYear = '2002.5' WHERE vehKey = 'EU-ALL-ALL-26';
-- Transit Connect/Tourneo Connect 2013.75 (02/2013-)  [EUEN_Transit_Connect_Tourneo_Connect_2013_75_0.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2013.75', prodStart = '2013-02', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-27';
UPDATE laborops SET gsa = 'EU', modYear = '2013.75' WHERE vehKey = 'EU-ALL-ALL-27';
-- Transit Custom 2012.75 (04/2012-)  [EUEN_Transit_Custom_2012_75_04_2012.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2012.75', prodStart = '2012-04', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-80';
UPDATE laborops SET gsa = 'EU', modYear = '2012.75' WHERE vehKey = 'EU-ALL-ALL-80';
-- Transit Custom 2020 PHEV (05/2019-)  [EUEN_Transit_Custom_2020_PHEV_05_2019.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2020', prodStart = '2019-05', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-86';
UPDATE laborops SET gsa = 'EU', modYear = '2020' WHERE vehKey = 'EU-ALL-ALL-86';
-- Transit Custom/Tourneo Custom 2023.75 (06/2023-)  [EUEN_Transit_Custom_Tourneo_Custom_2023_75_06_.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2023.75', prodStart = '2023-06', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-87';
UPDATE laborops SET gsa = 'EU', modYear = '2023.75' WHERE vehKey = 'EU-ALL-ALL-87';
-- Transit Elektric  [EUEN_Transit_Elektric.xml]
UPDATE vehicles SET gsa = 'EU', modYear = NULL, prodStart = NULL, prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-88';
UPDATE laborops SET gsa = 'EU', modYear = NULL WHERE vehKey = 'EU-ALL-ALL-88';
-- Transit LCX 1992 (08/1991-07/1994)  [EUEN_Transit_LCX_1992_08_1991-07_1994.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '1992', prodStart = '1991-08', prodEnd = '1994-07' WHERE vehKey = 'EU-ALL-ALL-73';
UPDATE laborops SET gsa = 'EU', modYear = '1992' WHERE vehKey = 'EU-ALL-ALL-73';
-- Transit LCX 1995 (08/1994-07/2000)  [EUEN_Transit_LCX_1995_08_1994-07_2000.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '1995', prodStart = '1994-08', prodEnd = '2000-07' WHERE vehKey = 'EU-ALL-ALL-75';
UPDATE laborops SET gsa = 'EU', modYear = '1995' WHERE vehKey = 'EU-ALL-ALL-75';
-- Transit LCY 1992 (08/1991-07/1994)  [EUEN_Transit_LCY_1992_08_1991-07_1994.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '1992', prodStart = '1991-08', prodEnd = '1994-07' WHERE vehKey = 'EU-ALL-ALL-74';
UPDATE laborops SET gsa = 'EU', modYear = '1992' WHERE vehKey = 'EU-ALL-ALL-74';
-- Transit LCY 1995 (08/1994-07/2000)  [EUEN_Transit_LCY_1995_08_1994-07_2000.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '1995', prodStart = '1994-08', prodEnd = '2000-07' WHERE vehKey = 'EU-ALL-ALL-76';
UPDATE laborops SET gsa = 'EU', modYear = '1995' WHERE vehKey = 'EU-ALL-ALL-76';
-- Transit/Tourneo Courier (10/2023-)  [EUEN_Transit_Tourneo_Courier_10_2023.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2023', prodStart = '2023-10', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-95';
UPDATE laborops SET gsa = 'EU', modYear = '2023' WHERE vehKey = 'EU-ALL-ALL-95';
-- Transit/Tourneo Courier 2014.5 (07/2013-)  [EUEN_Transit_Tourneo_Courier_2014_5_07_2013.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '2014.5', prodStart = '2013-07', prodEnd = NULL WHERE vehKey = 'EU-ALL-ALL-83';
UPDATE laborops SET gsa = 'EU', modYear = '2014.5' WHERE vehKey = 'EU-ALL-ALL-83';
-- Windstar (10/1994-07/2000)  [EUEN_Windstar_10_1994-07_2000.xml]
UPDATE vehicles SET gsa = 'EU', modYear = '1994', prodStart = '1994-10', prodEnd = '2000-07' WHERE vehKey = 'EU-ALL-ALL-51';
UPDATE laborops SET gsa = 'EU', modYear = '1994' WHERE vehKey = 'EU-ALL-ALL-51';

-- 3. Verify: both counts should be 0 before COMMIT.
SELECT COUNT(*) AS vehicles_still_ALL FROM vehicles WHERE gsa = 'ALL' OR modYear = 'ALL';
SELECT COUNT(*) AS laborops_still_ALL FROM laborops WHERE gsa = 'ALL' OR modYear = 'ALL';
SELECT vehKey, vehDesc, gsa, modYear, prodStart, prodEnd FROM vehicles WHERE source = 'EU' ORDER BY modYear, vehDesc;

COMMIT TRANSACTION;
-- (Use ROLLBACK TRANSACTION instead if the verification above looks wrong.)
