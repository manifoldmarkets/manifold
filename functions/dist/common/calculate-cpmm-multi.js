"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.test = exports.shortSell = exports.sell = exports.buy = exports.getLiquidity = exports.poolToProbs = exports.getProb = void 0;
const lodash_1 = require("lodash");
const algos_1 = require("./util/algos");
// TODO: Remove min pool shares. Switch to throwing an error if k invariant is violated.
const MIN_POOL_SHARES = 1e-20;
function getProb(pool, outcome) {
    if (pool[outcome] === undefined)
        throw new Error('Invalid outcome');
    const inverseShareSum = (0, lodash_1.sumBy)(Object.values(pool), (value) => 1 / value);
    return 1 / (pool[outcome] * inverseShareSum);
}
exports.getProb = getProb;
function poolToProbs(pool) {
    const inverseShareSum = (0, lodash_1.sumBy)(Object.values(pool), (value) => 1 / value);
    return (0, lodash_1.mapValues)(pool, (s) => 1 / (s * inverseShareSum));
}
exports.poolToProbs = poolToProbs;
const getK = (pool) => {
    const values = Object.values(pool);
    return (0, lodash_1.sumBy)(values, Math.log);
};
const getLiquidity = (pool) => {
    return Math.exp(getK(pool) / Object.keys(pool).length);
};
exports.getLiquidity = getLiquidity;
function buy(pool, outcome, amount) {
    if (amount < 0)
        throw new Error('Amount must be non-negative');
    if (pool[outcome] === undefined)
        throw new Error('Invalid outcome');
    const k = getK(pool);
    const tempPool = (0, lodash_1.mapValues)(pool, (s) => s + amount);
    const maxShares = tempPool[outcome];
    delete tempPool[outcome];
    const kMissingOutcome = getK(tempPool);
    const shares = maxShares - Math.exp(k - kMissingOutcome);
    const newShares = maxShares - shares;
    tempPool[outcome] = Math.max(MIN_POOL_SHARES, newShares);
    const newPool = tempPool;
    return { newPool, shares };
}
exports.buy = buy;
function sell(pool, outcome, shares) {
    if (shares < 0)
        throw new Error('Shares must be non-negative');
    if (pool[outcome] === undefined)
        throw new Error('Invalid outcome');
    const k = getK(pool);
    const poolWithShares = Object.assign(Object.assign({}, pool), { [outcome]: pool[outcome] + shares });
    const saleAmount = (0, algos_1.binarySearch)(0, shares, (saleAmount) => {
        const poolAfterSale = (0, lodash_1.mapValues)(poolWithShares, (s) => Math.max(MIN_POOL_SHARES, s - saleAmount));
        const kAfterSale = getK(poolAfterSale);
        return k - kAfterSale;
    });
    const newPool = (0, lodash_1.mapValues)(poolWithShares, (s) => Math.max(MIN_POOL_SHARES, s - saleAmount));
    return { newPool, saleAmount };
}
exports.sell = sell;
function shortSell(pool, outcome, amount) {
    if (amount < 0)
        throw new Error('Amount must be non-negative');
    if (pool[outcome] === undefined)
        throw new Error('Invalid outcome');
    const k = getK(pool);
    const poolWithAmount = (0, lodash_1.mapValues)(pool, (s) => s + amount);
    const minOutcome = (0, lodash_1.minBy)(Object.keys(poolWithAmount), (o) => o === outcome ? Infinity : poolWithAmount[o]);
    const maxShares = poolWithAmount[minOutcome];
    const shares = (0, algos_1.binarySearch)(amount, maxShares, (shares) => {
        const poolAfterPurchase = (0, lodash_1.mapValues)(poolWithAmount, (s, o) => o === outcome ? s : Math.max(MIN_POOL_SHARES, s - shares));
        const kAfterSale = getK(poolAfterPurchase);
        return k - kAfterSale;
    });
    const newPool = (0, lodash_1.mapValues)(poolWithAmount, (s, o) => o === outcome ? s : Math.max(MIN_POOL_SHARES, s - shares));
    const gainedShares = (0, lodash_1.mapValues)(newPool, (s, o) => poolWithAmount[o] - s);
    return { newPool, gainedShares };
}
exports.shortSell = shortSell;
function test() {
    const pool = {
        A: 100,
        B: 100,
        C: 100,
    };
    console.log('START');
    console.log('pool', pool, 'k', getK(pool), 'probs', poolToProbs(pool));
    const { newPool: poolAfterShortSell, shares } = buy(pool, 'C', 100000000);
    console.log('after buy', shares, 'pool', poolAfterShortSell, 'probs', poolToProbs(poolAfterShortSell));
    console.log('k', getK(poolAfterShortSell));
    console.log('liquidity', (0, exports.getLiquidity)(poolAfterShortSell));
}
exports.test = test;
//# sourceMappingURL=calculate-cpmm-multi.js.map