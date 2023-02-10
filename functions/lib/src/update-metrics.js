"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateMetricsCore = exports.updateMetrics = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const lodash_1 = require("lodash");
const utils_1 = require("./utils");
const time_1 = require("../../common/util/time");
const loans_1 = require("../../common/loans");
const scoring_1 = require("../../common/scoring");
const calculate_metrics_1 = require("../../common/calculate-metrics");
const calculate_1 = require("../../common/calculate");
const firestore = admin.firestore();
exports.updateMetrics = functions
    .runWith({ memory: '2GB', timeoutSeconds: 540 })
    .pubsub.schedule('every 15 minutes')
    .onRun(updateMetricsCore);
async function updateMetricsCore() {
    const [users, contracts, bets, allPortfolioHistories, groups] = await Promise.all([
        (0, utils_1.getValues)(firestore.collection('users')),
        (0, utils_1.getValues)(firestore.collection('contracts')),
        (0, utils_1.getValues)(firestore.collectionGroup('bets')),
        (0, utils_1.getValues)(firestore
            .collectionGroup('portfolioHistory')
            .where('timestamp', '>', Date.now() - 31 * time_1.DAY_MS) // so it includes just over a month ago
        ),
        (0, utils_1.getValues)(firestore.collection('groups')),
    ]);
    const contractsByGroup = await Promise.all(groups.map((group) => {
        return (0, utils_1.getValues)(firestore
            .collection('groups')
            .doc(group.id)
            .collection('groupContracts'));
    }));
    (0, utils_1.log)(`Loaded ${users.length} users, ${contracts.length} contracts, and ${bets.length} bets.`);
    (0, utils_1.logMemory)();
    const now = Date.now();
    const betsByContract = (0, lodash_1.groupBy)(bets, (bet) => bet.contractId);
    const contractUpdates = contracts
        .filter((contract) => contract.id)
        .map((contract) => {
        var _a;
        const contractBets = (_a = betsByContract[contract.id]) !== null && _a !== void 0 ? _a : [];
        const descendingBets = (0, lodash_1.sortBy)(contractBets, (bet) => bet.createdTime).reverse();
        let cpmmFields = {};
        if (contract.mechanism === 'cpmm-1') {
            const prob = descendingBets[0]
                ? descendingBets[0].probAfter
                : (0, calculate_1.getProbability)(contract);
            cpmmFields = {
                prob,
                probChanges: (0, calculate_metrics_1.calculateProbChanges)(descendingBets),
            };
        }
        return {
            doc: firestore.collection('contracts').doc(contract.id),
            fields: Object.assign({ volume24Hours: (0, calculate_metrics_1.computeVolume)(contractBets, now - time_1.DAY_MS), volume7Days: (0, calculate_metrics_1.computeVolume)(contractBets, now - time_1.DAY_MS * 7) }, cpmmFields),
        };
    });
    await (0, utils_1.writeAsync)(firestore, contractUpdates);
    (0, utils_1.log)(`Updated metrics for ${contracts.length} contracts.`);
    const contractsById = Object.fromEntries(contracts.map((contract) => [contract.id, contract]));
    const contractsByUser = (0, lodash_1.groupBy)(contracts, (contract) => contract.creatorId);
    const betsByUser = (0, lodash_1.groupBy)(bets, (bet) => bet.userId);
    const portfolioHistoryByUser = (0, lodash_1.groupBy)(allPortfolioHistories, (p) => p.userId);
    const userMetrics = users.map((user) => {
        var _a, _b, _c;
        const currentBets = (_a = betsByUser[user.id]) !== null && _a !== void 0 ? _a : [];
        const portfolioHistory = (_b = portfolioHistoryByUser[user.id]) !== null && _b !== void 0 ? _b : [];
        const userContracts = (_c = contractsByUser[user.id]) !== null && _c !== void 0 ? _c : [];
        const newCreatorVolume = (0, calculate_metrics_1.calculateCreatorVolume)(userContracts);
        const newPortfolio = (0, calculate_metrics_1.calculateNewPortfolioMetrics)(user, contractsById, currentBets);
        const lastPortfolio = (0, lodash_1.last)(portfolioHistory);
        const didPortfolioChange = lastPortfolio === undefined ||
            lastPortfolio.balance !== newPortfolio.balance ||
            lastPortfolio.totalDeposits !== newPortfolio.totalDeposits ||
            lastPortfolio.investmentValue !== newPortfolio.investmentValue;
        const newProfit = (0, calculate_metrics_1.calculateNewProfit)(portfolioHistory, newPortfolio);
        return {
            user,
            newCreatorVolume,
            newPortfolio,
            newProfit,
            didPortfolioChange,
        };
    });
    const portfolioByUser = Object.fromEntries(userMetrics.map(({ user, newPortfolio }) => [user.id, newPortfolio]));
    const { userPayouts } = (0, loans_1.getLoanUpdates)(users, contractsById, portfolioByUser, betsByUser);
    const nextLoanByUser = (0, lodash_1.keyBy)(userPayouts, (payout) => payout.user.id);
    const userUpdates = userMetrics.map(({ user, newCreatorVolume, newPortfolio, newProfit, didPortfolioChange, }) => {
        var _a, _b;
        const nextLoanCached = (_b = (_a = nextLoanByUser[user.id]) === null || _a === void 0 ? void 0 : _a.payout) !== null && _b !== void 0 ? _b : 0;
        return {
            fieldUpdates: {
                doc: firestore.collection('users').doc(user.id),
                fields: {
                    creatorVolumeCached: newCreatorVolume,
                    profitCached: newProfit,
                    nextLoanCached,
                },
            },
            subcollectionUpdates: {
                doc: firestore
                    .collection('users')
                    .doc(user.id)
                    .collection('portfolioHistory')
                    .doc(),
                fields: didPortfolioChange ? newPortfolio : {},
            },
        };
    });
    await (0, utils_1.writeAsync)(firestore, userUpdates.map((u) => u.fieldUpdates));
    await (0, utils_1.writeAsync)(firestore, userUpdates
        .filter((u) => !(0, lodash_1.isEmpty)(u.subcollectionUpdates.fields))
        .map((u) => u.subcollectionUpdates), 'set');
    (0, utils_1.log)(`Updated metrics for ${users.length} users.`);
    try {
        const groupUpdates = groups.map((group, index) => {
            const groupContractIds = contractsByGroup[index];
            const groupContracts = groupContractIds
                .map((e) => contractsById[e.contractId])
                .filter((e) => e !== undefined);
            const bets = groupContracts.map((e) => {
                var _a;
                if (e != null && e.id in betsByContract) {
                    return (_a = betsByContract[e.id]) !== null && _a !== void 0 ? _a : [];
                }
                else {
                    return [];
                }
            });
            const creatorScores = (0, scoring_1.scoreCreators)(groupContracts);
            const traderScores = (0, scoring_1.scoreTraders)(groupContracts, bets);
            const topTraderScores = topUserScores(traderScores);
            const topCreatorScores = topUserScores(creatorScores);
            return {
                doc: firestore.collection('groups').doc(group.id),
                fields: {
                    cachedLeaderboard: {
                        topTraders: topTraderScores,
                        topCreators: topCreatorScores,
                    },
                },
            };
        });
        await (0, utils_1.writeAsync)(firestore, groupUpdates);
    }
    catch (e) {
        console.log('Error While Updating Group Leaderboards', e);
    }
}
exports.updateMetricsCore = updateMetricsCore;
const topUserScores = (scores) => {
    const top50 = Object.entries(scores)
        .sort(([, scoreA], [, scoreB]) => scoreB - scoreA)
        .slice(0, 50);
    return top50.map(([userId, score]) => ({ userId, score }));
};
//# sourceMappingURL=update-metrics.js.map