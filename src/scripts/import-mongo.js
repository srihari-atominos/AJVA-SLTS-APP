/**
 * import-mongo.js
 * Streams the NDJSON tables produced by convert.js into local MongoDB
 * (database: warranty) in batches, then creates the query indexes.
 * Optional alternative to import-sqlite.js — see npm run import:mongo.
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { MongoClient } = require('mongodb');
const config = require('../config');

const MONGO_URL = config.mongo.url;
const DB_NAME = config.mongo.dbName;
const DATA_DIR = config.dataDir;
const BATCH_SIZE = config.mongo.batchSize;

async function importFile(db, collName, filePath) {
  const coll = db.collection(collName);
  await coll.drop().catch(() => {}); // fresh import each run

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, 'utf8'),
    crlfDelay: Infinity,
  });

  let batch = [];
  let total = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    batch.push(JSON.parse(line));
    if (batch.length >= BATCH_SIZE) {
      await coll.insertMany(batch, { ordered: false });
      total += batch.length;
      batch = [];
      if (total % 50000 === 0) console.log(`  ${collName}: ${total} rows...`);
    }
  }
  if (batch.length) {
    await coll.insertMany(batch, { ordered: false });
    total += batch.length;
  }
  console.log(`${collName}: imported ${total} rows`);
  return total;
}

async function main() {
  const client = new MongoClient(MONGO_URL);
  await client.connect();
  const db = client.db(DB_NAME);
  const t0 = Date.now();

  await importFile(db, 'vehicles', path.join(DATA_DIR, 'vehicles.ndjson'));
  await importFile(db, 'laborops', path.join(DATA_DIR, 'laborops.ndjson'));

  console.log('Creating indexes...');
  await db.collection('vehicles').createIndexes([
    { key: { vehKey: 1 } },
    { key: { modYear: 1, gsa: 1 } },
  ]);
  await db.collection('laborops').createIndexes([
    { key: { vehKey: 1 } },
    { key: { laborDescCode: 1 } },
    { key: { fullLaborOpCode: 1 } },
    { key: { operationDesc: 'text', laborDescCode: 'text' } },
  ]);

  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await client.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
