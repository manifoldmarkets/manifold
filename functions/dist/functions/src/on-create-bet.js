"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onCreateBet = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const lodash_1 = require("lodash");
const utils_1 = require("./utils");
const create_notification_1 = require("./create-notification");
const array_1 = require("../../common/util/array");
const economy_1 = require("../../common/economy");
const antes_1 = require("../../common/antes");
const time_1 = require("../../common/util/time");
const add_house_subsidy_1 = require("./helpers/add-house-subsidy");
const constants_1 = require("../../common/envs/constants");
const follow_market_1 = require("./follow-market");
const handle_referral_1 = require("./helpers/handle-referral");
const calculate_metrics_1 = require("../../common/calculate-metrics");
const run_txn_1 = require("./run-txn");
const firestore = admin.firestore();
const BONUS_START_DATE = new Date('2022-07-13T15:30:00.000Z').getTime();
exports.onCreateBet = functions
    .runWith({ secrets: ['MAILGUN_KEY', 'API_SECRET'] })
    .firestore.document('contracts/{contractId}/bets/{betId}')
    .onCreate(async (change, context) => {
    const { contractId } = context.params;
    const { eventId } = context;
    const bet = change.data();
    const lastBetTime = bet.createdTime;
    await firestore
        .collection('contracts')
        .doc(contractId)
        .update({ lastBetTime, lastUpdatedTime: Date.now() });
    const contractSnap = await firestore
        .collection(`contracts`)
        .doc(contractId)
        .get();
    const contract = contractSnap.data();
    if (!contract) {
        (0, utils_1.log)(`Could not find contract ${contractId}`);
        return;
    }
    const bettor = await (0, utils_1.getUser)(bet.userId);
    if (!bettor)
        return;
    await change.ref.update({
        userAvatarUrl: bettor.avatarUrl,
        userName: bettor.name,
        userUsername: bettor.username,
    });
    // They may be selling out of a position completely, so only add them if they're buying
    if (bet.amount >= 0 && !bet.isSold)
        await (0, follow_market_1.addUserToContractFollowers)(contractId, bettor.id);
    await updateUniqueBettorsAndGiveCreatorBonus(contract, eventId, bettor);
    await notifyFills(bet, contract, eventId, bettor);
    await updateContractMetrics(contract, bettor);
    // Referrals should always be handled before the betting streak bc they both use lastBetTime
    (0, handle_referral_1.handleReferral)(bettor, eventId).then(async () => {
        await updateBettingStreak(bettor, bet, contract, eventId);
    });
});
const updateBettingStreak = async (user, bet, contract, eventId) => {
    const { newBettingStreak } = await firestore.runTransaction(async (trans) => {
        var _a, _b;
        const userDoc = firestore.collection('users').doc(user.id);
        const bettor = (await trans.get(userDoc)).data();
        const now = Date.now();
        const currentDateResetTime = currentDateBettingStreakResetTime();
        // if now is before reset time, use yesterday's reset time
        const lastDateResetTime = currentDateResetTime - time_1.DAY_MS;
        const betStreakResetTime = now < currentDateResetTime ? lastDateResetTime : currentDateResetTime;
        const lastBetTime = (_a = bettor === null || bettor === void 0 ? void 0 : bettor.lastBetTime) !== null && _a !== void 0 ? _a : 0;
        // If they've already bet after the reset time
        if (lastBetTime > betStreakResetTime)
            return { newBettingStreak: undefined };
        const newBettingStreak = ((_b = bettor === null || bettor === void 0 ? void 0 : bettor.currentBettingStreak) !== null && _b !== void 0 ? _b : 0) + 1;
        // Otherwise, add 1 to their betting streak
        trans.update(userDoc, {
            currentBettingStreak: newBettingStreak,
            lastBetTime: bet.createdTime,
        });
        return { newBettingStreak };
    });
    if (!newBettingStreak)
        return;
    const result = await firestore.runTransaction(async (trans) => {
        // Send them the bonus times their streak
        const bonusAmount = Math.min(economy_1.BETTING_STREAK_BONUS_AMOUNT * newBettingStreak, economy_1.BETTING_STREAK_BONUS_MAX);
        const fromUserId = (0, utils_1.isProd)()
            ? antes_1.HOUSE_LIQUIDITY_PROVIDER_ID
            : antes_1.DEV_HOUSE_LIQUIDITY_PROVIDER_ID;
        const bonusTxnDetails = {
            currentBettingStreak: newBettingStreak,
        };
        const bonusTxn = {
            fromId: fromUserId,
            fromType: 'BANK',
            toId: user.id,
            toType: 'USER',
            amount: bonusAmount,
            token: 'M$',
            category: 'BETTING_STREAK_BONUS',
            description: JSON.stringify(bonusTxnDetails),
            data: bonusTxnDetails,
        };
        const { message, txn, status } = await (0, run_txn_1.runTxn)(trans, bonusTxn);
        return { message, txn, status, bonusAmount };
    });
    if (result.status != 'success') {
        (0, utils_1.log)("betting streak bonus txn couldn't be made");
        (0, utils_1.log)('status:', result.status);
        (0, utils_1.log)('message:', result.message);
        return;
    }
    if (result.txn) {
        await (0, create_notification_1.createBettingStreakBonusNotification)(user, result.txn.id, bet, contract, result.bonusAmount, newBettingStreak, eventId);
    }
};
const updateUniqueBettorsAndGiveCreatorBonus = async (oldContract, eventId, bettor) => {
    var _a;
    const { newUniqueBettorIds } = await firestore.runTransaction(async (trans) => {
        const contractDoc = firestore.collection(`contracts`).doc(oldContract.id);
        const contract = (await trans.get(contractDoc)).data();
        let previousUniqueBettorIds = contract.uniqueBettorIds;
        if (!previousUniqueBettorIds) {
            const betsSnap = await trans.get(firestore.collection(`contracts/${contract.id}/bets`));
            const contractBets = betsSnap.docs.map((doc) => doc.data());
            if (contractBets.length === 0) {
                return { newUniqueBettorIds: undefined };
            }
            previousUniqueBettorIds = (0, lodash_1.uniq)(contractBets
                .filter((bet) => bet.createdTime < BONUS_START_DATE)
                .map((bet) => bet.userId));
        }
        const isNewUniqueBettor = !previousUniqueBettorIds.includes(bettor.id);
        const newUniqueBettorIds = (0, lodash_1.uniq)([...previousUniqueBettorIds, bettor.id]);
        // Update contract unique bettors
        if (!contract.uniqueBettorIds || isNewUniqueBettor) {
            (0, utils_1.log)(`Got ${previousUniqueBettorIds} unique bettors`);
            isNewUniqueBettor && (0, utils_1.log)(`And a new unique bettor ${bettor.id}`);
            trans.update(contractDoc, {
                uniqueBettorIds: newUniqueBettorIds,
                uniqueBettorCount: newUniqueBettorIds.length,
            });
        }
        // No need to give a bonus for the creator's bet
        if (!isNewUniqueBettor || bettor.id == contract.creatorId)
            return { newUniqueBettorIds: undefined };
        return { newUniqueBettorIds };
    });
    if (!newUniqueBettorIds || newUniqueBettorIds.length > economy_1.MAX_TRADERS_FOR_BONUS)
        return;
    // exclude bots from bonuses
    if (constants_1.BOT_USERNAMES.includes(bettor.username))
        return;
    if (oldContract.mechanism === 'cpmm-1') {
        await (0, add_house_subsidy_1.addHouseSubsidy)(oldContract.id, economy_1.UNIQUE_BETTOR_LIQUIDITY);
    }
    const bonusTxnDetails = {
        contractId: oldContract.id,
        uniqueNewBettorId: bettor.id,
    };
    const fromUserId = (0, utils_1.isProd)()
        ? antes_1.HOUSE_LIQUIDITY_PROVIDER_ID
        : antes_1.DEV_HOUSE_LIQUIDITY_PROVIDER_ID;
    const result = await firestore.runTransaction(async (trans) => {
        const bonusTxn = {
            fromId: fromUserId,
            fromType: 'BANK',
            toId: oldContract.creatorId,
            toType: 'USER',
            amount: economy_1.UNIQUE_BETTOR_BONUS_AMOUNT,
            token: 'M$',
            category: 'UNIQUE_BETTOR_BONUS',
            description: JSON.stringify(bonusTxnDetails),
            data: bonusTxnDetails,
        };
        const { status, message, txn } = await (0, run_txn_1.runTxn)(trans, bonusTxn);
        return { status, newUniqueBettorIds, message, txn };
    });
    if (result.status != 'success' || !result.txn) {
        (0, utils_1.log)(`No bonus for user: ${oldContract.creatorId} - status:`, result.status);
        (0, utils_1.log)('message:', result.message);
    }
    else {
        (0, utils_1.log)(`Bonus txn for user: ${oldContract.creatorId} completed:`, (_a = result.txn) === null || _a === void 0 ? void 0 : _a.id);
        await (0, create_notification_1.createUniqueBettorBonusNotification)(oldContract.creatorId, bettor, result.txn.id, oldContract, result.txn.amount, result.newUniqueBettorIds, eventId + '-unique-bettor-bonus');
    }
};
const notifyFills = async (bet, contract, eventId, user) => {
    if (!bet.fills)
        return;
    const matchedFills = bet.fills.filter((fill) => fill.matchedBetId !== null);
    const matchedBets = (await Promise.all(matchedFills.map((fill) => (0, utils_1.getValues)(firestore.collectionGroup('bets').where('id', '==', fill.matchedBetId))))).flat();
    const betUsers = await Promise.all(matchedBets.map((bet) => (0, utils_1.getUser)(bet.userId)));
    const betUsersById = (0, lodash_1.keyBy)((0, array_1.filterDefined)(betUsers), 'id');
    await Promise.all(matchedBets.map((matchedBet) => {
        const matchedUser = betUsersById[matchedBet.userId];
        if (!matchedUser)
            return;
        return (0, create_notification_1.createBetFillNotification)(user, matchedUser, bet, matchedBet, contract, eventId);
    }));
};
const currentDateBettingStreakResetTime = () => {
    return new Date().setUTCHours(economy_1.BETTING_STREAK_RESET_HOUR, 0, 0, 0);
};
const updateContractMetrics = async (contract, user) => {
    const betSnap = await firestore
        .collection(`contracts/${contract.id}/bets`)
        .where('userId', '==', user.id)
        .get();
    const bets = betSnap.docs.map((doc) => doc.data());
    const newMetrics = (0, calculate_metrics_1.calculateUserMetrics)(contract, bets, user);
    await firestore
        .collection(`users/${user.id}/contract-metrics`)
        .doc(contract.id)
        .set(newMetrics);
};
//# sourceMappingURL=on-create-bet.js.map