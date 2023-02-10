"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withdrawliquidity = void 0;
const admin = require("firebase-admin");
const zod_1 = require("zod");
const object_1 = require("../../common/util/object");
const calculate_cpmm_1 = require("../../common/calculate-cpmm");
const calculate_1 = require("../../common/calculate");
const fees_1 = require("../../common/fees");
const api_1 = require("./api");
const redeem_shares_1 = require("./redeem-shares");
const bodySchema = zod_1.z.object({
    contractId: zod_1.z.string(),
});
exports.withdrawliquidity = (0, api_1.newEndpoint)({}, async (req, auth) => {
    const { contractId } = (0, api_1.validate)(bodySchema, req.body);
    return await firestore
        .runTransaction(async (trans) => {
        const lpDoc = firestore.doc(`users/${auth.uid}`);
        const lpSnap = await trans.get(lpDoc);
        if (!lpSnap.exists)
            throw new api_1.APIError(400, 'User not found.');
        const lp = lpSnap.data();
        const contractDoc = firestore.doc(`contracts/${contractId}`);
        const contractSnap = await trans.get(contractDoc);
        if (!contractSnap.exists)
            throw new api_1.APIError(400, 'Contract not found.');
        const contract = contractSnap.data();
        const liquidityCollection = firestore.collection(`contracts/${contractId}/liquidity`);
        const liquiditiesSnap = await trans.get(liquidityCollection);
        const liquidities = liquiditiesSnap.docs.map((doc) => doc.data());
        const userShares = (0, calculate_cpmm_1.getUserLiquidityShares)(auth.uid, contract, liquidities, true);
        // zero all added amounts for now
        // can add support for partial withdrawals in the future
        liquiditiesSnap.docs
            .filter((_, i) => !liquidities[i].isAnte && liquidities[i].userId === auth.uid)
            .forEach((doc) => trans.update(doc.ref, { amount: 0 }));
        const payout = Math.min(...Object.values(userShares));
        if (payout <= 0)
            return {};
        const newBalance = lp.balance + payout;
        const newTotalDeposits = lp.totalDeposits + payout;
        trans.update(lpDoc, {
            balance: newBalance,
            totalDeposits: newTotalDeposits,
        });
        const newPool = (0, object_1.subtractObjects)(contract.pool, userShares);
        const minPoolShares = Math.min(...Object.values(newPool));
        const adjustedTotal = contract.totalLiquidity - payout;
        // total liquidity is a bogus number; use minPoolShares to prevent from going negative
        const newTotalLiquidity = Math.max(adjustedTotal, minPoolShares);
        trans.update(contractDoc, {
            pool: newPool,
            totalLiquidity: newTotalLiquidity,
        });
        const prob = (0, calculate_1.getProbability)(contract);
        // surplus shares become user's bets
        const bets = Object.entries(userShares)
            .map(([outcome, shares]) => shares - payout < 1 // don't create bet if less than 1 share
            ? undefined
            : {
                userId: auth.uid,
                contractId: contract.id,
                amount: (outcome === 'YES' ? prob : 1 - prob) * (shares - payout),
                shares: shares - payout,
                outcome,
                probBefore: prob,
                probAfter: prob,
                createdTime: Date.now(),
                isLiquidityProvision: true,
                fees: fees_1.noFees,
            })
            .filter((x) => x !== undefined);
        for (const bet of bets) {
            const doc = firestore.collection(`contracts/${contract.id}/bets`).doc();
            trans.create(doc, Object.assign({ id: doc.id }, bet));
        }
        return userShares;
    })
        .then(async (result) => {
        // redeem surplus bet with pre-existing bets
        await (0, redeem_shares_1.redeemShares)(auth.uid, contractId);
        console.log('userid', auth.uid, 'withdraws', result);
        return result;
    });
});
const firestore = admin.firestore();
//# sourceMappingURL=withdraw-liquidity.js.map