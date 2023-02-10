"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calcDpmInitialPool = exports.deductDpmFees = exports.resolvedDpmPayout = exports.calculateDpmPayoutAfterCorrectBet = exports.calculateStandardDpmPayout = exports.calculateDpmCancelPayout = exports.calculateDpmPayout = exports.calculateDpmSaleAmount = exports.calculateDpmShareValue = exports.calculateDpmMoneyRatio = exports.calculateDpmRawShareValue = exports.calculateNumericDpmShares = exports.calculateDpmShares = exports.getDpmProbabilityAfterSale = exports.getDpmOutcomeProbabilityAfterBet = exports.getExpectedValue = exports.getValueFromBucket = exports.getMappedBucket = exports.getNumericBets = exports.getDpmOutcomeProbabilities = exports.getDpmOutcomeProbability = exports.getDpmProbability = void 0;
const lodash_1 = require("lodash");
const fees_1 = require("./fees");
const math_1 = require("./util/math");
const object_1 = require("./util/object");
function getDpmProbability(totalShares) {
    // For binary contracts only.
    return getDpmOutcomeProbability(totalShares, 'YES');
}
exports.getDpmProbability = getDpmProbability;
function getDpmOutcomeProbability(totalShares, outcome) {
    var _a;
    const squareSum = (0, lodash_1.sumBy)(Object.values(totalShares), (shares) => shares ** 2);
    const shares = (_a = totalShares[outcome]) !== null && _a !== void 0 ? _a : 0;
    return shares ** 2 / squareSum;
}
exports.getDpmOutcomeProbability = getDpmOutcomeProbability;
function getDpmOutcomeProbabilities(totalShares) {
    const squareSum = (0, lodash_1.sumBy)(Object.values(totalShares), (shares) => shares ** 2);
    return (0, lodash_1.mapValues)(totalShares, (shares) => shares ** 2 / squareSum);
}
exports.getDpmOutcomeProbabilities = getDpmOutcomeProbabilities;
function getNumericBets(contract, bucket, betAmount, variance) {
    const { bucketCount } = contract;
    const bucketNumber = parseInt(bucket);
    const buckets = (0, lodash_1.range)(0, bucketCount);
    const mean = bucketNumber / bucketCount;
    const allDensities = buckets.map((i) => (0, math_1.normpdf)(i / bucketCount, mean, variance));
    const densitySum = (0, lodash_1.sum)(allDensities);
    const rawBetAmounts = allDensities
        .map((d) => (d / densitySum) * betAmount)
        .map((x) => (x >= 1 / bucketCount ? x : 0));
    const rawSum = (0, lodash_1.sum)(rawBetAmounts);
    const scaledBetAmounts = rawBetAmounts.map((x) => (x / rawSum) * betAmount);
    const bets = scaledBetAmounts
        .map((x, i) => (x > 0 ? [i.toString(), x] : undefined))
        .filter((x) => x != undefined);
    return bets;
}
exports.getNumericBets = getNumericBets;
const getMappedBucket = (value, contract) => {
    const { bucketCount, min, max } = contract;
    const index = Math.floor(((value - min) / (max - min)) * bucketCount);
    const bucket = Math.max(Math.min(index, bucketCount - 1), 0);
    return `${bucket}`;
};
exports.getMappedBucket = getMappedBucket;
const getValueFromBucket = (bucket, contract) => {
    const { bucketCount, min, max } = contract;
    const index = parseInt(bucket);
    const value = min + (index / bucketCount) * (max - min);
    const rounded = Math.round(value * 1e4) / 1e4;
    return rounded;
};
exports.getValueFromBucket = getValueFromBucket;
const getExpectedValue = (contract) => {
    const { bucketCount, min, max, totalShares } = contract;
    const totalShareSum = (0, lodash_1.sumBy)(Object.values(totalShares), (shares) => shares ** 2);
    const probs = (0, lodash_1.range)(0, bucketCount).map((i) => totalShares[i] ** 2 / totalShareSum);
    const values = (0, lodash_1.range)(0, bucketCount).map((i) => 
    // use mid point within bucket
    0.5 * (min + (i / bucketCount) * (max - min)) +
        0.5 * (min + ((i + 1) / bucketCount) * (max - min)));
    const weightedValues = (0, lodash_1.range)(0, bucketCount).map((i) => probs[i] * values[i]);
    const expectation = (0, lodash_1.sum)(weightedValues);
    const rounded = Math.round(expectation * 1e2) / 1e2;
    return rounded;
};
exports.getExpectedValue = getExpectedValue;
function getDpmOutcomeProbabilityAfterBet(totalShares, outcome, bet) {
    var _a;
    const shares = calculateDpmShares(totalShares, bet, outcome);
    const prevShares = (_a = totalShares[outcome]) !== null && _a !== void 0 ? _a : 0;
    const newTotalShares = Object.assign(Object.assign({}, totalShares), { [outcome]: prevShares + shares });
    return getDpmOutcomeProbability(newTotalShares, outcome);
}
exports.getDpmOutcomeProbabilityAfterBet = getDpmOutcomeProbabilityAfterBet;
function getDpmProbabilityAfterSale(totalShares, outcome, shares) {
    var _a;
    const prevShares = (_a = totalShares[outcome]) !== null && _a !== void 0 ? _a : 0;
    const newTotalShares = Object.assign(Object.assign({}, totalShares), { [outcome]: prevShares - shares });
    const predictionOutcome = outcome === 'NO' ? 'YES' : outcome;
    return getDpmOutcomeProbability(newTotalShares, predictionOutcome);
}
exports.getDpmProbabilityAfterSale = getDpmProbabilityAfterSale;
function calculateDpmShares(totalShares, bet, betChoice) {
    var _a;
    const squareSum = (0, lodash_1.sumBy)(Object.values(totalShares), (shares) => shares ** 2);
    const shares = (_a = totalShares[betChoice]) !== null && _a !== void 0 ? _a : 0;
    const c = 2 * bet * Math.sqrt(squareSum);
    return Math.sqrt(bet ** 2 + shares ** 2 + c) - shares;
}
exports.calculateDpmShares = calculateDpmShares;
function calculateNumericDpmShares(totalShares, bets) {
    const shares = [];
    totalShares = (0, lodash_1.cloneDeep)(totalShares);
    const order = (0, lodash_1.sortBy)(bets.map(([, amount], i) => [amount, i]), ([amount]) => amount).map(([, i]) => i);
    for (const i of order) {
        const [bucket, bet] = bets[i];
        shares[i] = calculateDpmShares(totalShares, bet, bucket);
        totalShares = (0, object_1.addObjects)(totalShares, { [bucket]: shares[i] });
    }
    return { shares, totalShares };
}
exports.calculateNumericDpmShares = calculateNumericDpmShares;
function calculateDpmRawShareValue(totalShares, shares, betChoice) {
    const currentValue = Math.sqrt((0, lodash_1.sumBy)(Object.values(totalShares), (shares) => shares ** 2));
    const postSaleValue = Math.sqrt((0, lodash_1.sumBy)(Object.keys(totalShares), (outcome) => outcome === betChoice
        ? Math.max(0, totalShares[outcome] - shares) ** 2
        : totalShares[outcome] ** 2));
    return currentValue - postSaleValue;
}
exports.calculateDpmRawShareValue = calculateDpmRawShareValue;
function calculateDpmMoneyRatio(contract, bet, shareValue) {
    const { totalShares, totalBets, pool } = contract;
    const { outcome, amount } = bet;
    const p = getDpmOutcomeProbability(totalShares, outcome);
    const actual = (0, lodash_1.sum)(Object.values(pool)) - shareValue;
    const betAmount = p * amount;
    const expected = (0, lodash_1.sumBy)(Object.keys(totalBets), (outcome) => getDpmOutcomeProbability(totalShares, outcome) *
        totalBets[outcome]) - betAmount;
    if (actual <= 0 || expected <= 0)
        return 0;
    return actual / expected;
}
exports.calculateDpmMoneyRatio = calculateDpmMoneyRatio;
function calculateDpmShareValue(contract, bet) {
    const { pool, totalShares } = contract;
    const { shares, outcome } = bet;
    const shareValue = calculateDpmRawShareValue(totalShares, shares, outcome);
    const f = calculateDpmMoneyRatio(contract, bet, shareValue);
    const myPool = pool[outcome];
    const adjShareValue = Math.min(Math.min(1, f) * shareValue, myPool);
    return adjShareValue;
}
exports.calculateDpmShareValue = calculateDpmShareValue;
function calculateDpmSaleAmount(contract, bet) {
    const { amount } = bet;
    const winnings = calculateDpmShareValue(contract, bet);
    return (0, exports.deductDpmFees)(amount, winnings);
}
exports.calculateDpmSaleAmount = calculateDpmSaleAmount;
function calculateDpmPayout(contract, bet, outcome) {
    if (outcome === 'CANCEL')
        return calculateDpmCancelPayout(contract, bet);
    if (outcome === 'MKT')
        return calculateMktDpmPayout(contract, bet);
    return calculateStandardDpmPayout(contract, bet, outcome);
}
exports.calculateDpmPayout = calculateDpmPayout;
function calculateDpmCancelPayout(contract, bet) {
    const { totalBets, pool } = contract;
    const betTotal = (0, lodash_1.sum)(Object.values(totalBets));
    const poolTotal = (0, lodash_1.sum)(Object.values(pool));
    return (bet.amount / betTotal) * poolTotal;
}
exports.calculateDpmCancelPayout = calculateDpmCancelPayout;
function calculateStandardDpmPayout(contract, bet, outcome) {
    var _a;
    const { outcome: betOutcome } = bet;
    const isNumeric = contract.outcomeType === 'NUMERIC';
    if (!isNumeric && betOutcome !== outcome)
        return 0;
    const shares = isNumeric
        ? ((_a = bet.allOutcomeShares) !== null && _a !== void 0 ? _a : {})[outcome]
        : bet.shares;
    if (!shares)
        return 0;
    const { totalShares, phantomShares, pool } = contract;
    if (!totalShares[outcome])
        return 0;
    const poolTotal = (0, lodash_1.sum)(Object.values(pool));
    const total = totalShares[outcome] - (phantomShares ? phantomShares[outcome] : 0);
    const winnings = (shares / total) * poolTotal;
    const amount = isNumeric
        ? bet.allBetAmounts[outcome]
        : bet.amount;
    const payout = amount + (1 - fees_1.DPM_FEES) * Math.max(0, winnings - amount);
    return payout;
}
exports.calculateStandardDpmPayout = calculateStandardDpmPayout;
function calculateDpmPayoutAfterCorrectBet(contract, bet) {
    var _a, _b, _c;
    const { totalShares, pool, totalBets, outcomeType } = contract;
    const { shares, amount, outcome } = bet;
    const prevShares = (_a = totalShares[outcome]) !== null && _a !== void 0 ? _a : 0;
    const prevPool = (_b = pool[outcome]) !== null && _b !== void 0 ? _b : 0;
    const prevTotalBet = (_c = totalBets[outcome]) !== null && _c !== void 0 ? _c : 0;
    const newContract = Object.assign(Object.assign({}, contract), { totalShares: Object.assign(Object.assign({}, totalShares), { [outcome]: prevShares + shares }), pool: Object.assign(Object.assign({}, pool), { [outcome]: prevPool + amount }), totalBets: Object.assign(Object.assign({}, totalBets), { [outcome]: prevTotalBet + amount }), outcomeType: outcomeType === 'NUMERIC'
            ? 'FREE_RESPONSE' // hack to show payout at particular bet point estimate
            : outcomeType });
    return calculateStandardDpmPayout(newContract, bet, outcome);
}
exports.calculateDpmPayoutAfterCorrectBet = calculateDpmPayoutAfterCorrectBet;
function calculateMktDpmPayout(contract, bet) {
    var _a;
    if (contract.outcomeType === 'BINARY')
        return calculateBinaryMktDpmPayout(contract, bet);
    const { totalShares, pool, resolutions, outcomeType } = contract;
    let probs;
    if (resolutions) {
        const probTotal = (0, lodash_1.sum)(Object.values(resolutions));
        probs = (0, lodash_1.mapValues)(totalShares, (_, outcome) => { var _a; return ((_a = resolutions[outcome]) !== null && _a !== void 0 ? _a : 0) / probTotal; });
    }
    else {
        const squareSum = (0, lodash_1.sum)(Object.values(totalShares).map((shares) => shares ** 2));
        probs = (0, lodash_1.mapValues)(totalShares, (shares) => shares ** 2 / squareSum);
    }
    const { outcome, amount, shares } = bet;
    const poolFrac = outcomeType === 'NUMERIC'
        ? (0, lodash_1.sumBy)(Object.keys((_a = bet.allOutcomeShares) !== null && _a !== void 0 ? _a : {}), (outcome) => {
            return ((probs[outcome] * bet.allOutcomeShares[outcome]) /
                totalShares[outcome]);
        })
        : (probs[outcome] * shares) / totalShares[outcome];
    const totalPool = (0, lodash_1.sum)(Object.values(pool));
    const winnings = poolFrac * totalPool;
    return (0, exports.deductDpmFees)(amount, winnings);
}
function calculateBinaryMktDpmPayout(contract, bet) {
    var _a, _b;
    const { resolutionProbability, totalShares, phantomShares } = contract;
    const p = resolutionProbability !== undefined
        ? resolutionProbability
        : getDpmProbability(totalShares);
    const pool = contract.pool.YES + contract.pool.NO;
    const weightedShareTotal = p * (totalShares.YES - ((_a = phantomShares === null || phantomShares === void 0 ? void 0 : phantomShares.YES) !== null && _a !== void 0 ? _a : 0)) +
        (1 - p) * (totalShares.NO - ((_b = phantomShares === null || phantomShares === void 0 ? void 0 : phantomShares.NO) !== null && _b !== void 0 ? _b : 0));
    const { outcome, amount, shares } = bet;
    const betP = outcome === 'YES' ? p : 1 - p;
    const winnings = ((betP * shares) / weightedShareTotal) * pool;
    return (0, exports.deductDpmFees)(amount, winnings);
}
function resolvedDpmPayout(contract, bet) {
    if (contract.resolution)
        return calculateDpmPayout(contract, bet, contract.resolution);
    throw new Error('Contract was not resolved');
}
exports.resolvedDpmPayout = resolvedDpmPayout;
const deductDpmFees = (betAmount, winnings) => {
    return winnings > betAmount
        ? betAmount + (1 - fees_1.DPM_FEES) * (winnings - betAmount)
        : winnings;
};
exports.deductDpmFees = deductDpmFees;
const calcDpmInitialPool = (initialProbInt, ante, phantomAnte) => {
    const p = initialProbInt / 100.0;
    const totalAnte = phantomAnte + ante;
    const sharesYes = Math.sqrt(p * totalAnte ** 2);
    const sharesNo = Math.sqrt(totalAnte ** 2 - sharesYes ** 2);
    const poolYes = p * ante;
    const poolNo = (1 - p) * ante;
    const phantomYes = Math.sqrt(p) * phantomAnte;
    const phantomNo = Math.sqrt(1 - p) * phantomAnte;
    return { sharesYes, sharesNo, poolYes, poolNo, phantomYes, phantomNo };
};
exports.calcDpmInitialPool = calcDpmInitialPool;
//# sourceMappingURL=calculate-dpm.js.map