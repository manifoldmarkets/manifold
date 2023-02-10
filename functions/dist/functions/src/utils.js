"use strict";
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.contractUrl = exports.getContractPath = exports.payUsersTransactions = exports.payUsers = exports.payUser = exports.getUserByUsername = exports.getAllUsers = exports.getAllPrivateUsers = exports.getPrivateUser = exports.getUser = exports.getPost = exports.getGroup = exports.getContract = exports.getValues = exports.getValue = exports.getDoc = exports.isProd = exports.tryOrLogError = exports.processPartitioned = exports.processPaginated = exports.loadPaginated = exports.writeAsync = exports.revalidateStaticProps = exports.invokeFunction = exports.htmlToRichText = exports.logMemory = exports.log = void 0;
const admin = require("firebase-admin");
const node_fetch_1 = require("node-fetch");
const firestore_1 = require("firebase-admin/firestore");
const lodash_1 = require("lodash");
const html_1 = require("@tiptap/html");
const parse_1 = require("../../common/util/parse");
const api_1 = require("../../common/api");
const run_txn_1 = require("./run-txn");
const log = (...args) => {
    console.log(`[${new Date().toISOString()}]`, ...args);
};
exports.log = log;
const logMemory = () => {
    const used = process.memoryUsage();
    for (const [k, v] of Object.entries(used)) {
        (0, exports.log)(`${k} ${Math.round((v / 1024 / 1024) * 100) / 100} MB`);
    }
};
exports.logMemory = logMemory;
function htmlToRichText(html) {
    return (0, html_1.generateJSON)(html, parse_1.extensions);
}
exports.htmlToRichText = htmlToRichText;
const invokeFunction = async (name, body) => {
    const response = await (0, node_fetch_1.default)((0, api_1.getFunctionUrl)(name), {
        headers: {
            'Content-Type': 'application/json',
        },
        method: 'POST',
        body: JSON.stringify(body !== null && body !== void 0 ? body : {}),
    });
    const json = await response.json();
    if (response.ok) {
        return json;
    }
    else {
        throw new Error(`${response.status} invoking ${name}: ${JSON.stringify(json)}`);
    }
};
exports.invokeFunction = invokeFunction;
const revalidateStaticProps = async (
// Path after domain: e.g. "/JamesGrugett/will-pete-buttigieg-ever-be-us-pres"
pathToRevalidate) => {
    if ((0, exports.isProd)()) {
        const apiSecret = process.env.API_SECRET;
        if (!apiSecret)
            throw new Error('Revalidation failed because of missing API_SECRET.');
        const queryStr = `?pathToRevalidate=${pathToRevalidate}&apiSecret=${apiSecret}`;
        const { ok } = await (0, node_fetch_1.default)('https://manifold.markets/api/v0/revalidate' + queryStr);
        if (!ok)
            throw new Error('Error revalidating: ' + queryStr);
        console.log('Revalidated', pathToRevalidate);
    }
};
exports.revalidateStaticProps = revalidateStaticProps;
const writeAsync = async (db, updates, operationType = 'update', batchSize = 500 // 500 = Firestore batch limit
) => {
    const chunks = (0, lodash_1.chunk)(updates, batchSize);
    for (let i = 0; i < chunks.length; i++) {
        (0, exports.log)(`${i * batchSize}/${updates.length} updates written...`);
        const batch = db.batch();
        for (const { doc, fields } of chunks[i]) {
            if (operationType === 'update') {
                batch.update(doc, fields);
            }
            else {
                batch.set(doc, fields);
            }
        }
        await batch.commit();
    }
};
exports.writeAsync = writeAsync;
const loadPaginated = async (q, batchSize = 500) => {
    const results = [];
    let prev;
    for (let i = 0; prev == undefined || prev.size > 0; i++) {
        prev = await (prev == undefined
            ? q.limit(batchSize)
            : q.limit(batchSize).startAfter(prev.docs[prev.size - 1])).get();
        results.push(...prev.docs.map((d) => d.data()));
    }
    return results;
};
exports.loadPaginated = loadPaginated;
const processPaginated = async (q, batchSize, fn) => {
    const results = [];
    let prev;
    let processed = 0;
    for (let i = 0; prev == null || prev.size > 0; i++) {
        (0, exports.log)(`Loading next page.`);
        prev = await (prev == null
            ? q.limit(batchSize)
            : q.limit(batchSize).startAfter(prev.docs[prev.size - 1])).get();
        (0, exports.log)(`Loaded ${prev.size} documents.`);
        processed += prev.size;
        results.push(await fn(prev));
        (0, exports.log)(`Processed ${prev.size} documents. Total: ${processed}`);
    }
    return results;
};
exports.processPaginated = processPaginated;
const processPartitioned = async (group, partitions, fn) => {
    var _a, e_1, _b, _c;
    const logProgress = (i, msg) => {
        (0, exports.log)(`[${i + 1}/~${partitions}] ${msg}`);
    };
    const parts = group.getPartitions(partitions);
    const results = [];
    let i = 0;
    let docsProcessed = 0;
    let currentlyProcessing;
    try {
        for (var _d = true, parts_1 = __asyncValues(parts), parts_1_1; parts_1_1 = await parts_1.next(), _a = parts_1_1.done, !_a;) {
            _c = parts_1_1.value;
            _d = false;
            try {
                const part = _c;
                logProgress(i, 'Loading partition.');
                const ts = await part.toQuery().get();
                logProgress(i, `Loaded ${ts.size} documents.`);
                if (currentlyProcessing != null) {
                    results.push(await currentlyProcessing.job);
                    docsProcessed += currentlyProcessing.n;
                    logProgress(currentlyProcessing.i, `Processed ${currentlyProcessing.n} documents: Total: ${docsProcessed}`);
                }
                logProgress(i, `Processing ${ts.size} documents.`);
                currentlyProcessing = { i: i, n: ts.size, job: fn(ts.docs) };
                i++;
            }
            finally {
                _d = true;
            }
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (!_d && !_a && (_b = parts_1.return)) await _b.call(parts_1);
        }
        finally { if (e_1) throw e_1.error; }
    }
    if (currentlyProcessing != null) {
        results.push(await currentlyProcessing.job);
        docsProcessed += currentlyProcessing.n;
        logProgress(currentlyProcessing.i, `Processed ${currentlyProcessing.n} documents: Total: ${docsProcessed}`);
    }
    return results;
};
exports.processPartitioned = processPartitioned;
const tryOrLogError = async (task) => {
    try {
        return await task;
    }
    catch (e) {
        console.error(e);
        return null;
    }
};
exports.tryOrLogError = tryOrLogError;
const isProd = () => {
    return admin.instanceId().app.options.projectId === 'mantic-markets';
};
exports.isProd = isProd;
const getDoc = async (collection, doc) => {
    const snap = await admin.firestore().collection(collection).doc(doc).get();
    return snap.exists ? snap.data() : undefined;
};
exports.getDoc = getDoc;
const getValue = async (ref) => {
    const snap = await ref.get();
    return snap.exists ? snap.data() : undefined;
};
exports.getValue = getValue;
const getValues = async (query) => {
    const snap = await query.get();
    return snap.docs.map((doc) => doc.data());
};
exports.getValues = getValues;
const getContract = (contractId) => {
    return (0, exports.getDoc)('contracts', contractId);
};
exports.getContract = getContract;
const getGroup = (groupId) => {
    return (0, exports.getDoc)('groups', groupId);
};
exports.getGroup = getGroup;
const getPost = (postId) => {
    return (0, exports.getDoc)('posts', postId);
};
exports.getPost = getPost;
const getUser = (userId) => {
    return (0, exports.getDoc)('users', userId);
};
exports.getUser = getUser;
const getPrivateUser = (userId) => {
    return (0, exports.getDoc)('private-users', userId);
};
exports.getPrivateUser = getPrivateUser;
const getAllPrivateUsers = async () => {
    const firestore = admin.firestore();
    const users = await firestore.collection('private-users').get();
    return users.docs.map((doc) => doc.data());
};
exports.getAllPrivateUsers = getAllPrivateUsers;
const getAllUsers = async () => {
    const firestore = admin.firestore();
    const users = await firestore.collection('users').get();
    return users.docs.map((doc) => doc.data());
};
exports.getAllUsers = getAllUsers;
const getUserByUsername = async (username) => {
    const firestore = admin.firestore();
    const snap = await firestore
        .collection('users')
        .where('username', '==', username)
        .get();
    return snap.empty ? undefined : snap.docs[0].data();
};
exports.getUserByUsername = getUserByUsername;
const updateUserBalance = (transaction, userId, balanceDelta, depositDelta) => {
    const firestore = admin.firestore();
    const userDoc = firestore.doc(`users/${userId}`);
    // Note: Balance is allowed to go negative.
    transaction.update(userDoc, {
        balance: firestore_1.FieldValue.increment(balanceDelta),
        totalDeposits: firestore_1.FieldValue.increment(depositDelta),
    });
};
const payUser = (userId, payout, isDeposit = false) => {
    if (!isFinite(payout))
        throw new Error('Payout is not finite: ' + payout);
    const firestore = admin.firestore();
    return firestore.runTransaction(async (transaction) => {
        updateUserBalance(transaction, userId, payout, isDeposit ? payout : 0);
    });
};
exports.payUser = payUser;
const checkAndMergePayouts = (payouts) => {
    for (const { payout, deposit } of payouts) {
        if (!isFinite(payout)) {
            throw new Error('Payout is not finite: ' + payout);
        }
        if (deposit !== undefined && !isFinite(deposit)) {
            throw new Error('Deposit is not finite: ' + deposit);
        }
    }
    const groupedPayouts = (0, lodash_1.groupBy)(payouts, 'userId');
    return Object.values((0, lodash_1.mapValues)(groupedPayouts, (payouts, userId) => ({
        userId,
        payout: (0, lodash_1.sumBy)(payouts, 'payout'),
        deposit: (0, lodash_1.sumBy)(payouts, (p) => { var _a; return (_a = p.deposit) !== null && _a !== void 0 ? _a : 0; }),
    })));
};
// Max 500 users in one transaction.
const payUsers = (transaction, payouts) => {
    const mergedPayouts = checkAndMergePayouts(payouts);
    for (const { userId, payout, deposit } of mergedPayouts) {
        updateUserBalance(transaction, userId, payout, deposit);
    }
};
exports.payUsers = payUsers;
const payUsersTransactions = async (payouts, contractId) => {
    const firestore = admin.firestore();
    const mergedPayouts = checkAndMergePayouts(payouts);
    const payoutChunks = (0, lodash_1.chunk)(mergedPayouts, 500);
    for (const payoutChunk of payoutChunks) {
        await firestore.runTransaction(async (transaction) => {
            payoutChunk.forEach(({ userId, payout, deposit }) => {
                const payoutTxn = {
                    category: 'CONTRACT_RESOLUTION_PAYOUT',
                    fromType: 'CONTRACT',
                    fromId: contractId,
                    toType: 'USER',
                    toId: userId,
                    amount: payout,
                    token: 'M$',
                    description: 'Contract payout for resolution: ' + contractId,
                };
                (0, run_txn_1.runContractPayoutTxn)(transaction, payoutTxn, deposit !== null && deposit !== void 0 ? deposit : 0);
            });
        });
    }
};
exports.payUsersTransactions = payUsersTransactions;
const getContractPath = (contract) => {
    return `/${contract.creatorUsername}/${contract.slug}`;
};
exports.getContractPath = getContractPath;
function contractUrl(contract) {
    return `https://manifold.markets/${contract.creatorUsername}/${contract.slug}`;
}
exports.contractUrl = contractUrl;
//# sourceMappingURL=utils.js.map