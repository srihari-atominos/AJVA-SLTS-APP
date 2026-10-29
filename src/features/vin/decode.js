/**
 * decode.js
 * Pure VIN (chassis number) decoding — no I/O, see test/vinDecode.test.js.
 *
 * A VIN is 17 characters (ISO 3779; letters I, O and Q never appear):
 *   1-3   WMI, world manufacturer identifier (1FM = Ford USA SUV, LVS = Changan Ford, ...)
 *   4     restraint / GVWR class (North America) — manufacturer-defined elsewhere
 *   5-7   vehicle line, series and body type — Ford's "body cab code", e.g. P8A
 *   8     engine code
 *   9     check digit (North America only — computed from the other 16 characters)
 *   10    model year code (A=2010 ... Y=2030, 1=2031 ...; the same letters meant 1980-2009)
 *   11    assembly plant
 *   12-17 production sequence number
 *
 * Mapping a VIN to one of the app's vehicles uses positions 5-7 + the
 * model year: the GSLTS extracts publish "body cab code -> vehicle line"
 * for every US file and for the imported lines in the China files
 * (vehicle_vin_codes, filled on upload), and an admin keeps a manual table
 * (vin_map) for everything else — China-built Changan Ford / JMC Ford VINs,
 * the EU extracts (which publish no codes at all), Thailand, South Africa.
 */
const YEAR_CODES = 'ABCDEFGHJKLMNPRSTVWXY123456789'; // index 0 = 2010 (or 1980)
const VALID = /^[A-HJ-NPR-Z0-9]{17}$/;

// North American check digit (position 9): transliteration + weights.
const TRANSLIT = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5,
  P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

// First VIN character -> region the vehicle was built in.
const REGIONS = [
  [/[A-H]/, 'Africa'], [/[J-R]/, 'Asia'], [/[S-Z]/, 'Europe'],
  [/[1-5]/, 'North America'], [/[6-7]/, 'Oceania'], [/[8-9]/, 'South America'],
];

// Ford Motor Company WMIs seen in claims so far. Unknown ones still decode;
// they are just labelled by region.
const WMI = {
  '1FA': 'Ford (USA, passenger car)', '1FB': 'Ford (USA, bus)', '1FC': 'Ford (USA, stripped chassis)',
  '1FD': 'Ford (USA, incomplete vehicle)', '1FM': 'Ford (USA, SUV / MPV)', '1FT': 'Ford (USA, truck)',
  '1LN': 'Lincoln (USA, passenger car)', '5LM': 'Lincoln (USA, SUV / MPV)', '1ZV': 'Ford (USA, AutoAlliance)',
  '2FA': 'Ford (Canada, passenger car)', '2FM': 'Ford (Canada, SUV / MPV)', '2FT': 'Ford (Canada, truck)',
  '2LM': 'Lincoln (Canada, SUV / MPV)', '3FA': 'Ford (Mexico, passenger car)', '3FM': 'Ford (Mexico, SUV / MPV)',
  '3FT': 'Ford (Mexico, truck)', '3LN': 'Lincoln (Mexico, passenger car)',
  'LVS': 'Changan Ford (China)', 'LJX': 'JMC Ford (China)',
  'WF0': 'Ford of Europe (Germany)', 'SFA': 'Ford (United Kingdom)', 'VS6': 'Ford (Spain)', 'NM0': 'Ford Otosan (Turkey)',
  'AFA': 'Ford (South Africa)', 'MNC': 'Ford Thailand (AutoAlliance)', 'MAJ': 'Ford (India)',
  '6FP': 'Ford (Australia)', '9BF': 'Ford (Brazil)', '8AF': 'Ford (Argentina)', 'WFO': 'Ford of Europe (Germany)',
};

function regionOf(ch) {
  const hit = REGIONS.find(([re]) => re.test(ch));
  return hit ? hit[1] : 'Unknown';
}

function checkDigitOf(vin) {
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const ch = vin[i];
    sum += (/[0-9]/.test(ch) ? Number(ch) : TRANSLIT[ch]) * WEIGHTS[i];
  }
  const r = sum % 11;
  return r === 10 ? 'X' : String(r);
}

/**
 * Model year from position 10. The 30-letter cycle repeats, so "G" is 2016
 * or 1986. North America resolves it by position 7 (a letter since model
 * year 2010, a digit before); elsewhere take the 2010+ reading unless it
 * lies in the future.
 */
function modelYearOf(vin, now = new Date()) {
  const i = YEAR_CODES.indexOf(vin[9]);
  if (i < 0) return null;
  const northAmerica = /[1-5]/.test(vin[0]);
  if (northAmerica) return /[0-9]/.test(vin[6]) ? 1980 + i : 2010 + i;
  const recent = 2010 + i;
  return recent > now.getFullYear() + 1 ? 1980 + i : recent;
}

/**
 * @param {string} raw  whatever the user typed
 * @returns {{ok:true, vin, wmi, manufacturer, region, bodyCode, engineCode, checkDigit,
 *            checkDigitValid:boolean|null, yearCode, modelYear, plantCode, serial}
 *          | {ok:false, error:string, vin:string}}
 */
function parseVin(raw, now = new Date()) {
  const vin = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
  if (vin.length !== 17) return { ok: false, vin, error: `A VIN has exactly 17 characters (got ${vin.length})` };
  if (/[IOQ]/.test(vin)) return { ok: false, vin, error: 'A VIN never contains the letters I, O or Q — check for 1 / 0' };
  if (!VALID.test(vin)) return { ok: false, vin, error: 'A VIN contains only letters and digits' };

  const wmi = vin.slice(0, 3);
  const northAmerica = /[1-5]/.test(vin[0]);
  const checkDigit = vin[8];
  const checkDigitValid = northAmerica ? checkDigitOf(vin) === checkDigit : null;
  if (checkDigitValid === false) {
    return { ok: false, vin, error: `Check digit (9th character) does not match — the VIN was probably mistyped. Expected ${checkDigitOf(vin)}, got ${checkDigit}` };
  }
  return {
    ok: true, vin, wmi,
    manufacturer: WMI[wmi] || `Unknown manufacturer (WMI ${wmi})`,
    region: regionOf(vin[0]),
    bodyCode: vin.slice(4, 7),
    engineCode: vin[7],
    checkDigit, checkDigitValid,
    yearCode: vin[9], modelYear: modelYearOf(vin, now),
    plantCode: vin[10], serial: vin.slice(11),
  };
}

/**
 * Which of the app's vehicles a parsed VIN points at.
 *
 * @param {object} parsed        parseVin() result (ok: true)
 * @param {Array}  extractCodes  vehicle_vin_codes rows: { vehKey, gsa, modYear, vehCode, bodyCode, modelDesc, bodyStyleDesc, bodyTypeDesc }
 * @param {Array}  manualMaps    vin_map rows: { wmi|null, bodyCode, gsa|null, vehCode, note }
 * @param {Array}  vehicles      vehicles rows: { vehKey, gsa, modYear, vehCode, vehDesc, brandCode }
 * @param {string|null} gsa      restrict to one market, or null for all
 * @returns {{ matches: Array, best: object|null, via: 'manual'|'extract'|null }}
 *
 * Precedence: a manual row for this exact WMI + body code wins outright;
 * then manual rows for any WMI; then what the extracts publish. Matching
 * vehicles are ranked exact model year first, then nearest year.
 */
function matchVehicles(parsed, extractCodes, manualMaps, vehicles, gsa = null) {
  const body = parsed.bodyCode;
  const marketOk = (g) => !gsa || !g || g === gsa;

  const manual = manualMaps.filter((m) => m.bodyCode === body && marketOk(m.gsa));
  const exactWmi = manual.filter((m) => m.wmi && m.wmi === parsed.wmi);
  const anyWmi = manual.filter((m) => !m.wmi);
  const extract = extractCodes.filter((c) => c.bodyCode === body && marketOk(c.gsa));

  let via = null;
  let candidates = [];
  if (exactWmi.length) { via = 'manual'; candidates = exactWmi; }
  else if (anyWmi.length) { via = 'manual'; candidates = anyWmi; }
  else if (extract.length) { via = 'extract'; candidates = extract; }

  const keys = new Set(candidates.map((c) => `${c.gsa || ''}|${c.vehCode}`));
  const detailFor = (v) => extract.find((c) => c.vehKey === v.vehKey) || extract.find((c) => c.vehCode === v.vehCode && c.gsa === v.gsa) || null;
  const noteFor = (v) => (candidates.find((c) => c.vehCode === v.vehCode && (!c.gsa || c.gsa === v.gsa)) || {}).note || null;

  const matches = vehicles
    .filter((v) => marketOk(v.gsa) && (keys.has(`${v.gsa}|${v.vehCode}`) || keys.has(`|${v.vehCode}`)))
    .map((v) => {
      const year = v.modYear != null && v.modYear !== '' ? Number(v.modYear) : null;
      const d = detailFor(v);
      return {
        vehKey: v.vehKey, vehDesc: v.vehDesc, gsa: v.gsa, modYear: v.modYear, vehCode: v.vehCode, brandCode: v.brandCode,
        exactYear: year != null && parsed.modelYear != null && year === parsed.modelYear,
        yearDistance: year != null && parsed.modelYear != null ? Math.abs(year - parsed.modelYear) : 999,
        modelDesc: d ? d.modelDesc : null, bodyStyleDesc: d ? d.bodyStyleDesc : null, bodyTypeDesc: d ? d.bodyTypeDesc : null,
        note: via === 'manual' ? noteFor(v) : null,
      };
    })
    .sort((a, b) => (b.exactYear - a.exactYear) || (a.yearDistance - b.yearDistance) || String(a.gsa).localeCompare(String(b.gsa)));

  const exact = matches.filter((m) => m.exactYear);
  // Auto-select only when the model year matches and the choice is
  // unambiguous (one vehicle, or several copies of the same line across markets).
  const best = exact.length === 1 ? exact[0] : null;
  return { matches, best, via };
}

module.exports = { parseVin, matchVehicles, checkDigitOf, modelYearOf, WMI };
