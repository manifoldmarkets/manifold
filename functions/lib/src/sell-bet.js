"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sellbet = void 0;
const admin = require("firebase-admin");
const zod_1 = require("zod");
const api_1 = require("./api");
const sell_bet_1 = require("../../common/sell-bet");
const object_1 = require("../../common/util/object");
const bodySchema = zod_1.z.object({
    contractId: zod_1.z.string(),
    betId: zod_1.z.string(),
});
exports.sellbet = (0, api_1.newEndpoint)({}, async (req, auth) => {
    const { contractId, betId } = (0, api_1.validate)(bodySchema, req.body);
    // run as transaction to prevent race conditions
    return await firestore.runTransaction(async (transaction) => {
        var _a;
        const contractDoc = firestore.doc(`contracts/${contractId}`);
        const userDoc = firestore.doc(`users/${auth.uid}`);
        const betDoc = firestore.doc(`contracts/${contractId}/bets/${betId}`);
        const [contractSnap, userSnap, betSnap] = await transaction.getAll(contractDoc, userDoc, betDoc);
        if (!contractSnap.exists)
            throw new api_1.APIError(400, 'Contract not found.');
        if (!userSnap.exists)
            throw new api_1.APIError(400, 'User not found.');
        if (!betSnap.exists)
            throw new api_1.APIError(400, 'Bet not found.');
        const contract = contractSnap.data();
        const user = userSnap.data();
        const bet = betSnap.data();
        const { closeTime, mechanism, collectedFees, volume } = contract;
        if (mechanism !== 'dpm-2')
            throw new api_1.APIError(400, 'You can only sell bets on DPM-2 contracts.');
        if (closeTime && Date.now() > closeTime)
            throw new api_1.APIError(400, 'Trading is closed.');
        if (auth.uid !== bet.userId)
            throw new api_1.APIError(400, 'The specified bet does not belong to you.');
        if (bet.isSold)
            throw new api_1.APIError(400, 'The specified bet is already sold.');
        const { newBet, newPool, newTotalShares, newTotalBets, fees } = (0, sell_bet_1.getSellBetInfo)(bet, contract);
        /* eslint-disable-next-line @typescript-eslint/no-non-null-assertion */
        const saleAmount = newBet.sale.amount;
        const newBalance = user.balance + saleAmount + ((_a = newBet.loanAmount) !== null && _a !== void 0 ? _a : 0);
        const newBetDoc = firestore.collection(`contracts/${contractId}/bets`).doc();
        transaction.update(userDoc, { balance: newBalance });
        transaction.update(betDoc, { isSold: true });
        transaction.create(newBetDoc, Object.assign({ id: newBetDoc.id, userId: user.id }, newBet));
        transaction.update(contractDoc, (0, object_1.removeUndefinedProps)({
            pool: newPool,
            totalShares: newTotalShares,
            totalBets: newTotalBets,
            collectedFees: (0, object_1.addObjects)(fees, collectedFees),
            volume: volume + Math.abs(newBet.amount),
        }));
        return {};
    });
});
const firestore = admin.firestore();
//# sourceMappingURL=sell-bet.js.map