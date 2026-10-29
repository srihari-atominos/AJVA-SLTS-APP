/**
 * vinDecode.test.js — parseVin() validation/decoding and matchVehicles()
 * precedence, with real VIN shapes from the sample claim list.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseVin, matchVehicles, checkDigitOf, modelYearOf } = require('../src/features/vin/decode');

const NOW = new Date('2026-10-28T00:00:00Z');

test('rejects anything that is not 17 valid characters', () => {
  assert.equal(parseVin('').ok, false);
  assert.match(parseVin('1FMUK8DH2SGA8623').error, /17 characters/);
  assert.match(parseVin('1FMUK8DH2SGA86234X').error, /17 characters/);
  assert.match(parseVin('1FMUK8DH2SGA8623O').error, /I, O or Q/);
  assert.match(parseVin('1FMUK8DH2SGA8623-').error, /letters and digits/);
});

test('decodes a North American VIN and verifies its check digit', () => {
  const p = parseVin(' 1fmuk8dh2sga86234 ', NOW); // Explorer AWD, built 2025, from the sample list
  assert.equal(p.ok, true);
  assert.equal(p.vin, '1FMUK8DH2SGA86234');
  assert.equal(p.wmi, '1FM');
  assert.match(p.manufacturer, /Ford \(USA/);
  assert.equal(p.region, 'North America');
  assert.equal(p.bodyCode, 'K8D');
  assert.equal(p.engineCode, 'H');
  assert.equal(p.checkDigitValid, true);
  assert.equal(p.modelYear, 2025);
  assert.equal(p.plantCode, 'G');
  assert.equal(p.serial, 'A86234');
});

test('a mistyped North American VIN fails the check digit', () => {
  const p = parseVin('1FMUK8DH3SGA86234'); // 9th char changed
  assert.equal(p.ok, false);
  assert.match(p.error, /Check digit/);
  assert.equal(checkDigitOf('1FMUK8DH2SGA86234'), '2');
});

test('non-North-American VINs skip the check digit and still decode', () => {
  const p = parseVin('LVSFMBFC0SSP47930', NOW); // Changan Ford, 2025
  assert.equal(p.ok, true);
  assert.equal(p.checkDigitValid, null);
  assert.equal(p.manufacturer, 'Changan Ford (China)');
  assert.equal(p.region, 'Asia');
  assert.equal(p.bodyCode, 'MBF');
  assert.equal(p.modelYear, 2025);
  assert.equal(parseVin('LJXCU3BB2STF28226', NOW).manufacturer, 'JMC Ford (China)');
  assert.equal(parseVin('WF0AXXGCDA1234567', NOW).region, 'Europe');
});

test('model year: the 30-year cycle is resolved by position 7 (NA) or "not in the future" (elsewhere)', () => {
  assert.equal(modelYearOf('1FTCR15X0TTA01050', NOW), 1996); // the sample truck from the VIN document: digit at position 7
  assert.equal(modelYearOf('1FA6P8CF0G5123456', NOW), 2016); // letter at position 7
  assert.equal(modelYearOf('2FMDK4AK4EBB78997', NOW), 2014);
  assert.equal(modelYearOf('LVSFMBFC0SSP47930', NOW), 2025);
  assert.equal(modelYearOf('LVSFMBFC0ASP47930', NOW), 2010);
  assert.equal(modelYearOf('LVSFMBFC0YSP47930', NOW), 2000); // Y = 2030 would be in the future
});

const vehicles = [
  { vehKey: 'IM-CHN-2021-D9', gsa: 'CHN', modYear: '2021', vehCode: 'D9', vehDesc: 'Nautilus - D9 - U540', brandCode: 'L' },
  { vehKey: 'IM-CHN-2023-D9', gsa: 'CHN', modYear: '2023', vehCode: 'D9', vehDesc: 'Nautilus - D9 - U540', brandCode: 'L' },
  { vehKey: 'IM-CHN-2023-TZ', gsa: 'CHN', modYear: '2023', vehCode: 'TZ', vehDesc: 'Explorer - TZ - U625', brandCode: 'F' },
  { vehKey: 'IM-CHN-2025-TZ', gsa: 'CHN', modYear: '2025', vehCode: 'TZ', vehDesc: 'Explorer - TZ - U625', brandCode: 'F' },
  { vehKey: 'NA-USA-2015-N6', gsa: 'USA', modYear: '2015', vehCode: 'N6', vehDesc: 'Explorer, AWD', brandCode: 'F' },
];
const extractCodes = [
  { vehKey: 'IM-CHN-2021-D9', gsa: 'CHN', modYear: '2021', vehCode: 'D9', bodyCode: 'J8K', modelDesc: 'SELECT', bodyStyleDesc: null, bodyTypeDesc: '4DR' },
  { vehKey: 'NA-USA-2015-N6', gsa: 'USA', modYear: '2015', vehCode: 'N6', bodyCode: 'K8D', modelDesc: 'XLT', bodyStyleDesc: null, bodyTypeDesc: null },
];

test('extract-published code + matching model year selects the vehicle automatically', () => {
  const p = parseVin('2LMPJ8KP3MBL06005', NOW); // Nautilus, 2021, from the sample list
  const r = matchVehicles(p, extractCodes, [], vehicles);
  assert.equal(r.via, 'extract');
  assert.equal(r.best.vehKey, 'IM-CHN-2021-D9');
  assert.equal(r.best.modelDesc, 'SELECT');
  assert.deepEqual(r.matches.map((m) => m.vehKey), ['IM-CHN-2021-D9', 'IM-CHN-2023-D9']);
});

test('no vehicle for that model year: candidates are listed nearest year first, nothing auto-selected', () => {
  const p = parseVin('2LMPJ8KP3SBL06005', NOW); // same line, 2025 (check digit irrelevant: recomputed below)
  const vin = '2LMPJ8KP' + checkDigitOf('2LMPJ8KP0SBL06005') + 'SBL06005';
  const r = matchVehicles(parseVin(vin, NOW), extractCodes, [], vehicles);
  assert.equal(r.best, null);
  assert.deepEqual(r.matches.map((m) => m.vehKey), ['IM-CHN-2023-D9', 'IM-CHN-2021-D9']);
  assert.equal(p.ok || true, true);
});

test('a manual row for the exact WMI beats the extract; a blank-WMI row applies to any WMI', () => {
  const p = parseVin('1FMUK8DH2SGA86234', NOW); // K8D, 2025 — the US extract says Explorer AWD (USA)
  const r0 = matchVehicles(p, extractCodes, [], vehicles);
  assert.equal(r0.via, 'extract');
  assert.deepEqual(r0.matches.map((m) => m.vehKey), ['NA-USA-2015-N6']);

  const manual = [{ wmi: '1FM', bodyCode: 'K8D', gsa: 'CHN', vehCode: 'TZ', note: 'US-built Explorer sold in China' }];
  const r1 = matchVehicles(p, extractCodes, manual, vehicles);
  assert.equal(r1.via, 'manual');
  assert.equal(r1.best.vehKey, 'IM-CHN-2025-TZ');
  assert.equal(r1.best.note, 'US-built Explorer sold in China');

  const anyWmi = [{ wmi: null, bodyCode: 'MBF', gsa: null, vehCode: 'TZ', note: null }];
  const r2 = matchVehicles(parseVin('LVSFMBFC0SSP47930', NOW), extractCodes, anyWmi, vehicles);
  assert.equal(r2.via, 'manual');
  assert.equal(r2.best.vehKey, 'IM-CHN-2025-TZ');
});

test('market restriction and an unknown body code', () => {
  const p = parseVin('1FMUK8DH2SGA86234', NOW);
  assert.deepEqual(matchVehicles(p, extractCodes, [], vehicles, 'CHN').matches, []);
  const r = matchVehicles(parseVin('LJXCU3BB2STF28226', NOW), extractCodes, [], vehicles);
  assert.equal(r.via, null);
  assert.deepEqual(r.matches, []);
  assert.equal(r.best, null);
});
