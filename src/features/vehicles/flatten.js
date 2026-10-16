/**
 * flatten.js
 * Parses one GSLTS PUBEXTRACT XML string into the same flat shape used
 * everywhere else in this app: a vehicle row + an array of labor-time rows.
 * Shared by src/scripts/convert.js (bulk folder scan -> NDJSON) and
 * vehicles.service.js (single-file upload -> direct SQLite upsert) so both
 * paths produce byte-identical rows for the same XML.
 */
const { XMLParser } = require('fast-xml-parser');

const ARRAY_TAGS = new Set([
  'LABOROP', 'TIMESTUDY', 'FULLLABOROP', 'SECTION',
  'ENGDATA', 'TRANSDATA', 'FEATUREDATA', 'MAPVLTOENTOTR', 'TRANSMISIONTYPE',
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
 * @returns {{vehicle: object, laborOps: object[]} | null} null if the file
 *   isn't a recognizable PUBEXTRACT (caller should skip/report it)
 */
function flattenExtract(xml, meta = {}) {
  const root = parser.parse(xml).PUBEXTRACT;
  if (!root) return null;

  const ex = root.EXTRACTDETAILS || {};
  const vl = root.VEHLINEDATA || {};
  const vehKey = [ex.SOURCE, ex.GSA, ex.MODYR, vl.GSLTSVEHCODE].join('-');

  const engines = arr(root.ENGINES && root.ENGINES.ENGDATA).map((e) => ({
    engCode: e.ENGCODE, desc: e.ENDESC, abbr: e.ABBR, numCyl: e.NUMCYL,
  }));
  const transmissions = arr(root.TRANSMISSIONS && root.TRANSMISSIONS.TRANSDATA).map((t) => ({
    code: t.WERSTRANSFEAT, desc: t.TRDESC, typeInd: t.TRANSINDDATA,
  }));
  const features = arr(root.FEATURESDATA && root.FEATURESDATA.FEATUREDATA).map((f) => ({
    family: f.WERSFAMILY, feature: f.WERSFEATURE, desc: f.WERDESC,
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
          source: ex.SOURCE, gsa: ex.GSA, modYear: ex.MODYR,
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
    source: ex.SOURCE, gsa: ex.GSA, language: ex.LANGUAGE,
    modYear: ex.MODYR, prodType: ex.PRODTYPE,
    extractId: ex.EXTRACTID, extractDate: ex.EXTRACTDATE,
    vehCode: vl.GSLTSVEHCODE, vehDesc: vl.VEHDESC,
    abbr: vl.ABBR, brandCode: vl.BRANDCODE,
    engines, transmissions, features,
    laborOpCount: arr(root.LABOROPS && root.LABOROPS.LABOROP).length,
    timeEntryCount: laborOps.length,
  };

  return { vehicle, laborOps };
}

module.exports = { flattenExtract };
