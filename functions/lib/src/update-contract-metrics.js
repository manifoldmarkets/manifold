"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeContractMetricUpdates = exports.updateContractMetrics = exports.updatecontractmetrics = exports.scheduleUpdateContractMetrics = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const lodash_1 = require("lodash");
const utils_1 = require("./utils");
const time_1 = require("../../common/util/time");
const calculate_metrics_1 = require("../../common/calculate-metrics");
const calculate_1 = require("../../common/calculate");
const promise_1 = require("../../common/util/promise");
const object_1 = require("../../common/util/object");
const api_1 = require("./api");
const firestore = admin.firestore();
exports.scheduleUpdateContractMetrics = functions.pubsub
    .schedule('every 15 minutes')
    .onRun(async () => {
    try {
        console.log(await (0, utils_1.invokeFunction)('updatecontractmetrics'));
    }
    catch (e) {
        console.error(e);
    }
});
exports.updatecontractmetrics = (0, api_1.newEndpointNoAuth)({ timeoutSeconds: 2000, memory: '8GiB', minInstances: 0 }, async (_req) => {
    await updateContractMetrics();
    return { success: true };
});
async function updateContractMetrics() {
    (0, utils_1.log)('Loading contracts...');
    const contracts = await (0, utils_1.loadPaginated)(firestore.collection('contracts'));
    (0, utils_1.log)(`Loaded ${contracts.length} contracts.`);
    (0, utils_1.log)('Computing metric updates...');
    const now = Date.now();
    const writer = firestore.bulkWriter();
    await (0, promise_1.mapAsync)(contracts, async (contract) => {
        const update = await (0, exports.computeContractMetricUpdates)(contract, now);
        if ((0, object_1.hasChanges)(contract, update)) {
            const contractDoc = firestore.collection('contracts').doc(contract.id);
            writer.update(contractDoc, update);
        }
    });
    (0, utils_1.log)('Committing writes...');
    await writer.close();
    (0, utils_1.log)('Done.');
}
exports.updateContractMetrics = updateContractMetrics;
const computeContractMetricUpdates = async (contract, now) => {
    const yesterday = now - time_1.DAY_MS;
    const weekAgo = now - 7 * time_1.DAY_MS;
    const monthAgo = now - 30 * time_1.DAY_MS;
    const yesterdayBets = await (0, utils_1.getValues)(firestore
        .collection('contracts')
        .doc(contract.id)
        .collection('bets')
        .orderBy('createdTime', 'desc')
        .where('createdTime', '>=', yesterday)
        .where('isRedemption', '==', false)
        .where('isAnte', '==', false));
    const unfilledBets = await (0, utils_1.getValues)(firestore
        .collection('contracts')
        .doc(contract.id)
        .collection('bets')
        .where('limitProb', '>', 0)
        .where('isFilled', '==', false)
        .where('isCancelled', '==', false));
    let cpmmFields = {};
    if (contract.mechanism === 'cpmm-1') {
        cpmmFields = await computeProbChanges(contract, yesterday, weekAgo, monthAgo);
    }
    const [uniqueBettors24Hours, uniqueBettors7Days, uniqueBettors30Days] = await Promise.all([yesterday, weekAgo, monthAgo].map((t) => getUniqueBettors(contract.id, t)));
    const isClosed = contract.closeTime && contract.closeTime < now;
    return Object.assign({ volume24Hours: (0, lodash_1.sumBy)(yesterdayBets, (b) => Math.abs(b.amount)), elasticity: isClosed ? 0 : (0, calculate_metrics_1.computeElasticity)(unfilledBets, contract), uniqueBettors24Hours,
        uniqueBettors7Days,
        uniqueBettors30Days }, cpmmFields);
};
exports.computeContractMetricUpdates = computeContractMetricUpdates;
const computeProbChanges = async (contract, yesterday, weekAgo, monthAgo) => {
    let prob = (0, calculate_1.getProbability)(contract);
    const { resolution, resolutionProbability } = contract;
    if (resolution === 'YES')
        prob = 1;
    else if (resolution === 'NO')
        prob = 0;
    else if (resolution === 'MKT' && resolutionProbability !== undefined)
        prob = resolutionProbability;
    const [probYesterday, probWeekAgo, probMonthAgo] = await Promise.all([yesterday, weekAgo, monthAgo].map((t) => getProbAt(contract, prob, t)));
    const probChanges = {
        day: prob - probYesterday,
        week: prob - probWeekAgo,
        month: prob - probMonthAgo,
    };
    return { prob, probChanges };
};
const getProbAt = async (contract, currentProb, since) => {
    if (contract.resolutionTime && since >= contract.resolutionTime)
        return currentProb;
    const [betBefore, betAfter] = await getBetsAroundTime(contract.id, since);
    if (betBefore) {
        return betBefore.probAfter;
    }
    else if (betAfter) {
        return betAfter.probBefore;
    }
    else {
        return currentProb; // there are no bets at all
    }
};
async function getBetsAroundTime(contractId, when) {
    const bets = firestore
        .collection('contracts')
        .doc(contractId)
        .collection('bets');
    const beforeQ = bets
        .where('createdTime', '<', when)
        .orderBy('createdTime', 'desc')
        .limit(1);
    const afterQ = bets
        .where('createdTime', '>=', when)
        .orderBy('createdTime', 'asc')
        .limit(1);
    const results = await Promise.all([beforeQ.get(), afterQ.get()]);
    return results.map((d) => { var _a; return (_a = d.docs[0]) === null || _a === void 0 ? void 0 : _a.data(); });
}
async function getUniqueBettors(contractId, since) {
    return (await firestore
        .collectionGroup('contract-metrics')
        .where('contractId', '==', contractId)
        .where('lastBetTime', '>', since)
        .count()
        .get()).data().count;
}
//# sourceMappingURL=update-contract-metrics.js.map