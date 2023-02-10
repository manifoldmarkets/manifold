"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateUserMetrics = exports.updateusermetrics = exports.scheduleUpdateUserMetrics = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const lodash_1 = require("lodash");
const utils_1 = require("./utils");
const time_1 = require("../../common/util/time");
const loans_1 = require("../../common/loans");
const calculate_metrics_1 = require("../../common/calculate-metrics");
const promise_1 = require("../../common/util/promise");
const object_1 = require("../../common/util/object");
const api_1 = require("./api");
const array_1 = require("../../common/util/array");
const firestore = admin.firestore();
exports.scheduleUpdateUserMetrics = functions.pubsub
    .schedule('every 30 minutes')
    .onRun(async () => {
    try {
        console.log(await (0, utils_1.invokeFunction)('updateusermetrics'));
    }
    catch (e) {
        console.error(e);
    }
});
exports.updateusermetrics = (0, api_1.newEndpointNoAuth)({
    timeoutSeconds: 3600,
    memory: '16GiB',
    minInstances: 1,
    secrets: ['API_SECRET', 'SUPABASE_KEY'],
}, async (_req) => {
    await updateUserMetrics();
    return { success: true };
});
async function updateUserMetrics() {
    (0, utils_1.log)('Loading users...');
    const users = await (0, utils_1.loadPaginated)(firestore.collection('users'));
    (0, utils_1.log)(`Loaded ${users.length} users.`);
    (0, utils_1.log)('Loading contracts...');
    const contracts = await (0, utils_1.loadPaginated)(firestore.collection('contracts'));
    const contractsByCreator = (0, lodash_1.groupBy)(contracts, (c) => c.creatorId);
    const contractsById = Object.fromEntries(contracts.map((c) => [c.id, c]));
    (0, utils_1.log)(`Loaded ${contracts.length} contracts.`);
    const now = Date.now();
    const monthAgo = now - time_1.DAY_MS * 30;
    const writer = firestore.bulkWriter();
    // we need to update metrics for contracts that resolved up through a month ago,
    // for the purposes of computing the daily/weekly/monthly profit on them
    const metricEligibleContracts = contracts.filter((c) => c.resolutionTime == null || c.resolutionTime > monthAgo);
    (0, utils_1.log)(`${metricEligibleContracts.length} contracts need metrics updates.`);
    (0, utils_1.log)('Computing metric updates...');
    const userUpdates = await (0, promise_1.mapAsync)(users, async (staleUser) => {
        var _a, _b;
        const user = (_a = (await (0, utils_1.getUser)(staleUser.id))) !== null && _a !== void 0 ? _a : staleUser;
        const userContracts = (_b = contractsByCreator[user.id]) !== null && _b !== void 0 ? _b : [];
        const metricRelevantBets = await loadUserContractBets(user.id, metricEligibleContracts
            .filter((c) => { var _a; return (_a = c.uniqueBettorIds) === null || _a === void 0 ? void 0 : _a.includes(user.id); })
            .map((c) => c.id)).catch((e) => {
            console.error(`Error fetching bets for user ${user.id}: ${e.message}`);
            return undefined;
        });
        if (!metricRelevantBets) {
            return undefined;
        }
        const portfolioHistory = await loadPortfolioHistory(user.id, now);
        const newCreatorTraders = (0, calculate_metrics_1.calculateCreatorTraders)(userContracts);
        const newPortfolio = (0, calculate_metrics_1.calculateNewPortfolioMetrics)(user, contractsById, metricRelevantBets);
        const currPortfolio = portfolioHistory.current;
        const didPortfolioChange = currPortfolio === undefined ||
            currPortfolio.balance !== newPortfolio.balance ||
            currPortfolio.totalDeposits !== newPortfolio.totalDeposits ||
            currPortfolio.investmentValue !== newPortfolio.investmentValue;
        const newProfit = (0, calculate_metrics_1.calculateNewProfit)(portfolioHistory, newPortfolio);
        const metricRelevantBetsByContract = (0, lodash_1.groupBy)(metricRelevantBets, (b) => b.contractId);
        const metricsByContract = (0, calculate_metrics_1.calculateMetricsByContract)(metricRelevantBetsByContract, contractsById, user);
        const nextLoanPayout = (0, loans_1.isUserEligibleForLoan)(newPortfolio)
            ? (0, loans_1.getUserLoanUpdates)(metricRelevantBetsByContract, contractsById).payout
            : undefined;
        const userDoc = firestore.collection('users').doc(user.id);
        if (didPortfolioChange) {
            writer.set(userDoc.collection('portfolioHistory').doc(), newPortfolio);
        }
        const contractMetricsCollection = userDoc.collection('contract-metrics');
        for (const metrics of metricsByContract) {
            writer.set(contractMetricsCollection.doc(metrics.contractId), metrics);
        }
        return {
            user: user,
            fields: {
                creatorTraders: newCreatorTraders,
                profitCached: newProfit,
                nextLoanCached: nextLoanPayout !== null && nextLoanPayout !== void 0 ? nextLoanPayout : 0,
            },
        };
    }, 10);
    for (const { user, fields } of (0, array_1.filterDefined)(userUpdates)) {
        if ((0, object_1.hasChanges)(user, fields)) {
            writer.update(firestore.collection('users').doc(user.id), fields);
        }
    }
    (0, utils_1.log)('Committing writes...');
    await writer.close();
    await (0, utils_1.revalidateStaticProps)('/leaderboards');
    (0, utils_1.log)('Done.');
}
exports.updateUserMetrics = updateUserMetrics;
const loadUserContractBets = async (userId, contractIds) => {
    const bets = [];
    for (const cid of contractIds) {
        bets.push(...(await (0, utils_1.loadPaginated)(firestore
            .collection('contracts')
            .doc(cid)
            .collection('bets')
            .where('userId', '==', userId))));
    }
    return bets;
};
const loadPortfolioHistory = async (userId, now) => {
    const query = firestore
        .collection('users')
        .doc(userId)
        .collection('portfolioHistory')
        .orderBy('timestamp', 'desc')
        .limit(1);
    const portfolioMetrics = await Promise.all([
        (0, utils_1.getValues)(query),
        (0, utils_1.getValues)(query.where('timestamp', '<', now - time_1.DAY_MS)),
        (0, utils_1.getValues)(query.where('timestamp', '<', now - 7 * time_1.DAY_MS)),
        (0, utils_1.getValues)(query.where('timestamp', '<', now - 30 * time_1.DAY_MS)),
    ]);
    const [current, day, week, month] = portfolioMetrics.map((p) => p[0]);
    return {
        current,
        day,
        week,
        month,
    };
};
//# sourceMappingURL=update-user-metrics.js.map