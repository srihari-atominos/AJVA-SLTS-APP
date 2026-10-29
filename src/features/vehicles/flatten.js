/**
 * flatten.js
 * Parses one GSLTS PUBEXTRACT XML string into the same flat shape used
 * everywhere else in this app: a vehicle row + an array of labor-time rows.
 * Shared by src/scripts/convert.js (bulk folder scan -> NDJSON) and
 * vehicles.service.js (single-file upload -> direct SQLite upsert) so both
 * paths produce byte-identical rows for the same XML.
 */
const { XMLParser } = require('fast-xml-parser');
const { deriveVehicleMeta } = require('./vehicleMeta');

const ARRAY_TAGS = new Set([
  'LABOROP', 'TIMESTUDY', 'FULLLABOROP', 'SECTION',
  'ENGDATA', 'TRANSDATA', 'FEATUREDATA', 'MAPVLTOENTOTR', 'TRANSMISIONTYPE',
  'MAPVINBODYTOVEHICLELINE', 'MODEL', 'BODYSTYLE', 'BODYTYPE',
]);

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false, // keep codes like "06" / "00" as strings
  isArray: (name) => ARRAY_TAGS.has(name),
});

const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * @param {string} xml raw XML text of one PUBEXTRACT file
 * @param {{fileName?: string, folder?: string}} meta
 * @returns {{vehicle: object, laborOps: object[], warnings: string[]} | null}
 *   null if the file isn't a recognizable PUBEXTRACT (caller should
 *   skip/report it). warnings lists anything derived with a fallback
 *   (e.g. a regional extract whose description has no model year).
 */
function flattenExtract(xml, meta = {}) {
  const root = parser.parse(xml).PUBEXTRACT;
  if (!root) return null;

  const ex = root.EXTRACTDETAILS || {};
  const vl = root.VEHLINEDATA || {};

  // The key deliberately uses the RAW header values (so an EU file is
  // "EU-ALL-ALL-03"): it only has to be unique and stable, and it must not
  // change when the derivation below improves, or re-uploading a file
  // would create a second vehicle instead of replacing the first.
  const vehKey = [ex.SOURCE, ex.GSA, ex.MODYR, vl.GSLTSVEHCODE].join('-');

  // Displayed/filterable market + year, with "ALL" headers resolved from
  // the description (see vehicleMeta.js for the rules and why).
  const derived = deriveVehicleMeta({ source: ex.SOURCE, gsa: ex.GSA, modYear: ex.MODYR, vehDesc: vl.VEHDESC });
  const { gsa, modYear, prodStart, prodEnd } = derived;
  const warnings = derived.warnings.map((w) => `${meta.fileName || vehKey}: ${w}`);

  const engines = arr(root.ENGINES && root.ENGINES.ENGDATA).map((e) => ({
    engCode: e.ENGCODE, desc: e.ENDESC, abbr: e.ABBR, numCyl: e.NUMCYL,
  }));
  const transmissions = arr(root.TRANSMISSIONS && root.TRANSMISSIONS.TRANSDATA).map((t) => ({
    code: t.WERSTRANSFEAT, desc: t.TRDESC, typeInd: t.TRANSINDDATA,
  }));
  const features = arr(root.FEATURESDATA && root.FEATURESDATA.FEATUREDATA).map((f) => ({
    family: f.WERSFAMILY, feature: f.WERSFEATURE, desc: f.WERDESC,
  }));

  // "VIN positions 5-7 -> this vehicle line", as the extract publishes it
  // (every US file; the China files only for imported lines; EU files never).
  // Stored in vehicle_vin_codes and used by the VIN search (features/vin).
  // The model / body descriptions are looked up so the search can say
  // "Mustang GT, 2-door coupe" rather than just "Mustang".
  const byCode = (list, codeTag, descTag) => new Map(arr(list).filter((x) => x && typeof x === 'object').map((x) => [x[codeTag], x[descTag] || null]));
  const modelDesc = byCode(root.MODELS && root.MODELS.MODEL, 'GSLTSMODELCODE', 'MODDESC');
  const bodyStyleDesc = byCode(root.BODYSTYLES && root.BODYSTYLES.BODYSTYLE, 'GSLTSBODYSTYLECODE', 'BSDESC');
  const bodyTypeDesc = byCode(root.BODYTYPES && root.BODYTYPES.BODYTYPE, 'GSLTSBODYTYPECODE', 'BTDESC');
  const vinCodes = arr(root.MAPVINBODYTOVEHICLELINES && root.MAPVINBODYTOVEHICLELINES.MAPVINBODYTOVEHICLELINE)
    .filter((m) => m && typeof m === 'object' && m.BODYCABCODE)
    .map((m) => ({
      bodyCode: String(m.BODYCABCODE).trim().toUpperCase(),
      vehCode: m.GSLTSVEHCODE || vl.GSLTSVEHCODE,
      bodyTypeCode: m.GSLTSBODYTYPECODE || null,
      bodyStyleCode: m.GSLTSBODYSTYLECODE || null,
      modelCode: m.GSLTSMODELCODE || null,
      modelDesc: modelDesc.get(m.GSLTSMODELCODE) || null,
      bodyStyleDesc: bodyStyleDesc.get(m.GSLTSBODYSTYLECODE) || null,
      bodyTypeDesc: bodyTypeDesc.get(m.GSLTSBODYTYPECODE) || null,
    }));

  const laborOps = [];
  for (const op of arr(root.LABOROPS && root.LABOROPS.LABOROP)) {
    const sections = arr(op.LABOROPSECNOS && op.LABOROPSECNOS.SECTION).map((s) => ({
      secNo: s.SECNO, secDesc: s.SECDESC, subSec: s.SUBSEC, subTitle: s.SUBTITLE,
    }));
    const sec = sections[0] || {};

    for (const ts of arr(op.TIMESTUDY)) {
      for (const flo of arr(ts.FULLLABOROPS && ts.FULLLABOROPS.FULLLABOROP)) {
        laborOps.push({
          vehKey,
          source: ex.SOURCE, gsa, modYear,
          vehDesc: vl.VEHDESC, brandCode: vl.BRANDCODE,
          laborDescCode: op.LABORDESCCODE,
          baseLaborOp: op.BASELABOROP,
          combo: op.COMBO,
          complexCode: op.COMPLEXCODE,
          operationDesc: op.OPERATIONDESC,
          operType: op.OPERTYPE,
          secNo: sec.secNo, secDesc: sec.secDesc,
          tsid: ts.TSID,
          effectiveDate: ts.EFFECTIVEDATE,
          status: ts.STATUS,
          fullLaborOpCode: flo.FULLLABOROPCODE,
          totTime: num(flo.TOTTIME),
          categoryCode: flo.CATEGORYCODE,
          catDesc: flo.CATDESC || null,
          qualDesc: flo.QUALDESC || null,
          assessedTime: flo.ASSESSED_TIME,
        });
      }
    }
  }

  const vehicle = {
    vehKey,
    fileName: meta.fileName || null,
    folder: meta.folder || null,
    source: ex.SOURCE, gsa, language: ex.LANGUAGE,
    modYear, prodType: ex.PRODTYPE,
    prodStart, prodEnd,
    extractId: ex.EXTRACTID, extractDate: ex.EXTRACTDATE,
    vehCode: vl.GSLTSVEHCODE, vehDesc: vl.VEHDESC,
    abbr: vl.ABBR, brandCode: vl.BRANDCODE,
    engines, transmissions, features, vinCodes,
    laborOpCount: arr(root.LABOROPS && root.LABOROPS.LABOROP).length,
    timeEntryCount: laborOps.length,
  };

  return { vehicle, laborOps, warnings };
}

module.exports = { flattenExtract };
