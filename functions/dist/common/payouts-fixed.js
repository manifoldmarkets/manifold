"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLiquidityPoolProbPayouts = exports.getMktFixedPayouts = exports.getLiquidityPoolPayouts = exports.getStandardFixedPayouts = exports.getFixedCancelPayouts = void 0;
const lodash_1 = require("lodash");
const calculate_1 = require("./calculate");
const calculate_cpmm_1 = require("./calculate-cpmm");
const fees_1 = require("./fees");
const getFixedCancelPayouts = (bets, liquidities) => {
    const liquidityPayouts = liquidities.map((lp) => ({
        userId: lp.userId,
        payout: lp.amount,
    }));
    const payouts = bets
        .filter((b) => !b.isAnte)
        .map((bet) => ({
        userId: bet.userId,
        payout: bet.amount,
    }));
    const creatorPayout = 0;
    return { payouts, creatorPayout, liquidityPayouts, collectedFees: fees_1.noFees };
};
exports.getFixedCancelPayouts = getFixedCancelPayouts;
const getStandardFixedPayouts = (outcome, contract, bets, liquidities) => {
    const winningBets = bets.filter((bet) => bet.outcome === outcome ||
        (bet.sharesByOutcome && bet.sharesByOutcome[outcome]));
    const payouts = winningBets.map(({ userId, shares, sharesByOutcome }) => {
        var _a;
        return ({
            userId,
            payout: sharesByOutcome ? (_a = sharesByOutcome[outcome]) !== null && _a !== void 0 ? _a : 0 : shares,
        });
    });
    const { collectedFees } = contract;
    const creatorPayout = collectedFees.creatorFee;
    const liquidityPayouts = (0, exports.getLiquidityPoolPayouts)(contract, outcome, liquidities);
    return { payouts, creatorPayout, liquidityPayouts, collectedFees };
};
exports.getStandardFixedPayouts = getStandardFixedPayouts;
const getLiquidityPoolPayouts = (contract, outcome, liquidities) => {
    const { pool, subsidyPool } = contract;
    const finalPool = pool[outcome] + (subsidyPool !== null && subsidyPool !== void 0 ? subsidyPool : 0);
    if (finalPool < 1e-3)
        return [];
    const weights = (0, calculate_cpmm_1.getCpmmLiquidityPoolWeights)(liquidities);
    return Object.entries(weights).map(([providerId, weight]) => ({
        userId: providerId,
        payout: weight * finalPool,
    }));
};
exports.getLiquidityPoolPayouts = getLiquidityPoolPayouts;
const getMktFixedPayouts = (contract, bets, liquidities, resolutionProbs, resolutionProbability) => {
    const { collectedFees, outcomeType } = contract;
    const creatorPayout = collectedFees.creatorFee;
    const outcomeProbs = (() => {
        if (outcomeType === 'BINARY' || outcomeType === 'PSEUDO_NUMERIC') {
            const p = resolutionProbability === undefined
                ? (0, calculate_1.getProbability)(contract)
                : resolutionProbability;
            return { YES: p, NO: 1 - p };
        }
        if (resolutionProbs)
            return (0, lodash_1.mapValues)(resolutionProbs, (p) => p / 100);
        return (0, lodash_1.mapValues)(contract.pool, (_, o) => (0, calculate_1.getOutcomeProbability)(contract, o));
    })();
    const payouts = bets.map(({ userId, outcome, shares, sharesByOutcome }) => {
        var _a;
        let payout;
        if (sharesByOutcome) {
            payout = (0, lodash_1.sum)(Object.values((0, lodash_1.mapValues)(sharesByOutcome, (s, o) => { var _a; return s * ((_a = outcomeProbs[o]) !== null && _a !== void 0 ? _a : 0); })));
        }
        else {
            const p = (_a = outcomeProbs[outcome]) !== null && _a !== void 0 ? _a : 0;
            payout = p * shares;
        }
        return { userId, payout };
    });
    const liquidityPayouts = (0, exports.getLiquidityPoolProbPayouts)(contract, outcomeProbs, liquidities);
    return { payouts, creatorPayout, liquidityPayouts, collectedFees };
};
exports.getMktFixedPayouts = getMktFixedPayouts;
const getLiquidityPoolProbPayouts = (contract, outcomeProbs, liquidities) => {
    const { pool, subsidyPool } = contract;
    const finalPool = (0, lodash_1.sumBy)(Object.keys(pool), (o) => { var _a; return pool[o] * ((_a = outcomeProbs[o]) !== null && _a !== void 0 ? _a : 0) + (subsidyPool !== null && subsidyPool !== void 0 ? subsidyPool : 0); });
    if (finalPool < 1e-3)
        return [];
    const weights = (0, calculate_cpmm_1.getCpmmLiquidityPoolWeights)(liquidities);
    return Object.entries(weights).map(([providerId, weight]) => ({
        userId: providerId,
        payout: weight * finalPool,
    }));
};
exports.getLiquidityPoolProbPayouts = getLiquidityPoolProbPayouts;
//# sourceMappingURL=payouts-fixed.js.map