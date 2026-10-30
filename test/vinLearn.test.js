/**
 * vinLearn.test.js — deriving VIN mapping rows from claim records
 * (parseClaimRecords / resolveVehicle / deriveMappings).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseClaimRecords, resolveVehicle, deriveMappings } = require('../src/features/vin/learn');

const NOW = new Date('2026-10-30T00:00:00Z');
const VEHICLES = [
  { vehKey: 'IM-CHN-2021-NV', gsa: 'CHN', modYear: '2021', vehCode: 'NV', vehDesc: 'Mondeo - NV - CD542' },
  { vehKey: 'IM-CHN-2021-TE', gsa: 'CHN', modYear: '2021', vehCode: 'TE', vehDesc: 'Kuga - TE - CX482' },
  { vehKey: 'IM-CHN-2021-TZ', gsa: 'CHN', modYear: '2021', vehCode: 'TZ', vehDesc: 'Explorer - TZ - U625' },
  { vehKey: 'IM-CHN-2023-TZ', gsa: 'CHN', modYear: '2023', vehCode: 'TZ', vehDesc: 'Explorer - TZ - U625' },
  { vehKey: 'IM-CHN-2021-GH', gsa: 'CHN', modYear: '2021', vehCode: 'GH', vehDesc: 'Focus ST - GH - C519 China' },
  { vehKey: 'IM-USA-2021-TZ', gsa: 'USA', modYear: '2021', vehCode: 'TZ', vehDesc: 'Explorer - TZ - U625' },
];

test('parseClaimRecords finds the VIN and vehicle columns by header, any separator', () => {
  const csv = 'Claim No;Repair Date;Chassis No;Model;Dealer\n1001;2026-01-02;LVSFMBFC9RSC24354;Mondeo;D1\n1002;2026-01-03;LJXCU3BB2STF28226;Territory;D1\n';
  const rows = parseClaimRecords(csv);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { line: 2, vin: 'LVSFMBFC9RSC24354', vehicle: 'Mondeo', gsa: null });
  assert.equal(rows[1].vehicle, 'Territory');
});

test('parseClaimRecords without a header takes the VIN-looking cell and the other cell', () => {
  const rows = parseClaimRecords('Explorer,1FMUK8DH2SGA86234\nLVSFMBFC9RSC24354,"Mondeo, 2.0T"');
  assert.equal(rows[0].vin, '1FMUK8DH2SGA86234');
  assert.equal(rows[0].vehicle, 'Explorer');
  assert.equal(rows[1].vehicle, 'Mondeo, 2.0T');
});

test('resolveVehicle accepts a code, a key, a description or a model name inside free text', () => {
  assert.equal(resolveVehicle('nv', VEHICLES).vehCode, 'NV');
  assert.equal(resolveVehicle('IM-CHN-2021-TE', VEHICLES).vehCode, 'TE');
  assert.equal(resolveVehicle('Mondeo - NV - CD542', VEHICLES).vehCode, 'NV');
  assert.equal(resolveVehicle('Ford Mondeo 2.0T EcoBoost', VEHICLES).vehCode, 'NV');
  assert.equal(resolveVehicle('Focus ST', VEHICLES).vehCode, 'GH');
  assert.equal(resolveVehicle('Territory', VEHICLES), null);
  // Explorer is loaded for two markets: code resolves, market is left open.
  const ex = resolveVehicle('Explorer', VEHICLES);
  assert.equal(ex.vehCode, 'TZ');
  assert.equal(ex.gsa, null);
  assert.equal(resolveVehicle('Explorer', VEHICLES, 'CHN').gsa, 'CHN');
});

test('deriveMappings groups by WMI + body code, flags conflicts, unresolved and invalid VINs', () => {
  const records = parseClaimRecords([
    'vin,model',
    'LVSFMBFC9RSC24354,Mondeo',
    'LVSFMBFC0SSP47930,Mondeo',
    'LVSFMBFC3NHD32458,Mondeo',
    'LVSFMHFCXRSP71617,Kuga',
    'LVSFMHFC8NHE35684,Explorer', // disagrees with the line above -> conflict
    'LJXCU3BB2STF28226,Territory', // not a loaded line -> unresolved
    'LVSFMNFC3RSJ2156,Mondeo', // 16 characters -> invalid
  ].join('\n'));
  const d = deriveMappings(records, VEHICLES, NOW);
  assert.equal(d.total, 7);
  assert.equal(d.rows.length, 1);
  assert.deepEqual(d.rows[0], {
    wmi: 'LVS', bodyCode: 'MBF', gsa: 'CHN', vehCode: 'NV', vehDesc: 'Mondeo - NV - CD542',
    count: 3, modelYears: [2022, 2024, 2025], exampleVin: 'LVSFMBFC9RSC24354',
  });
  assert.equal(d.conflicts.length, 1);
  assert.equal(d.conflicts[0].bodyCode, 'MHF');
  assert.deepEqual(d.conflicts[0].options.map((o) => o.vehCode), ['TE', 'TZ']);
  assert.deepEqual(d.unresolved, [{ vehicle: 'Territory', count: 1, exampleVin: 'LJXCU3BB2STF28226', ambiguous: undefined }]);
  assert.equal(d.invalid.length, 1);
  assert.match(d.invalid[0].error, /17 characters/);
});
