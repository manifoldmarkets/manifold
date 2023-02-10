"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.redeemShares = void 0;
const admin = require("firebase-admin");
const firestore_1 = require("firebase-admin/firestore");
const lodash_1 = require("lodash");
const redeem_1 = require("../../common/redeem");
const math_1 = require("../../common/util/math");
const calculate_cpmm_multi_1 = require("../../common/calculate-cpmm-multi");
const redeemShares = async (userId, contract) => {
    return await firestore.runTransaction(async (trans) => {
        var _a;
        const { mechanism, id: contractId } = contract;
        const betsColl = firestore.collection(`contracts/${contractId}/bets`);
        const betsSnap = await trans.get(betsColl.where('userId', '==', userId));
        const bets = betsSnap.docs.map((doc) => doc.data());
        const { shares, loanPayment, netAmount } = (0, redeem_1.getRedeemableAmount)(contract, bets);
        if ((0, math_1.floatingEqual)(shares, 0)) {
            return { status: 'success' };
        }
        if (!isFinite(netAmount)) {
            throw new Error('Invalid redemption amount, no clue what happened here.');
        }
        const userDoc = firestore.collection('users').doc(userId);
        trans.update(userDoc, { balance: firestore_1.FieldValue.increment(netAmount) });
        if (mechanism === 'cpmm-1') {
            const lastProb = (_a = (0, lodash_1.maxBy)(bets, (b) => b.createdTime)) === null || _a === void 0 ? void 0 : _a.probAfter;
            const [yesBet, noBet] = (0, redeem_1.getRedemptionBets)(contractId, shares, loanPayment, lastProb);
            const yesDoc = betsColl.doc();
            const noDoc = betsColl.doc();
            trans.create(yesDoc, Object.assign({ id: yesDoc.id, userId }, yesBet));
            trans.create(noDoc, Object.assign({ id: noDoc.id, userId }, noBet));
        }
        else {
            const bet = (0, redeem_1.getRedemptionBetMulti)(contractId, shares, loanPayment, (0, calculate_cpmm_multi_1.poolToProbs)(contract.pool));
            const betDoc = betsColl.doc();
            trans.create(betDoc, Object.assign({ id: betDoc.id, userId }, bet));
        }
        return { status: 'success' };
    });
};
exports.redeemShares = redeemShares;
const firestore = admin.firestore();
//# sourceMappingURL=redeem-shares.js.map