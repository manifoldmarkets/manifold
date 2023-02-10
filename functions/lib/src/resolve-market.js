"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveMarket = exports.resolvemarket = void 0;
const admin = require("firebase-admin");
const zod_1 = require("zod");
const lodash_1 = require("lodash");
const contract_1 = require("../../common/contract");
const utils_1 = require("./utils");
const payouts_1 = require("../../common/payouts");
const constants_1 = require("../../common/envs/constants");
const object_1 = require("../../common/util/object");
const api_1 = require("./api");
const calculate_1 = require("../../common/calculate");
const create_notification_1 = require("./create-notification");
const antes_1 = require("../../common/antes");
const user_contract_metrics_1 = require("./helpers/user-contract-metrics");
const update_contract_metrics_1 = require("./update-contract-metrics");
const run_txn_1 = require("./run-txn");
const bodySchema = zod_1.z.object({
    contractId: zod_1.z.string(),
});
const binarySchema = zod_1.z.object({
    outcome: zod_1.z.enum(contract_1.RESOLUTIONS),
    probabilityInt: zod_1.z.number().gte(0).lte(100).optional(),
});
const freeResponseSchema = zod_1.z.union([
    zod_1.z.object({
        outcome: zod_1.z.literal('CANCEL'),
    }),
    zod_1.z.object({
        outcome: zod_1.z.literal('MKT'),
        resolutions: zod_1.z.array(zod_1.z.object({
            answer: zod_1.z.number().int().nonnegative(),
            pct: zod_1.z.number().gte(0).lte(100),
        })),
    }),
    zod_1.z.object({
        outcome: zod_1.z.number().int().nonnegative(),
    }),
]);
const numericSchema = zod_1.z.object({
    outcome: zod_1.z.union([zod_1.z.literal('CANCEL'), zod_1.z.string()]),
    value: zod_1.z.number().optional(),
});
const pseudoNumericSchema = zod_1.z.union([
    zod_1.z.object({
        outcome: zod_1.z.literal('CANCEL'),
    }),
    zod_1.z.object({
        outcome: zod_1.z.literal('MKT'),
        value: zod_1.z.number(),
        probabilityInt: zod_1.z.number().gte(0).lte(100),
    }),
]);
const opts = { secrets: ['MAILGUN_KEY', 'API_SECRET'] };
exports.resolvemarket = (0, api_1.newEndpoint)(opts, async (req, auth) => {
    const { contractId } = (0, api_1.validate)(bodySchema, req.body);
    const contractDoc = firestore.doc(`contracts/${contractId}`);
    const contractSnap = await contractDoc.get();
    if (!contractSnap.exists)
        throw new api_1.APIError(404, 'No contract exists with the provided ID');
    const contract = contractSnap.data();
    const { creatorId } = contract;
    const firebaseUser = await admin.auth().getUser(auth.uid);
    const resolutionParams = getResolutionParams(contract, req.body);
    if (creatorId !== auth.uid &&
        !(0, constants_1.isManifoldId)(auth.uid) &&
        !(0, constants_1.isAdmin)(firebaseUser.email))
        throw new api_1.APIError(403, 'User is not creator of contract');
    if (contract.resolution)
        throw new api_1.APIError(400, 'Contract already resolved');
    const creator = await (0, utils_1.getUser)(creatorId);
    if (!creator)
        throw new api_1.APIError(500, 'Creator not found');
    return await (0, exports.resolveMarket)(contract, creator, resolutionParams);
});
const resolveMarket = async (unresolvedContract, creator, { value, resolutions, probabilityInt, outcome }) => {
    const { creatorId, closeTime, id: contractId } = unresolvedContract;
    const resolutionProbability = probabilityInt !== undefined ? probabilityInt / 100 : undefined;
    const resolutionProbs = resolutions
        ? (() => {
            const total = (0, lodash_1.sum)(Object.values(resolutions));
            return (0, lodash_1.mapValues)(resolutions, (p) => p / total);
        })()
        : undefined;
    const resolutionTime = Date.now();
    const newCloseTime = closeTime
        ? Math.min(closeTime, resolutionTime)
        : closeTime;
    const betsSnap = await firestore
        .collection(`contracts/${contractId}/bets`)
        .get();
    const bets = betsSnap.docs.map((doc) => doc.data());
    const liquiditiesSnap = await firestore
        .collection(`contracts/${contractId}/liquidity`)
        .get();
    const liquidities = liquiditiesSnap.docs.map((doc) => doc.data());
    const { payouts: traderPayouts, creatorPayout, liquidityPayouts, collectedFees, } = (0, payouts_1.getPayouts)(outcome, unresolvedContract, bets, liquidities, resolutionProbs, resolutionProbability);
    let contract = Object.assign(Object.assign(Object.assign({}, unresolvedContract), (0, object_1.removeUndefinedProps)({
        isResolved: true,
        resolution: outcome,
        resolutionValue: value,
        resolutionTime,
        closeTime: newCloseTime,
        resolutionProbability,
        resolutions,
        collectedFees,
    })), { subsidyPool: 0 });
    const updates = await (0, update_contract_metrics_1.computeContractMetricUpdates)(contract, Date.now());
    contract = Object.assign(Object.assign({}, contract), updates);
    const openBets = bets.filter((b) => !b.isSold && !b.sale);
    const loanPayouts = (0, payouts_1.getLoanPayouts)(openBets);
    const payoutsWithoutLoans = [
        { userId: creatorId, payout: creatorPayout, deposit: creatorPayout },
        ...liquidityPayouts.map((p) => (Object.assign(Object.assign({}, p), { deposit: p.payout }))),
        ...traderPayouts,
    ];
    const payouts = [...payoutsWithoutLoans, ...loanPayouts];
    if (!(0, utils_1.isProd)())
        console.log('trader payouts:', traderPayouts, 'creator payout:', creatorPayout, 'liquidity payout:', liquidityPayouts, 'loan payouts:', loanPayouts);
    // Should we combine all the payouts into one txn?
    const contractDoc = firestore.doc(`contracts/${contractId}`);
    await (0, utils_1.payUsersTransactions)(payouts, contractId);
    await contractDoc.update(contract);
    console.log('contract ', contractId, 'resolved to:', outcome);
    await (0, user_contract_metrics_1.updateContractMetricsForUsers)(contract, bets);
    await undoUniqueBettorRewardsIfCancelResolution(contract, outcome);
    await (0, utils_1.revalidateStaticProps)((0, utils_1.getContractPath)(contract));
    const userPayoutsWithoutLoans = (0, payouts_1.groupPayoutsByUser)(payoutsWithoutLoans);
    const userInvestments = (0, lodash_1.mapValues)((0, lodash_1.groupBy)(bets, (bet) => bet.userId), (bets) => (0, calculate_1.getContractBetMetrics)(contract, bets).invested);
    await (0, create_notification_1.createContractResolvedNotifications)(contract, creator, outcome, probabilityInt, value, {
        bets,
        userInvestments,
        userPayouts: userPayoutsWithoutLoans,
        creator,
        creatorPayout,
        contract,
        outcome,
        resolutionProbability,
        resolutions,
    });
    return contract;
};
exports.resolveMarket = resolveMarket;
function getResolutionParams(contract, body) {
    const { outcomeType } = contract;
    if (outcomeType === 'NUMERIC') {
        return Object.assign(Object.assign({}, (0, api_1.validate)(numericSchema, body)), { resolutions: undefined, probabilityInt: undefined });
    }
    else if (outcomeType === 'PSEUDO_NUMERIC') {
        return Object.assign(Object.assign({}, (0, api_1.validate)(pseudoNumericSchema, body)), { resolutions: undefined });
    }
    else if (outcomeType === 'FREE_RESPONSE' ||
        outcomeType === 'MULTIPLE_CHOICE') {
        const freeResponseParams = (0, api_1.validate)(freeResponseSchema, body);
        const { outcome } = freeResponseParams;
        switch (outcome) {
            case 'CANCEL':
                return {
                    outcome: outcome.toString(),
                    resolutions: undefined,
                    value: undefined,
                    probabilityInt: undefined,
                };
            case 'MKT': {
                const { resolutions } = freeResponseParams;
                resolutions.forEach(({ answer }) => validateAnswer(contract, answer));
                const pctSum = (0, lodash_1.sumBy)(resolutions, ({ pct }) => pct);
                if (Math.abs(pctSum - 100) > 0.1) {
                    throw new api_1.APIError(400, 'Resolution percentages must sum to 100');
                }
                return {
                    outcome: outcome.toString(),
                    resolutions: Object.fromEntries(resolutions.map((r) => [r.answer, r.pct])),
                    value: undefined,
                    probabilityInt: undefined,
                };
            }
            default: {
                validateAnswer(contract, outcome);
                return {
                    outcome: outcome.toString(),
                    resolutions: undefined,
                    value: undefined,
                    probabilityInt: undefined,
                };
            }
        }
    }
    else if (outcomeType === 'BINARY') {
        return Object.assign(Object.assign({}, (0, api_1.validate)(binarySchema, body)), { value: undefined, resolutions: undefined });
    }
    throw new api_1.APIError(500, `Invalid outcome type: ${outcomeType}`);
}
function validateAnswer(contract, answer) {
    const validIds = contract.answers.map((a) => a.id);
    if (!validIds.includes(answer.toString())) {
        throw new api_1.APIError(400, `${answer} is not a valid answer ID`);
    }
}
async function undoUniqueBettorRewardsIfCancelResolution(contract, outcome) {
    var _a;
    if (outcome === 'CANCEL') {
        const creatorsBonusTxns = await (0, utils_1.getValues)(firestore
            .collection('txns')
            .where('category', '==', 'UNIQUE_BETTOR_BONUS')
            .where('toId', '==', contract.creatorId));
        const bonusTxnsOnThisContract = creatorsBonusTxns.filter((txn) => txn.data && txn.data.contractId === contract.id);
        (0, utils_1.log)('total bonusTxnsOnThisContract', bonusTxnsOnThisContract.length);
        const totalBonusAmount = (0, lodash_1.sumBy)(bonusTxnsOnThisContract, (txn) => txn.amount);
        (0, utils_1.log)('totalBonusAmount to be withdrawn', totalBonusAmount);
        const result = await firestore.runTransaction(async (trans) => {
            const bonusTxn = {
                fromId: contract.creatorId,
                fromType: 'USER',
                toId: (0, utils_1.isProd)()
                    ? antes_1.HOUSE_LIQUIDITY_PROVIDER_ID
                    : antes_1.DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
                toType: 'BANK',
                amount: totalBonusAmount,
                token: 'M$',
                category: 'CANCEL_UNIQUE_BETTOR_BONUS',
                data: {
                    contractId: contract.id,
                },
            };
            return await (0, run_txn_1.runTxn)(trans, bonusTxn);
        });
        if (result.status != 'success' || !result.txn) {
            (0, utils_1.log)(`Couldn't cancel bonus for user: ${contract.creatorId} - status:`, result.status);
            (0, utils_1.log)('message:', result.message);
        }
        else {
            (0, utils_1.log)(`Cancel Bonus txn for user: ${contract.creatorId} completed:`, (_a = result.txn) === null || _a === void 0 ? void 0 : _a.id);
        }
    }
}
const firestore = admin.firestore();
//# sourceMappingURL=resolve-market.js.map