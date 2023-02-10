"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addsubsidy = void 0;
const admin = require("firebase-admin");
const zod_1 = require("zod");
const add_liquidity_1 = require("../../common/add-liquidity");
const api_1 = require("./api");
const bodySchema = zod_1.z.object({
    contractId: zod_1.z.string(),
    amount: zod_1.z.number().gt(0),
});
exports.addsubsidy = (0, api_1.newEndpoint)({}, async (req, auth) => {
    const { amount, contractId } = (0, api_1.validate)(bodySchema, req.body);
    if (!isFinite(amount) || amount < 1)
        throw new api_1.APIError(400, 'Invalid amount');
    // run as transaction to prevent race conditions
    return await firestore.runTransaction(async (transaction) => {
        const userDoc = firestore.doc(`users/${auth.uid}`);
        const userSnap = await transaction.get(userDoc);
        if (!userSnap.exists)
            throw new api_1.APIError(400, 'User not found');
        const user = userSnap.data();
        const contractDoc = firestore.doc(`contracts/${contractId}`);
        const contractSnap = await transaction.get(contractDoc);
        if (!contractSnap.exists)
            throw new api_1.APIError(400, 'Invalid contract');
        const contract = contractSnap.data();
        if (contract.mechanism !== 'cpmm-1' ||
            (contract.outcomeType !== 'BINARY' &&
                contract.outcomeType !== 'PSEUDO_NUMERIC'))
            throw new api_1.APIError(400, 'Invalid contract');
        const { closeTime } = contract;
        if (closeTime && Date.now() > closeTime)
            throw new api_1.APIError(400, 'Trading is closed');
        if (user.balance < amount)
            throw new api_1.APIError(400, 'Insufficient balance');
        const newLiquidityProvisionDoc = firestore
            .collection(`contracts/${contractId}/liquidity`)
            .doc();
        const { newLiquidityProvision, newTotalLiquidity, newSubsidyPool } = (0, add_liquidity_1.getNewLiquidityProvision)(user.id, amount, contract, newLiquidityProvisionDoc.id);
        transaction.update(contractDoc, {
            subsidyPool: newSubsidyPool,
            totalLiquidity: newTotalLiquidity,
        });
        const newBalance = user.balance - amount;
        const newTotalDeposits = user.totalDeposits - amount;
        if (!isFinite(newBalance)) {
            throw new api_1.APIError(500, 'Invalid user balance for ' + user.username);
        }
        transaction.update(userDoc, {
            balance: newBalance,
            totalDeposits: newTotalDeposits,
        });
        transaction.create(newLiquidityProvisionDoc, newLiquidityProvision);
        return newLiquidityProvision;
    });
});
const firestore = admin.firestore();
//# sourceMappingURL=add-subsidy.js.map