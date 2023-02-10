"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.replayFailedSupabaseWrites = exports.replicatelogtosupabase = exports.replicatelogtofirestore = exports.logContractComments = exports.logContractBets = exports.logContracts = exports.logUsers = exports.logGroups = exports.logTxns = void 0;
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const pubsub_1 = require("firebase-functions/v2/pubsub");
const pubsub_2 = require("@google-cloud/pubsub");
const http_1 = require("http");
const https_1 = require("https");
const utils_1 = require("./utils");
const utils_2 = require("../utils");
const pubSubClient = new pubsub_2.PubSub();
const httpAgent = new http_1.Agent({ keepAlive: true });
const httpsAgent = new https_1.Agent({ keepAlive: true });
const fetch = (0, utils_2.pooledFetch)({ http: httpAgent, https: httpsAgent });
function getWriteInfo(change) {
    const { before, after } = change;
    if (before.exists && after.exists) {
        return { kind: 'update', ref: after.ref, data: after.data() };
    }
    else if (before.exists && !after.exists) {
        return { kind: 'delete', ref: before.ref, data: null };
    }
    else if (!before.exists && after.exists) {
        return { kind: 'create', ref: after.ref, data: after.data() };
    }
    else {
        throw new Error("Mysterious write; can't log.");
    }
}
function getTLEntry(change, context, docKind) {
    const info = getWriteInfo(change);
    return {
        docKind,
        writeKind: info.kind,
        eventId: context.eventId,
        docId: info.ref.id,
        parent: info.ref.parent.path,
        data: info.data,
        ts: Date.parse(context.timestamp).valueOf(),
    };
}
function logger(path, docKind) {
    return functions.firestore.document(path).onWrite((change, ctx) => {
        const entry = getTLEntry(change, ctx, docKind);
        return pubSubClient.topic('firestoreWrite').publishMessage({ json: entry });
    });
}
async function replicateWrites(client, ...entries) {
    return await (0, utils_1.run)(client.from('incoming_writes').insert(entries.map((e) => ({
        event_id: e.eventId,
        doc_kind: e.docKind,
        write_kind: e.writeKind,
        doc_id: e.docId,
        data: e.data,
        ts: new Date(e.ts).toISOString(),
    }))));
}
exports.logTxns = logger('txns/{g}', 'txn');
exports.logGroups = logger('groups/{g}', 'group');
exports.logUsers = logger('users/{u}', 'user');
exports.logContracts = logger('contracts/{c}', 'contract');
exports.logContractBets = logger('contracts/{c}/bets/{b}', 'contractBet');
exports.logContractComments = logger('contracts/{ct}/comments/{co}', 'contractComment');
exports.replicatelogtofirestore = (0, pubsub_1.onMessagePublished)({
    topic: 'firestoreWrite',
    cpu: 2,
    minInstances: 1,
    concurrency: 1000,
    memory: '2GiB',
}, async (event) => {
    const entry = event.data.message.json;
    const db = admin.firestore();
    await db.collection('transactionLog').doc(entry.eventId).create(entry);
});
exports.replicatelogtosupabase = (0, pubsub_1.onMessagePublished)({
    topic: 'firestoreWrite',
    secrets: ['SUPABASE_KEY'],
    cpu: 4,
    minInstances: 1,
    maxInstances: 10,
    concurrency: 1000,
    memory: '2GiB',
}, async (event) => {
    const entry = event.data.message.json;
    try {
        await replicateWrites((0, utils_1.createSupabaseClient)(fetch), entry);
    }
    catch (e) {
        console.error(`Failed to replicate ${entry.docKind} ${entry.docId}. \
        Logging failed write: ${entry.eventId}.`, e);
        const db = admin.firestore();
        await db
            .collection('replicationState')
            .doc('supabase')
            .collection('failedWrites')
            .doc(entry.eventId)
            .create(entry);
    }
});
exports.replayFailedSupabaseWrites = functions
    .runWith({ secrets: ['SUPABASE_KEY'], timeoutSeconds: 540 })
    .pubsub.schedule('every 1 minutes')
    .onRun(async () => {
    const firestore = admin.firestore();
    const failedWrites = firestore
        .collection('replicationState')
        .doc('supabase')
        .collection('failedWrites');
    const client = (0, utils_1.createSupabaseClient)();
    const deleter = firestore.bulkWriter({ throttling: false });
    await (0, utils_2.processPaginated)(failedWrites, 1000, async (snaps) => {
        if (snaps.size > 0) {
            console.log(`Attempting to replay ${snaps.size} write(s)...`);
            const entries = snaps.docs.map((d) => d.data());
            await replicateWrites(client, ...entries);
            for (const doc of snaps.docs) {
                deleter.delete(doc.ref);
            }
        }
        await deleter.flush();
    });
    await deleter.close();
});
//# sourceMappingURL=transaction-log.js.map