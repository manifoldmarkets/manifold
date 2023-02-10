"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addHouseSubsidy = void 0;
const admin = require("firebase-admin");
const utils_1 = require("../utils");
const antes_1 = require("../../../common/antes");
const add_liquidity_1 = require("../../../common/add-liquidity");
const firestore = admin.firestore();
const addHouseSubsidy = (contractId, amount) => {
    return firestore.runTransaction(async (transaction) => {
        const newLiquidityProvisionDoc = firestore
            .collection(`contracts/${contractId}/liquidity`)
            .doc();
        const providerId = (0, utils_1.isProd)()
            ? antes_1.HOUSE_LIQUIDITY_PROVIDER_ID
            : antes_1.DEV_HOUSE_LIQUIDITY_PROVIDER_ID;
        const contractDoc = firestore.doc(`contracts/${contractId}`);
        const snap = await contractDoc.get();
        const contract = snap.data();
        const { newLiquidityProvision, newTotalLiquidity, newSubsidyPool } = (0, add_liquidity_1.getNewLiquidityProvision)(providerId, amount, contract, newLiquidityProvisionDoc.id);
        transaction.update(contractDoc, {
            subsidyPool: newSubsidyPool,
            totalLiquidity: newTotalLiquidity,
        });
        transaction.create(newLiquidityProvisionDoc, newLiquidityProvision);
    });
};
exports.addHouseSubsidy = addHouseSubsidy;
//# sourceMappingURL=add-house-subsidy.js.map