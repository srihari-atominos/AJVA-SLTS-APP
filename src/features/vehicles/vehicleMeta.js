/**
 * vehicleMeta.js
 * Derives the vehicle's market, model year and production window from an
 * extract's header + description, handling the regional extracts whose
 * header literally says "ALL".
 *
 * Why this exists: the China (IM/CHN) and US (NA/USA) GSLTS extracts are
 * published per market and per model year, so EXTRACTDETAILS carries real
 * values (<GSA>CHN</GSA>, <MODYR>2021</MODYR>). The European extracts are
 * published once per vehicle line for the whole region, and their header
 * says <GSA>ALL</GSA> and <MODYR>ALL</MODYR> — the only place the year and
 * production window appear is the free-text VEHDESC, e.g.
 *   "Fiesta 1989 (03/1989-09/1996)"   model year + closed window
 *   "Explorer 2020 (03/2019-)"        model year + open window
 *   "Ka 2016.5 (04/2016-)"            fractional model-year label (Ford's own convention) -> year 2016
 *   "Windstar (10/1994-07/2000)"      window only -> year falls back to window start
 *   "Mustang 2024"                    year only
 *   "Bronco"                          neither -> year left blank, warning emitted
 * Taking "ALL" at face value put every EU vehicle under year "ALL" and
 * market "ALL" in the UI. Rule: treat "ALL" (or empty) as "unknown, derive
 * it", never as a value.
 *
 * Shared by flatten.js (every upload / convert) and the backfill script
 * (src/scripts/backfill-vehicle-meta.js, for rows loaded before this fix),
 * so both always agree. Pure function, no I/O — see test/vehicleMeta.test.js.
 */

// First 4-digit year in the text BEFORE the production window — so
// "Windstar (10/1994-...)" doesn't read 1994 as the model year. Ford's
// fractional labels (2002.25, 2016.5, 2023.75) are mid-year refreshes of
// that model year: the fraction is matched so it isn't mistaken for a
// separate number, but only the whole year is stored — that is what the
// year filter groups by, and the full label stays visible in VEHDESC.
const MODEL_YEAR_RE = /\b((?:19|20)\d{2})(?:\.\d{1,2})?\b/;

// "(MM/YYYY-MM/YYYY)" or "(MM/YYYY-)" — some files use "." instead of "/"
// (e.g. "(05.2017-)") and some have no space before the "(".
const PROD_WINDOW_RE = /\(\s*(\d{2})\s*[/.]\s*(\d{4})\s*-\s*(?:(\d{2})\s*[/.]\s*(\d{4}))?\s*\)/;

const isUnknown = (v) => v == null || String(v).trim() === '' || String(v).trim().toUpperCase() === 'ALL';
const clean = (v) => (v == null ? null : String(v).trim() || null);

/**
 * @param {{source?: string, gsa?: string, modYear?: string, vehDesc?: string}} raw
 *   Header values exactly as the XML (or an existing DB row) has them.
 * @returns {{gsa: string|null, modYear: string|null, prodStart: string|null,
 *            prodEnd: string|null, warnings: string[]}}
 *   prodStart/prodEnd are "YYYY-MM" (sortable); null when absent.
 */
function deriveVehicleMeta(raw) {
  const warnings = [];
  const desc = clean(raw.vehDesc) || '';

  // Production window from the parenthesised range, if any.
  let prodStart = null;
  let prodEnd = null;
  const w = desc.match(PROD_WINDOW_RE);
  if (w) {
    prodStart = `${w[2]}-${w[1]}`;
    if (w[4]) prodEnd = `${w[4]}-${w[3]}`;
  }

  // Market: the header's GSA when it's a real market; otherwise the source
  // region (EU for the European extracts).
  let gsa = clean(raw.gsa);
  if (isUnknown(gsa)) {
    gsa = isUnknown(raw.source) ? null : clean(raw.source);
    if (!gsa) warnings.push(`market: GSA and SOURCE are both missing/ALL for "${desc}"`);
  }

  // Model year: header value when real; else from the description text
  // ahead of the window; else the window's start year; else blank.
  let modYear = clean(raw.modYear);
  if (isUnknown(modYear)) {
    const head = w ? desc.slice(0, w.index) : desc;
    const y = head.match(MODEL_YEAR_RE);
    if (y) {
      modYear = y[1];
    } else if (prodStart) {
      modYear = prodStart.slice(0, 4);
      warnings.push(`modYear: no model year in "${desc}" — using production start year ${modYear}`);
    } else {
      modYear = null;
      warnings.push(`modYear: no model year or production window in "${desc}" — left blank`);
    }
  }

  return { gsa, modYear, prodStart, prodEnd, warnings };
}

module.exports = { deriveVehicleMeta };
