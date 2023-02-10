"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.drizzleLiquidityScheduler = exports.drizzleLiquidity = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const promise_1 = require("../../common/util/promise");
const api_1 = require("../../common/api");
const calculate_cpmm_1 = require("../../common/calculate-cpmm");
const format_1 = require("../../common/util/format");
const firestore = admin.firestore();
const drizzleLiquidity = async () => {
    const snap = await firestore
        .collection('contracts')
        .where('subsidyPool', '>', 1e-7)
        .get();
    const contractIds = snap.docs.map((doc) => doc.id);
    console.log('found', contractIds.length, 'markets to drizzle');
    console.log();
    await (0, promise_1.mapAsync)(contractIds, (cid) => drizzleMarket(cid), 10);
};
exports.drizzleLiquidity = drizzleLiquidity;
exports.drizzleLiquidityScheduler = functions.pubsub
    .schedule('*/10 * * * *')
    .onRun(exports.drizzleLiquidity);
const drizzleMarket = async (contractId) => {
    await firestore.runTransaction(async (trans) => {
        const snap = await trans.get(firestore.doc(`contracts/${contractId}`));
        const contract = snap.data();
        const { subsidyPool, pool, p, slug, popularityScore } = contract;
        if ((subsidyPool !== null && subsidyPool !== void 0 ? subsidyPool : 0) < 1e-7)
            return;
        const r = Math.random();
        const logPopularity = Math.log10((popularityScore !== null && popularityScore !== void 0 ? popularityScore : 0) + 10);
        const v = Math.max(1, Math.min(4, logPopularity));
        const amount = subsidyPool <= 1 ? subsidyPool : r * v * 0.2 * subsidyPool;
        const { newPool, newP } = (0, calculate_cpmm_1.addCpmmLiquidity)(pool, p, amount);
        if (!isFinite(newP)) {
            throw new api_1.APIError(500, 'Liquidity injection rejected due to overflow error.');
        }
        await trans.update(firestore.doc(`contracts/${contract.id}`), {
            pool: newPool,
            p: newP,
            subsidyPool: subsidyPool - amount,
        });
        console.log('added subsidy', (0, format_1.formatMoneyWithDecimals)(amount), 'of', (0, format_1.formatMoneyWithDecimals)(subsidyPool), 'pool to', slug);
        console.log();
    });
};
//# sourceMappingURL=drizzle-liquidity.js.map