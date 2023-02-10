"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateMakers = exports.getUnfilledBetsAndUserBalances = exports.placebet = void 0;
const admin = require("firebase-admin");
const zod_1 = require("zod");
const firestore_1 = require("firebase-admin/firestore");
const lodash_1 = require("lodash");
const api_1 = require("./api");
const contract_1 = require("../../common/contract");
const fees_1 = require("../../common/fees");
const new_bet_1 = require("../../common/new-bet");
const object_1 = require("../../common/util/object");
const math_1 = require("../../common/util/math");
const redeem_shares_1 = require("./redeem-shares");
const utils_1 = require("./utils");
const array_1 = require("../../common/util/array");
const bodySchema = zod_1.z.object({
    contractId: zod_1.z.string(),
    amount: zod_1.z.number().gte(1),
});
const binarySchema = zod_1.z.object({
    outcome: zod_1.z.enum(['YES', 'NO']),
    limitProb: zod_1.z.number().gte(0).lte(1).optional(),
});
const freeResponseSchema = zod_1.z.object({
    outcome: zod_1.z.string(),
    shortSell: zod_1.z.boolean().optional(),
});
const numericSchema = zod_1.z.object({
    outcome: zod_1.z.string(),
    value: zod_1.z.number(),
});
exports.placebet = (0, api_1.newEndpoint)({ minInstances: 2 }, async (req, auth) => {
    (0, utils_1.log)(`Inside endpoint handler for ${auth.uid}.`);
    const { amount, contractId } = (0, api_1.validate)(bodySchema, req.body);
    const result = await firestore.runTransaction(async (trans) => {
        (0, utils_1.log)(`Inside main transaction for ${auth.uid}.`);
        const contractDoc = firestore.doc(`contracts/${contractId}`);
        const userDoc = firestore.doc(`users/${auth.uid}`);
        const [contractSnap, userSnap] = await trans.getAll(contractDoc, userDoc);
        if (!contractSnap.exists)
            throw new api_1.APIError(400, 'Contract not found.');
        if (!userSnap.exists)
            throw new api_1.APIError(400, 'User not found.');
        const contract = contractSnap.data();
        const user = userSnap.data();
        if (user.balance < amount)
            throw new api_1.APIError(400, 'Insufficient balance.');
        (0, utils_1.log)(`Loaded user ${user.username} with id ${user.id} betting on slug ${contract.slug} with contract id: ${contract.id}.`);
        const { closeTime, outcomeType, mechanism, collectedFees, volume } = contract;
        if (closeTime && Date.now() > closeTime)
            throw new api_1.APIError(400, 'Trading is closed.');
        const { newBet, newPool, newTotalShares, newTotalBets, newTotalLiquidity, newP, makers, ordersToCancel, } = await (async () => {
            if ((outcomeType == 'BINARY' || outcomeType === 'PSEUDO_NUMERIC') &&
                mechanism == 'cpmm-1') {
                // eslint-disable-next-line prefer-const
                let { outcome, limitProb } = (0, api_1.validate)(binarySchema, req.body);
                if (limitProb !== undefined && outcomeType === 'BINARY') {
                    const isRounded = (0, math_1.floatingEqual)(Math.round(limitProb * 100), limitProb * 100);
                    if (!isRounded)
                        throw new api_1.APIError(400, 'limitProb must be in increments of 0.01 (i.e. whole percentage points)');
                    limitProb = Math.round(limitProb * 100) / 100;
                }
                (0, utils_1.log)(`Checking for limit orders in placebet for user ${auth.uid} on contract id ${contractId}.`);
                const { unfilledBets, balanceByUserId } = await (0, exports.getUnfilledBetsAndUserBalances)(trans, contractDoc, auth.uid);
                return (0, new_bet_1.getBinaryCpmmBetInfo)(outcome, amount, contract, limitProb, unfilledBets, balanceByUserId);
            }
            else if (outcomeType === 'MULTIPLE_CHOICE' && mechanism === 'cpmm-2') {
                const { outcome, shortSell } = (0, api_1.validate)(freeResponseSchema, req.body);
                if (isNaN(+outcome) || !contract.answers[+outcome])
                    throw new api_1.APIError(400, 'Invalid answer');
                return (0, new_bet_1.getNewMultiCpmmBetInfo)(contract, outcome, amount, !!shortSell);
            }
            else if ((outcomeType == 'FREE_RESPONSE' || outcomeType === 'MULTIPLE_CHOICE') &&
                mechanism == 'dpm-2') {
                const { outcome } = (0, api_1.validate)(freeResponseSchema, req.body);
                const answerDoc = contractDoc.collection('answers').doc(outcome);
                const answerSnap = await trans.get(answerDoc);
                if (!answerSnap.exists)
                    throw new api_1.APIError(400, 'Invalid answer');
                return (0, new_bet_1.getNewMultiBetInfo)(outcome, amount, contract);
            }
            else if (outcomeType == 'NUMERIC' && mechanism == 'dpm-2') {
                const { outcome, value } = (0, api_1.validate)(numericSchema, req.body);
                return (0, new_bet_1.getNumericBetsInfo)(value, outcome, amount, contract);
            }
            else {
                throw new api_1.APIError(500, 'Contract has invalid type/mechanism.');
            }
        })();
        (0, utils_1.log)(`Calculated new bet information for ${user.username} - auth ${auth.uid}.`);
        if (mechanism == 'cpmm-1' &&
            (!newP ||
                !isFinite(newP) ||
                Math.min(...Object.values(newPool !== null && newPool !== void 0 ? newPool : {})) < contract_1.CPMM_MIN_POOL_QTY)) {
            throw new api_1.APIError(400, 'Trade too large for current liquidity pool.');
        }
        const betDoc = contractDoc.collection('bets').doc();
        trans.create(betDoc, Object.assign({ id: betDoc.id, userId: user.id, userAvatarUrl: user.avatarUrl, userUsername: user.username, userName: user.name }, newBet));
        (0, utils_1.log)(`Created new bet document for ${user.username} - auth ${auth.uid}.`);
        if (makers) {
            (0, exports.updateMakers)(makers, betDoc.id, contractDoc, trans);
        }
        if (ordersToCancel) {
            for (const bet of ordersToCancel) {
                trans.update(contractDoc.collection('bets').doc(bet.id), {
                    isCancelled: true,
                });
            }
        }
        const balanceChange = newBet.amount !== 0
            ? // quick bet
                newBet.amount + fees_1.FLAT_TRADE_FEE
            : // limit order
                fees_1.FLAT_TRADE_FEE;
        trans.update(userDoc, { balance: firestore_1.FieldValue.increment(-balanceChange) });
        (0, utils_1.log)(`Updated user ${user.username} balance - auth ${auth.uid}.`);
        if (newBet.amount !== 0) {
            trans.update(contractDoc, (0, object_1.removeUndefinedProps)({
                pool: newPool,
                p: newP,
                totalShares: newTotalShares,
                totalBets: newTotalBets,
                totalLiquidity: newTotalLiquidity,
                collectedFees: (0, object_1.addObjects)(newBet.fees, collectedFees),
                volume: volume + newBet.amount,
            }));
            (0, utils_1.log)(`Updated contract ${contract.slug} properties - auth ${auth.uid}.`);
        }
        return { contract, betId: betDoc.id, makers, newBet };
    });
    (0, utils_1.log)(`Main transaction finished - auth ${auth.uid}.`);
    const { contract, newBet, makers } = result;
    const { mechanism } = contract;
    if ((mechanism === 'cpmm-1' || mechanism === 'cpmm-2') &&
        newBet.amount !== 0) {
        const userIds = (0, lodash_1.uniq)([
            auth.uid,
            ...(makers !== null && makers !== void 0 ? makers : []).map((maker) => maker.bet.userId),
        ]);
        await Promise.all(userIds.map((userId) => (0, redeem_shares_1.redeemShares)(userId, contract)));
        (0, utils_1.log)(`Share redemption transaction finished - auth ${auth.uid}.`);
    }
    return Object.assign(Object.assign({}, newBet), { betId: result.betId });
});
const firestore = admin.firestore();
const getUnfilledBetsQuery = (contractDoc) => {
    return contractDoc
        .collection('bets')
        .where('isFilled', '==', false)
        .where('isCancelled', '==', false);
};
const getUnfilledBetsAndUserBalances = async (trans, contractDoc, bettorId) => {
    const unfilledBetsSnap = await trans.get(getUnfilledBetsQuery(contractDoc));
    const unfilledBets = unfilledBetsSnap.docs.map((doc) => doc.data());
    // Get balance of all users with open limit orders.
    const userIds = (0, lodash_1.uniq)(unfilledBets.map((bet) => bet.userId));
    const userDocs = userIds.length === 0
        ? []
        : await trans.getAll(...userIds.map((userId) => {
            (0, utils_1.log)(`Bettor ${bettorId} is checking balance of user ${userId} that has limit order on contract ${contractDoc.id}`);
            return firestore.doc(`users/${userId}`);
        }));
    const users = (0, array_1.filterDefined)(userDocs.map((doc) => doc.data()));
    const balanceByUserId = Object.fromEntries(users.map((user) => [user.id, user.balance]));
    return { unfilledBets, balanceByUserId };
};
exports.getUnfilledBetsAndUserBalances = getUnfilledBetsAndUserBalances;
const updateMakers = (makers, takerBetId, contractDoc, trans) => {
    const makersByBet = (0, lodash_1.groupBy)(makers, (maker) => maker.bet.id);
    for (const makers of Object.values(makersByBet)) {
        const bet = makers[0].bet;
        const newFills = makers.map((maker) => {
            const { amount, shares, timestamp } = maker;
            return { amount, shares, matchedBetId: takerBetId, timestamp };
        });
        const fills = [...bet.fills, ...newFills];
        const totalShares = (0, lodash_1.sumBy)(fills, 'shares');
        const totalAmount = (0, lodash_1.sumBy)(fills, 'amount');
        const isFilled = (0, math_1.floatingEqual)(totalAmount, bet.orderAmount);
        (0, utils_1.log)('Updated a matched limit order.');
        trans.update(contractDoc.collection('bets').doc(bet.id), {
            fills,
            isFilled,
            amount: totalAmount,
            shares: totalShares,
        });
    }
    // Deduct balance of makers.
    const spentByUser = (0, lodash_1.mapValues)((0, lodash_1.groupBy)(makers, (maker) => maker.bet.userId), (makers) => (0, lodash_1.sumBy)(makers, (maker) => maker.amount));
    for (const [userId, spent] of Object.entries(spentByUser)) {
        const userDoc = firestore.collection('users').doc(userId);
        trans.update(userDoc, { balance: firestore_1.FieldValue.increment(-spent) });
    }
};
exports.updateMakers = updateMakers;
//# sourceMappingURL=place-bet.js.map