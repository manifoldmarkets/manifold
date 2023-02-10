"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateStandardFixedPayout = exports.calculateFixedCancelPayout = exports.calculateFixedPayout = void 0;
const calculate_1 = require("./calculate");
const calculate_cpmm_multi_1 = require("./calculate-cpmm-multi");
const lodash_1 = require("lodash");
function calculateFixedPayout(contract, bet, outcome) {
    if (outcome === 'CANCEL')
        return calculateFixedCancelPayout(bet);
    if (outcome === 'MKT')
        return calculateFixedMktPayout(contract, bet);
    return calculateStandardFixedPayout(bet, outcome);
}
exports.calculateFixedPayout = calculateFixedPayout;
function calculateFixedCancelPayout(bet) {
    return bet.amount;
}
exports.calculateFixedCancelPayout = calculateFixedCancelPayout;
function calculateStandardFixedPayout(bet, outcome) {
    var _a;
    const { outcome: betOutcome, shares, sharesByOutcome } = bet;
    if (sharesByOutcome) {
        return (_a = sharesByOutcome[outcome]) !== null && _a !== void 0 ? _a : 0;
    }
    if (betOutcome !== outcome)
        return 0;
    return shares;
}
exports.calculateStandardFixedPayout = calculateStandardFixedPayout;
function calculateFixedMktPayout(contract, bet) {
    var _a;
    const { outcome, shares, sharesByOutcome } = bet;
    if (contract.outcomeType === 'BINARY' ||
        contract.outcomeType === 'PSEUDO_NUMERIC') {
        const { resolutionProbability } = contract;
        const p = resolutionProbability !== undefined
            ? resolutionProbability
            : (0, calculate_1.getProbability)(contract);
        const betP = outcome === 'YES' ? p : 1 - p;
        return betP * shares;
    }
    const { resolutions, pool } = contract;
    const resolutionsSum = resolutions ? (0, lodash_1.sum)(Object.values(resolutions)) : 100;
    let p;
    if (resolutions) {
        p = ((_a = resolutions[outcome]) !== null && _a !== void 0 ? _a : 0) / resolutionsSum;
    }
    else {
        p = (0, calculate_cpmm_multi_1.getProb)(contract.pool, outcome);
    }
    if (sharesByOutcome) {
        return (0, lodash_1.sum)(Object.values((0, lodash_1.mapValues)(sharesByOutcome, (s, o) => {
            var _a;
            const p = resolutions
                ? ((_a = resolutions[o]) !== null && _a !== void 0 ? _a : 0) / resolutionsSum
                : (0, calculate_cpmm_multi_1.getProb)(pool, o);
            return s * p;
        })));
    }
    return p * shares;
}
//# sourceMappingURL=calculate-fixed-payouts.js.map