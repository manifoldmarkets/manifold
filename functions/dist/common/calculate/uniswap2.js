"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculatePriceAfterBuy = exports.afterSwap = exports.calculateShares = exports.calculatePrice = void 0;
function calculatePrice(pool) {
    return pool['M$'] / pool['SHARE'];
}
exports.calculatePrice = calculatePrice;
function calculateShares(pool, mana) {
    // Calculate shares purchasable with this amount of mana
    // Holding the Uniswapv2 constant of k = mana * shares
    return pool['SHARE'] - afterSwap(pool, 'M$', mana)['SHARE'];
}
exports.calculateShares = calculateShares;
// Returns the new pool after the specified number of tokens are
// swapped into the pool
function afterSwap(pool, token, amount) {
    const k = pool['M$'] * pool['SHARE'];
    const other = token === 'M$' ? 'SHARE' : 'M$';
    const newPool = {
        [token]: pool[token] + amount,
        // TODO: Should this be done in log space for precision?
        [other]: k / (pool[token] + amount),
    };
    // If any of the values in the new pool are invalid (infinite or NaN), throw an error
    if (Object.values(newPool).some((v) => !isFinite(v))) {
        throw new Error('Invalid new pool values: ' + JSON.stringify(newPool));
    }
    return newPool;
}
exports.afterSwap = afterSwap;
function calculatePriceAfterBuy(pool, mana) {
    return calculatePrice(afterSwap(pool, 'M$', mana));
}
exports.calculatePriceAfterBuy = calculatePriceAfterBuy;
//# sourceMappingURL=uniswap2.js.map