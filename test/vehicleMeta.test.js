/**
 * vehicleMeta.test.js
 * Every description shape seen across the EU (regional, "ALL" header)
 * extracts, plus the per-market (China/US) header path that must stay
 * untouched. Run with `npm test` (Node's built-in test runner, no deps).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { deriveVehicleMeta } = require('../src/features/vehicles/vehicleMeta');
const { flattenExtract } = require('../src/features/vehicles/flatten');

const eu = (vehDesc) => deriveVehicleMeta({ source: 'EU', gsa: 'ALL', modYear: 'ALL', vehDesc });

test('per-market header values are used as-is (China/US extracts)', () => {
  const r = deriveVehicleMeta({ source: 'IM', gsa: 'CHN', modYear: '2021', vehDesc: 'Aviator - TU - U611' });
  assert.deepEqual(r, { gsa: 'CHN', modYear: '2021', prodStart: null, prodEnd: null, warnings: [] });
});

test('EU: "ALL" market falls back to the source region', () => {
  assert.equal(eu('Fiesta 1989 (03/1989-09/1996)').gsa, 'EU');
});

test('EU: model year + closed production window', () => {
  const r = eu('Fiesta 1989 (03/1989-09/1996)');
  assert.equal(r.modYear, '1989');
  assert.equal(r.prodStart, '1989-03');
  assert.equal(r.prodEnd, '1996-09');
  assert.deepEqual(r.warnings, []);
});

test('EU: model year + open production window', () => {
  const r = eu('Explorer 2020 (03/2019-)');
  assert.equal(r.modYear, '2020');
  assert.equal(r.prodStart, '2019-03');
  assert.equal(r.prodEnd, null);
});

test('EU: fractional model years are kept verbatim', () => {
  assert.equal(eu('Ka 2016.5 (04/2016-)').modYear, '2016.5');
  assert.equal(eu('Fiesta 2002.25 (11/2001-)').modYear, '2002.25');
  assert.equal(eu('Transit Custom/Tourneo Custom 2023.75 (06/2023-)').modYear, '2023.75');
});

test('EU: dot-separated window and no space before "("', () => {
  assert.deepEqual(eu('Fiesta 2017 (05.2017-)').prodStart, '2017-05');
  const r = eu('Transit 2000.5 RWD(01/2000-05/2006)');
  assert.equal(r.modYear, '2000.5');
  assert.equal(r.prodStart, '2000-01');
  assert.equal(r.prodEnd, '2006-05');
});

test('EU: window only -> year falls back to window start, with a warning', () => {
  const r = eu('Windstar (10/1994-07/2000)');
  assert.equal(r.modYear, '1994');
  assert.equal(r.prodStart, '1994-10');
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /production start year 1994/);
});

test('EU: year only, no window', () => {
  const r = eu('Mustang 2024');
  assert.equal(r.modYear, '2024');
  assert.equal(r.prodStart, null);
  assert.deepEqual(r.warnings, []);
});

test('EU: neither year nor window -> blank year, with a warning', () => {
  for (const desc of ['Bronco', 'F150', 'Mustang Mach-E', 'Explorer CX-740S', 'Transit City']) {
    const r = eu(desc);
    assert.equal(r.modYear, null, desc);
    assert.equal(r.gsa, 'EU', desc);
    assert.equal(r.warnings.length, 1, desc);
  }
});

test('digits in model names are not mistaken for a year', () => {
  assert.equal(eu('F150').modYear, null);
  assert.equal(eu('Capri CX-740L').modYear, null);
});

test('extra whitespace / lowercase "all" are treated as unknown too', () => {
  const r = deriveVehicleMeta({ source: ' EU ', gsa: ' all ', modYear: '', vehDesc: ' Puma 2020 (06/2019-) ' });
  assert.equal(r.gsa, 'EU');
  assert.equal(r.modYear, '2020');
});

test('flattenExtract: EU file gets derived fields, raw-header vehKey, warnings prefixed with file name', () => {
  const xml = `<?xml version="1.0"?><PUBEXTRACT>
    <EXTRACTDETAILS><SOURCE>EU</SOURCE><GSA>ALL</GSA><LANGUAGE>EN</LANGUAGE><MODYR>ALL</MODYR><PRODTYPE>A</PRODTYPE></EXTRACTDETAILS>
    <VEHLINEDATA><GSLTSVEHCODE>51</GSLTSVEHCODE><VEHDESC>Windstar (10/1994-07/2000)</VEHDESC></VEHLINEDATA>
    <LABOROPS><LABOROP><LABORDESCCODE>1000A</LABORDESCCODE><TIMESTUDY><TSID>1</TSID>
      <FULLLABOROPS><FULLLABOROP><FULLLABOROPCODE>1000AA</FULLLABOROPCODE><TOTTIME>0.5</TOTTIME></FULLLABOROP></FULLLABOROPS>
    </TIMESTUDY></LABOROP></LABOROPS>
  </PUBEXTRACT>`;
  const r = flattenExtract(xml, { fileName: 'EUEN_Windstar.xml' });
  assert.equal(r.vehicle.vehKey, 'EU-ALL-ALL-51'); // unchanged: stable upsert key
  assert.equal(r.vehicle.gsa, 'EU');
  assert.equal(r.vehicle.modYear, '1994');
  assert.equal(r.vehicle.prodStart, '1994-10');
  assert.equal(r.vehicle.prodEnd, '2000-07');
  assert.equal(r.laborOps.length, 1);
  assert.equal(r.laborOps[0].gsa, 'EU');
  assert.equal(r.laborOps[0].modYear, '1994');
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /^EUEN_Windstar\.xml: /);
});

test('flattenExtract: per-market file is byte-for-byte as before (no derivation, no warnings)', () => {
  const xml = `<?xml version="1.0"?><PUBEXTRACT>
    <EXTRACTDETAILS><SOURCE>IM</SOURCE><GSA>CHN</GSA><LANGUAGE>EN</LANGUAGE><MODYR>2021</MODYR></EXTRACTDETAILS>
    <VEHLINEDATA><GSLTSVEHCODE>TU</GSLTSVEHCODE><VEHDESC>Aviator - TU - U611</VEHDESC></VEHLINEDATA>
    <LABOROPS/></PUBEXTRACT>`;
  const r = flattenExtract(xml, { fileName: 'x.xml' });
  assert.equal(r.vehicle.vehKey, 'IM-CHN-2021-TU');
  assert.equal(r.vehicle.gsa, 'CHN');
  assert.equal(r.vehicle.modYear, '2021');
  assert.equal(r.vehicle.prodStart, null);
  assert.deepEqual(r.warnings, []);
});
