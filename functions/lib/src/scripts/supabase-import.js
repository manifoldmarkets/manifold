"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const lodash_1 = require("lodash");
const promise_1 = require("../../../common/util/promise");
const utils_1 = require("../utils");
const script_init_1 = require("../scripts/script-init");
const time_1 = require("common/util/time");
const init_1 = require("../supabase/init");
const utils_2 = require("../supabase/utils");
const commander_1 = require("commander");
// strategy for live importing collection C without dropping data (times are firestore server times)
// 1. optional - clear supabase table for collection C
// 2. start replication of new collection C transaction log entries to supabase starting at T0
// 3. establish import starting timestamp T1 such that T0 <= T1 <= now
// 4. read collection C from firestore with effective timestamp T1 and send supabase writes
// 5. supabase should be caught up
async function getServerTimestamp() {
    // firestore doesn't seem to have an API to just ask for the time, so we do this kludge
    const result = await admin.firestore().collection('temp').doc('time').get();
    return result.readTime.toDate();
}
function getWriteRow(snap, tableName, ts) {
    var _a;
    return {
        write_kind: 'update',
        table_id: tableName,
        doc_id: snap.id,
        parent_id: (_a = snap.ref.parent.parent) === null || _a === void 0 ? void 0 : _a.id,
        data: snap.data(),
        ts: ts.toISOString(),
    };
}
async function importCollection(pg, source, tableName, batchSize) {
    (0, utils_1.log)(`Preparing to import ${tableName} documents.`);
    const t1 = await getServerTimestamp();
    const n = (await source.count().get()).data().count;
    (0, utils_1.log)(`Documents to import: ${n}. Timestamp: ${t1.toISOString()}.`);
    const snaps = await source.get();
    (0, utils_1.log)(`Loaded ${snaps.size} documents.`);
    for (const batch of (0, lodash_1.chunk)(snaps.docs, batchSize)) {
        const rows = batch.map((d) => getWriteRow(d, tableName, t1));
        await (0, promise_1.withRetries)((0, utils_2.bulkInsert)(pg, 'incoming_writes', rows));
        (0, utils_1.log)(`Processed ${rows.length} documents.`);
    }
    (0, utils_1.log)(`Imported ${snaps.size} documents.`);
}
async function importCollectionGroup(pg, source, tableName, predicate, batchSize) {
    (0, utils_1.log)(`Preparing to import ${tableName} documents.`);
    const t1 = await getServerTimestamp();
    const n = (await source.count().get()).data().count;
    (0, utils_1.log)(`Documents to import: ${n}. Timestamp: ${t1.toISOString()}.`);
    // partitions are different sizes so be conservative
    const partitions = Math.ceil(n / batchSize) * 2;
    await (0, utils_1.processPartitioned)(source, partitions, async (docs) => {
        const rows = docs
            .filter(predicate)
            .map((d) => getWriteRow(d, tableName, t1));
        await (0, promise_1.withRetries)((0, utils_2.bulkInsert)(pg, 'incoming_writes', rows));
    });
}
// This function is for importing immutable data in an append-only fashion starting from a given timestamp.
// In case the import fails, it can be restarted from the last successfully processed timestamp.
async function importAppendOnlyCollectionGroup(pg, source, tableName, predicate, batchSize, chunkTime = 0.25, startTime = 0, timePropName = 'timestamp') {
    (0, utils_1.log)(`Preparing to import ${tableName} documents.`);
    const t1 = await getServerTimestamp();
    const n = (await source.count().get()).data().count;
    if (startTime === 0) {
        startTime = await source
            .orderBy(timePropName, 'asc')
            .limit(1)
            .get()
            .then((snap) => {
            return snap.docs[0].data()[timePropName];
        });
    }
    const originalStartTime = startTime;
    (0, utils_1.log)(`Total documents in the collection: ${n}. Timestamp: ${t1.toISOString()}. Starting from: ${startTime}. Using ${chunkTime} day chunks.`);
    let totalProcessed = 0;
    const delta = chunkTime * time_1.DAY_MS;
    while (startTime < t1.getTime()) {
        const endTime = Math.min(startTime + delta, t1.getTime());
        const snap = await source
            .where(timePropName, '>=', startTime)
            .where(timePropName, '<', endTime)
            .get();
        (0, utils_1.log)(`Loaded ${snap.size} documents.`);
        for (const batch of (0, lodash_1.chunk)(snap.docs, batchSize)) {
            const rows = batch.map((d) => getWriteRow(d, tableName, t1));
            await (0, promise_1.withRetries)((0, utils_2.bulkInsert)(pg, 'incoming_writes', rows));
        }
        totalProcessed += snap.size;
        (0, utils_1.log)(`Processed ${snap.size} documents from ${startTime} to ${endTime}.`);
        (0, utils_1.log)(`Use ${endTime} as the starting point for the next run.`);
        startTime = endTime;
        (0, utils_1.log)(`Total documents processed: ${totalProcessed}. Total % time processed: ${(((endTime - originalStartTime) / (t1.getTime() - originalStartTime)) *
            100).toFixed(2)}%.`);
    }
}
async function clearFailedWrites() {
    const firestore = admin.firestore();
    (0, utils_1.log)('Clearing failed writes...');
    const refs = await firestore
        .collection('replicationState')
        .doc('supabase')
        .collection('failedWrites')
        .listDocuments();
    const deleter = firestore.bulkWriter({ throttling: false });
    for (const ref of refs) {
        deleter.delete(ref);
    }
    await deleter.close();
}
async function importDatabase(tables, startTime = 0, timeChunk = 0.25) {
    const firestore = admin.firestore();
    const pg = (0, init_1.createSupabaseDirectClient)();
    const shouldImport = (t) => tables == null || tables.includes(t);
    if (tables == null) {
        await clearFailedWrites();
    }
    if (shouldImport('users'))
        await importCollection(pg, firestore.collection('users'), 'users', 500);
    if (shouldImport('user_portfolio_history'))
        await importAppendOnlyCollectionGroup(pg, firestore.collectionGroup('portfolioHistory'), 'user_portfolio_history', (_) => true, 2000, timeChunk, startTime);
    if (shouldImport('user_contract_metrics'))
        await importCollectionGroup(pg, firestore.collectionGroup('contract-metrics'), 'user_contract_metrics', (_) => true, 2500);
    if (shouldImport('user_follows'))
        await importCollectionGroup(pg, firestore.collectionGroup('follows'), 'user_follows', (c) => { var _a; return ((_a = c.ref.parent.parent) === null || _a === void 0 ? void 0 : _a.parent.path) === 'users'; }, 5000);
    if (shouldImport('user_reactions'))
        await importCollectionGroup(pg, firestore.collectionGroup('reactions'), 'user_reactions', (_) => true, 2500);
    if (shouldImport('user_events'))
        await importAppendOnlyCollectionGroup(pg, firestore.collectionGroup('events'), 'user_events', (c) => { var _a; return ((_a = c.ref.parent.parent) === null || _a === void 0 ? void 0 : _a.parent.path) === 'users'; }, 2500, timeChunk, startTime);
    if (shouldImport('user_seen_markets'))
        await importCollectionGroup(pg, firestore.collectionGroup('seenMarkets'), 'user_seen_markets', (_) => true, 2500);
    if (shouldImport('contracts'))
        await importCollection(pg, firestore.collection('contracts'), 'contracts', 500);
    if (shouldImport('contract_answers'))
        await importCollectionGroup(pg, firestore.collectionGroup('answers'), 'contract_answers', (_) => true, 2500);
    if (shouldImport('contract_bets'))
        await importCollectionGroup(pg, firestore.collectionGroup('bets'), 'contract_bets', (_) => true, 2500);
    if (shouldImport('contract_comments'))
        await importCollectionGroup(pg, firestore.collectionGroup('comments'), 'contract_comments', (c) => c.get('commentType') === 'contract', 500);
    if (shouldImport('contract_follows'))
        await importCollectionGroup(pg, firestore.collectionGroup('follows'), 'contract_follows', (c) => { var _a; return ((_a = c.ref.parent.parent) === null || _a === void 0 ? void 0 : _a.parent.path) == 'contracts'; }, 5000);
    if (shouldImport('contract_liquidity'))
        await importCollectionGroup(pg, firestore.collectionGroup('liquidity'), 'contract_liquidity', (_) => true, 2500);
    if (shouldImport('groups'))
        await importCollection(pg, firestore.collection('groups'), 'groups', 500);
    if (shouldImport('group_contracts'))
        await importCollectionGroup(pg, firestore.collectionGroup('groupContracts'), 'group_contracts', (_) => true, 5000);
    if (shouldImport('group_members'))
        await importCollectionGroup(pg, firestore.collectionGroup('groupMembers'), 'group_members', (_) => true, 5000);
    if (shouldImport('txns'))
        await importAppendOnlyCollectionGroup(pg, firestore.collectionGroup('txns'), 'txns', (_) => true, 2500, timeChunk, startTime, 'createdTime');
    if (shouldImport('manalinks'))
        await importCollection(pg, firestore.collection('manalinks'), 'manalinks', 2500);
    if (shouldImport('posts'))
        await importCollection(pg, firestore.collection('posts'), 'posts', 100);
}
if (require.main === module) {
    (0, script_init_1.initAdmin)();
    commander_1.program.requiredOption('-t, --tables <tables>', '(Required) Comma-separated list of tables to import');
    commander_1.program.option('-ts, --timestamp <timestamp>', 'Timestamp to start append only import, (user_events, user_portfolio_history, and txns)', parseInt);
    commander_1.program.option('-c, --chunk <chunk>', 'Fraction of a day to chunk append only imports by, (user_events, user_portfolio_history, and txns)', parseFloat);
    commander_1.program.parse(process.argv);
    const options = commander_1.program.opts();
    const { timestamp, chunk } = options;
    const tables = options.tables.split(',');
    (0, utils_1.log)('Importing tables:', tables);
    if (timestamp != null)
        (0, utils_1.log)('Starting at timestamp:', timestamp);
    if (chunk != null)
        (0, utils_1.log)('Chunking by:', chunk, 'day(s)');
    importDatabase(tables, timestamp, chunk)
        .then(() => {
        (0, utils_1.log)('Finished importing.');
    })
        .catch((e) => {
        console.error(e);
    });
}
//# sourceMappingURL=supabase-import.js.map