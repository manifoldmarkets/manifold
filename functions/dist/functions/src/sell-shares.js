"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sellshares = void 0;
const lodash_1 = require("lodash");
const admin = require("firebase-admin");
const zod_1 = require("zod");
const firestore_1 = require("firebase-admin/firestore");
const api_1 = require("./api");
const contract_1 = require("../../common/contract");
const sell_bet_1 = require("../../common/sell-bet");
const object_1 = require("../../common/util/object");
const utils_1 = require("./utils");
const math_1 = require("../../common/util/math");
const place_bet_1 = require("./place-bet");
const redeem_shares_1 = require("./redeem-shares");
const follow_market_1 = require("./follow-market");
const fees_1 = require("../../common/fees");
const bodySchema = zod_1.z.object({
    contractId: zod_1.z.string(),
    shares: zod_1.z.number().positive().optional(),
    outcome: zod_1.z.enum(['YES', 'NO']).optional(), // leave it out to sell whichever you have
});
exports.sellshares = (0, api_1.newEndpoint)({}, async (req, auth) => {
    const { contractId, shares, outcome } = (0, api_1.validate)(bodySchema, req.body);
    // Run as transaction to prevent race conditions.
    const result = await firestore.runTransaction(async (transaction) => {
        var _a;
        const contractDoc = firestore.doc(`contracts/${contractId}`);
        const userDoc = firestore.doc(`users/${auth.uid}`);
        const betsQ = contractDoc.collection('bets').where('userId', '==', auth.uid);
        (0, utils_1.log)(`Checking for limit orders and bets in sellshares for user ${auth.uid} on contract id ${contractId}.`);
        const [[contractSnap, userSnap], userBetsSnap, { unfilledBets, balanceByUserId },] = await Promise.all([
            transaction.getAll(contractDoc, userDoc),
            transaction.get(betsQ),
            (0, place_bet_1.getUnfilledBetsAndUserBalances)(transaction, contractDoc, auth.uid),
        ]);
        if (!contractSnap.exists)
            throw new api_1.APIError(400, 'Contract not found.');
        if (!userSnap.exists)
            throw new api_1.APIError(400, 'User not found.');
        const userBets = userBetsSnap.docs.map((doc) => doc.data());
        const contract = contractSnap.data();
        const user = userSnap.data();
        const { closeTime, mechanism, collectedFees, volume } = contract;
        if (mechanism !== 'cpmm-1')
            throw new api_1.APIError(400, 'You can only sell shares on CPMM-1 contracts.');
        if (closeTime && Date.now() > closeTime)
            throw new api_1.APIError(400, 'Trading is closed.');
        const loanAmount = (0, lodash_1.sumBy)(userBets, (bet) => { var _a; return (_a = bet.loanAmount) !== null && _a !== void 0 ? _a : 0; });
        const betsByOutcome = (0, lodash_1.groupBy)(userBets, (bet) => bet.outcome);
        const sharesByOutcome = (0, lodash_1.mapValues)(betsByOutcome, (bets) => (0, lodash_1.sumBy)(bets, (b) => b.shares));
        let chosenOutcome;
        if (outcome != null) {
            chosenOutcome = outcome;
        }
        else {
            const nonzeroShares = Object.entries(sharesByOutcome).filter(([_k, v]) => !(0, math_1.floatingEqual)(0, v));
            if (nonzeroShares.length == 0) {
                throw new api_1.APIError(400, "You don't own any shares in this market.");
            }
            if (nonzeroShares.length > 1) {
                throw new api_1.APIError(400, `You own multiple kinds of shares, but did not specify which to sell.`);
            }
            chosenOutcome = nonzeroShares[0][0];
        }
        const maxShares = sharesByOutcome[chosenOutcome];
        const sharesToSell = shares !== null && shares !== void 0 ? shares : maxShares;
        if (!(0, math_1.floatingLesserEqual)(sharesToSell, maxShares))
            throw new api_1.APIError(400, `You can only sell up to ${maxShares} shares.`);
        const soldShares = Math.min(sharesToSell, maxShares);
        const saleFrac = soldShares / maxShares;
        let loanPaid = saleFrac * loanAmount;
        if (!isFinite(loanPaid))
            loanPaid = 0;
        const { newBet, newPool, newP, fees, makers, ordersToCancel } = (0, sell_bet_1.getCpmmSellBetInfo)(soldShares, chosenOutcome, contract, unfilledBets, balanceByUserId, loanPaid);
        if (!newP ||
            !isFinite(newP) ||
            Math.min(...Object.values(newPool !== null && newPool !== void 0 ? newPool : {})) < contract_1.CPMM_MIN_POOL_QTY) {
            throw new api_1.APIError(400, 'Sale too large for current liquidity pool.');
        }
        const newBetDoc = firestore.collection(`contracts/${contractId}/bets`).doc();
        (0, place_bet_1.updateMakers)(makers, newBetDoc.id, contractDoc, transaction);
        transaction.update(userDoc, {
            balance: firestore_1.FieldValue.increment(-newBet.amount + ((_a = newBet.loanAmount) !== null && _a !== void 0 ? _a : 0) - fees_1.FLAT_TRADE_FEE),
        });
        transaction.create(newBetDoc, Object.assign({ id: newBetDoc.id, userId: user.id, userAvatarUrl: user.avatarUrl, userUsername: user.username, userName: user.name }, newBet));
        transaction.update(contractDoc, (0, object_1.removeUndefinedProps)({
            pool: newPool,
            p: newP,
            collectedFees: (0, object_1.addObjects)(fees, collectedFees),
            volume: volume + Math.abs(newBet.amount),
        }));
        for (const bet of ordersToCancel) {
            transaction.update(contractDoc.collection('bets').doc(bet.id), {
                isCancelled: true,
            });
        }
        return { newBet, makers, maxShares, soldShares, contract };
    });
    const { makers, maxShares, soldShares, contract } = result;
    if ((0, math_1.floatingEqual)(maxShares, soldShares)) {
        await (0, follow_market_1.removeUserFromContractFollowers)(contractId, auth.uid);
    }
    const userIds = (0, lodash_1.uniq)(makers.map((maker) => maker.bet.userId));
    await Promise.all(userIds.map((userId) => (0, redeem_shares_1.redeemShares)(userId, contract)));
    (0, utils_1.log)('Share redemption transaction finished.');
    return { status: 'success' };
});
const firestore = admin.firestore();
//# sourceMappingURL=sell-shares.js.map