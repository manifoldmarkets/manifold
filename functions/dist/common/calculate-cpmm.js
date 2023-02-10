"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserLiquidityShares = exports.getCpmmLiquidityPoolWeights = exports.addCpmmLiquidity = exports.getCpmmLiquidity = exports.getCpmmProbabilityAfterSale = exports.calculateCpmmSale = exports.calculateCpmmAmountToProb = exports.calculateCpmmPurchase = exports.calculateCpmmSharesAfterFee = exports.getCpmmFees = exports.getCpmmOutcomeProbabilityAfterBet = exports.getCpmmProbabilityAfterBetBeforeFees = exports.getCpmmProbability = void 0;
const lodash_1 = require("lodash");
const fees_1 = require("./fees");
const new_bet_1 = require("./new-bet");
const algos_1 = require("./util/algos");
function getCpmmProbability(pool, p) {
    const { YES, NO } = pool;
    return (p * NO) / ((1 - p) * YES + p * NO);
}
exports.getCpmmProbability = getCpmmProbability;
function getCpmmProbabilityAfterBetBeforeFees(state, outcome, bet) {
    const { pool, p } = state;
    const shares = calculateCpmmShares(pool, p, bet, outcome);
    const { YES: y, NO: n } = pool;
    const [newY, newN] = outcome === 'YES'
        ? [y - shares + bet, n + bet]
        : [y + bet, n - shares + bet];
    return getCpmmProbability({ YES: newY, NO: newN }, p);
}
exports.getCpmmProbabilityAfterBetBeforeFees = getCpmmProbabilityAfterBetBeforeFees;
function getCpmmOutcomeProbabilityAfterBet(state, outcome, bet) {
    const { newPool } = calculateCpmmPurchase(state, bet, outcome);
    const p = getCpmmProbability(newPool, state.p);
    return outcome === 'NO' ? 1 - p : p;
}
exports.getCpmmOutcomeProbabilityAfterBet = getCpmmOutcomeProbabilityAfterBet;
// before liquidity fee
function calculateCpmmShares(pool, p, bet, betChoice) {
    const { YES: y, NO: n } = pool;
    const k = y ** p * n ** (1 - p);
    return betChoice === 'YES'
        ? // https://www.wolframalpha.com/input?i=%28y%2Bb-s%29%5E%28p%29*%28n%2Bb%29%5E%281-p%29+%3D+k%2C+solve+s
            y + bet - (k * (bet + n) ** (p - 1)) ** (1 / p)
        : n + bet - (k * (bet + y) ** -p) ** (1 / (1 - p));
}
function getCpmmFees(state, bet, outcome) {
    const prob = getCpmmProbabilityAfterBetBeforeFees(state, outcome, bet);
    const betP = outcome === 'YES' ? 1 - prob : prob;
    const liquidityFee = fees_1.LIQUIDITY_FEE * betP * bet;
    const platformFee = fees_1.PLATFORM_FEE * betP * bet;
    const creatorFee = fees_1.CREATOR_FEE * betP * bet;
    const fees = { liquidityFee, platformFee, creatorFee };
    const totalFees = liquidityFee + platformFee + creatorFee;
    const remainingBet = bet - totalFees;
    return { remainingBet, totalFees, fees };
}
exports.getCpmmFees = getCpmmFees;
function calculateCpmmSharesAfterFee(state, bet, outcome) {
    const { pool, p } = state;
    const { remainingBet } = getCpmmFees(state, bet, outcome);
    return calculateCpmmShares(pool, p, remainingBet, outcome);
}
exports.calculateCpmmSharesAfterFee = calculateCpmmSharesAfterFee;
function calculateCpmmPurchase(state, bet, outcome) {
    const { pool, p } = state;
    const { remainingBet, fees } = getCpmmFees(state, bet, outcome);
    const shares = calculateCpmmShares(pool, p, remainingBet, outcome);
    const { YES: y, NO: n } = pool;
    const { liquidityFee: fee } = fees;
    const [newY, newN] = outcome === 'YES'
        ? [y - shares + remainingBet + fee, n + remainingBet + fee]
        : [y + remainingBet + fee, n - shares + remainingBet + fee];
    const postBetPool = { YES: newY, NO: newN };
    const { newPool, newP } = addCpmmLiquidity(postBetPool, p, fee);
    return { shares, newPool, newP, fees };
}
exports.calculateCpmmPurchase = calculateCpmmPurchase;
// Note: there might be a closed form solution for this.
// If so, feel free to switch out this implementation.
function calculateCpmmAmountToProb(state, prob, outcome) {
    if (prob <= 0 || prob >= 1 || isNaN(prob))
        return Infinity;
    if (outcome === 'NO')
        prob = 1 - prob;
    // First, find an upper bound that leads to a more extreme probability than prob.
    let maxGuess = 10;
    let newProb = 0;
    do {
        maxGuess *= 10;
        newProb = getCpmmOutcomeProbabilityAfterBet(state, outcome, maxGuess);
    } while (newProb < prob);
    // Then, binary search for the amount that gets closest to prob.
    const amount = (0, algos_1.binarySearch)(0, maxGuess, (amount) => {
        const newProb = getCpmmOutcomeProbabilityAfterBet(state, outcome, amount);
        return newProb - prob;
    });
    return amount;
}
exports.calculateCpmmAmountToProb = calculateCpmmAmountToProb;
function calculateAmountToBuyShares(state, shares, outcome, unfilledBets, balanceByUserId) {
    // Search for amount between bounds (0, shares).
    // Min share price is Ṁ0, and max is Ṁ1 each.
    return (0, algos_1.binarySearch)(0, shares, (amount) => {
        const { takers } = (0, new_bet_1.computeFills)(outcome, amount, state, undefined, unfilledBets, balanceByUserId);
        const totalShares = (0, lodash_1.sumBy)(takers, (taker) => taker.shares);
        return totalShares - shares;
    });
}
function calculateCpmmSale(state, shares, outcome, unfilledBets, balanceByUserId) {
    if (Math.round(shares) < 0) {
        throw new Error('Cannot sell non-positive shares');
    }
    const oppositeOutcome = outcome === 'YES' ? 'NO' : 'YES';
    const buyAmount = calculateAmountToBuyShares(state, shares, oppositeOutcome, unfilledBets, balanceByUserId);
    const { cpmmState, makers, takers, totalFees, ordersToCancel } = (0, new_bet_1.computeFills)(oppositeOutcome, buyAmount, state, undefined, unfilledBets, balanceByUserId);
    // Transform buys of opposite outcome into sells.
    const saleTakers = takers.map((taker) => (Object.assign(Object.assign({}, taker), { 
        // You bought opposite shares, which combine with existing shares, removing them.
        shares: -taker.shares, 
        // Opposite shares combine with shares you are selling for Ṁ of shares.
        // You paid taker.amount for the opposite shares.
        // Take the negative because this is money you gain.
        amount: -(taker.shares - taker.amount), isSale: true })));
    const saleValue = -(0, lodash_1.sumBy)(saleTakers, (taker) => taker.amount);
    return {
        saleValue,
        cpmmState,
        fees: totalFees,
        makers,
        takers: saleTakers,
        ordersToCancel,
    };
}
exports.calculateCpmmSale = calculateCpmmSale;
function getCpmmProbabilityAfterSale(state, shares, outcome, unfilledBets, balanceByUserId) {
    const { cpmmState } = calculateCpmmSale(state, shares, outcome, unfilledBets, balanceByUserId);
    return getCpmmProbability(cpmmState.pool, cpmmState.p);
}
exports.getCpmmProbabilityAfterSale = getCpmmProbabilityAfterSale;
function getCpmmLiquidity(pool, p) {
    const { YES, NO } = pool;
    return YES ** p * NO ** (1 - p);
}
exports.getCpmmLiquidity = getCpmmLiquidity;
function addCpmmLiquidity(pool, p, amount) {
    const prob = getCpmmProbability(pool, p);
    //https://www.wolframalpha.com/input?i=p%28n%2Bb%29%2F%28%281-p%29%28y%2Bb%29%2Bp%28n%2Bb%29%29%3Dq%2C+solve+p
    const { YES: y, NO: n } = pool;
    const numerator = prob * (amount + y);
    const denominator = amount - n * (prob - 1) + prob * y;
    const newP = numerator / denominator;
    const newPool = { YES: y + amount, NO: n + amount };
    const oldLiquidity = getCpmmLiquidity(pool, newP);
    const newLiquidity = getCpmmLiquidity(newPool, newP);
    const liquidity = newLiquidity - oldLiquidity;
    return { newPool, liquidity, newP };
}
exports.addCpmmLiquidity = addCpmmLiquidity;
function getCpmmLiquidityPoolWeights(liquidities) {
    const userAmounts = (0, lodash_1.groupBy)(liquidities, (w) => w.userId);
    const totalAmount = (0, lodash_1.sumBy)(liquidities, (w) => w.amount);
    return (0, lodash_1.mapValues)(userAmounts, (amounts) => (0, lodash_1.sumBy)(amounts, (w) => w.amount) / totalAmount);
}
exports.getCpmmLiquidityPoolWeights = getCpmmLiquidityPoolWeights;
function getUserLiquidityShares(userId, pool, liquidities) {
    var _a;
    const weights = getCpmmLiquidityPoolWeights(liquidities);
    const userWeight = (_a = weights[userId]) !== null && _a !== void 0 ? _a : 0;
    return (0, lodash_1.mapValues)(pool, (shares) => userWeight * shares);
}
exports.getUserLiquidityShares = getUserLiquidityShares;
//# sourceMappingURL=calculate-cpmm.js.map