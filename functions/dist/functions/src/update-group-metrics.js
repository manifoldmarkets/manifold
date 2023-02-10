"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateGroupMetrics = exports.updategroupmetrics = exports.scheduleUpdateGroupMetrics = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const lodash_1 = require("lodash");
const utils_1 = require("./utils");
const promise_1 = require("../../common/util/promise");
const api_1 = require("./api");
const utils_2 = require("./utils");
const firestore = admin.firestore();
exports.scheduleUpdateGroupMetrics = functions.pubsub
    .schedule('every 15 minutes')
    .onRun(async () => {
    try {
        console.log(await (0, utils_2.invokeFunction)('updategroupmetrics'));
    }
    catch (e) {
        console.error(e);
    }
});
exports.updategroupmetrics = (0, api_1.newEndpointNoAuth)({ timeoutSeconds: 2000, memory: '8GiB', minInstances: 0 }, async (_req) => {
    await updateGroupMetrics();
    return { success: true };
});
async function updateGroupMetrics() {
    (0, utils_1.log)('Loading groups...');
    const groups = await firestore.collection('groups').select().get();
    (0, utils_1.log)(`Loaded ${groups.size} groups.`);
    (0, utils_1.log)('Loading group-contract associations...');
    const groupContractDocs = await firestore
        .collectionGroup('groupContracts')
        .get();
    const contractIdsByGroupId = (0, lodash_1.mapValues)((0, lodash_1.groupBy)(groupContractDocs.docs, (d) => d.ref.path.split('/')[1] // groups/foo/groupContracts/bar
    ), (ds) => ds.map((d) => d.get('contractId')));
    (0, utils_1.log)(`Loaded ${groupContractDocs.size} associations.`);
    (0, utils_1.log)('Loading contracts...');
    const contractIds = (0, lodash_1.uniq)(groupContractDocs.docs.map((d) => d.get('contractId')));
    const contractsById = Object.fromEntries((await loadContracts(contractIds)).map((c) => [c.id, c]));
    (0, utils_1.log)(`Loaded ${contractIds.length} contracts.`);
    (0, utils_1.log)('Computing metric updates...');
    const writer = firestore.bulkWriter();
    await (0, promise_1.mapAsync)(groups.docs, async (doc) => {
        var _a;
        const contractIds = (_a = contractIdsByGroupId[doc.id]) !== null && _a !== void 0 ? _a : [];
        const contracts = contractIds.map((c) => contractsById[c]);
        const creatorScores = scoreCreators(contracts);
        const traderScores = await scoreTraders(contractIds);
        const topTraderScores = topUserScores(traderScores);
        const topCreatorScores = topUserScores(creatorScores);
        writer.update(doc.ref, {
            cachedLeaderboard: {
                topTraders: topTraderScores,
                topCreators: topCreatorScores,
            },
        });
    });
    (0, utils_1.log)('Committing writes...');
    await writer.close();
    (0, utils_1.log)('Done.');
}
exports.updateGroupMetrics = updateGroupMetrics;
function scoreCreators(contracts) {
    if (contracts.length === 0) {
        return {};
    }
    const creatorScore = (0, lodash_1.mapValues)((0, lodash_1.groupBy)(contracts, ({ creatorId }) => creatorId), (contracts) => (0, lodash_1.sumBy)(contracts.map((contract) => {
        var _a;
        return (_a = contract === null || contract === void 0 ? void 0 : contract.uniqueBettorCount) !== null && _a !== void 0 ? _a : 0;
    })));
    return creatorScore;
}
async function scoreTraders(contractIds) {
    if (contractIds.length === 0) {
        return {};
    }
    const userScoresByContract = await (0, promise_1.mapAsync)(contractIds, (c) => scoreUsersByContract(c));
    const userScores = {};
    for (const scores of userScoresByContract) {
        addUserScores(scores, userScores);
    }
    return userScores;
}
async function scoreUsersByContract(contractId) {
    const userContractMetrics = await firestore
        .collectionGroup('contract-metrics')
        .where('contractId', '==', contractId)
        .select('profit')
        .get();
    return Object.fromEntries(userContractMetrics.docs.map((d) => {
        const userId = d.ref.path.split('/')[1]; // users/foo/contract-metrics/bar
        const profit = d.get('profit');
        return [userId, profit];
    }));
}
function addUserScores(src, dest) {
    for (const [userId, score] of Object.entries(src)) {
        if (dest[userId] === undefined)
            dest[userId] = 0;
        dest[userId] += score;
    }
}
const topUserScores = (scores) => {
    const top50 = Object.entries(scores)
        .sort(([, scoreA], [, scoreB]) => scoreB - scoreA)
        .slice(0, 50);
    return top50.map(([userId, score]) => ({ userId, score }));
};
async function loadContracts(contractIds) {
    const refs = contractIds.map((c) => firestore.collection('contracts').doc(c));
    const contractDocs = await firestore.getAll(...refs);
    return contractDocs.map((d) => d.data());
}
//# sourceMappingURL=update-group-metrics.js.map