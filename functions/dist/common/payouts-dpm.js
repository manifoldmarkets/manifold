"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPayoutsMultiOutcome = exports.getDpmMktPayouts = exports.getNumericDpmPayouts = exports.getDpmStandardPayouts = exports.getDpmCancelPayouts = void 0;
const lodash_1 = require("lodash");
const calculate_dpm_1 = require("./calculate-dpm");
const fees_1 = require("./fees");
const object_1 = require("./util/object");
const getDpmCancelPayouts = (contract, bets) => {
    const { pool } = contract;
    const poolTotal = (0, lodash_1.sum)(Object.values(pool));
    const betSum = (0, lodash_1.sumBy)(bets, (b) => b.amount);
    const payouts = bets.map((bet) => ({
        userId: bet.userId,
        payout: (bet.amount / betSum) * poolTotal,
    }));
    return {
        payouts,
        creatorPayout: 0,
        liquidityPayouts: [],
        collectedFees: contract.collectedFees,
    };
};
exports.getDpmCancelPayouts = getDpmCancelPayouts;
const getDpmStandardPayouts = (outcome, contract, bets) => {
    const winningBets = bets.filter((bet) => bet.outcome === outcome);
    const poolTotal = (0, lodash_1.sum)(Object.values(contract.pool));
    const totalShares = (0, lodash_1.sumBy)(winningBets, (b) => b.shares);
    const payouts = winningBets.map(({ userId, amount, shares }) => {
        const winnings = (shares / totalShares) * poolTotal;
        const profit = winnings - amount;
        // profit can be negative if using phantom shares
        const payout = amount + (1 - fees_1.DPM_FEES) * Math.max(0, profit);
        return { userId, profit, payout };
    });
    const profits = (0, lodash_1.sumBy)(payouts, (po) => Math.max(0, po.profit));
    const creatorFee = fees_1.DPM_CREATOR_FEE * profits;
    const platformFee = fees_1.DPM_PLATFORM_FEE * profits;
    const collectedFees = (0, object_1.addObjects)(contract.collectedFees, {
        creatorFee,
        platformFee,
        liquidityFee: 0,
    });
    return {
        payouts: payouts.map(({ userId, payout }) => ({ userId, payout })),
        creatorPayout: creatorFee,
        liquidityPayouts: [],
        collectedFees,
    };
};
exports.getDpmStandardPayouts = getDpmStandardPayouts;
const getNumericDpmPayouts = (outcome, contract, bets) => {
    const totalShares = (0, lodash_1.sumBy)(bets, (bet) => { var _a; return (_a = bet.allOutcomeShares[outcome]) !== null && _a !== void 0 ? _a : 0; });
    const winningBets = bets.filter((bet) => !!bet.allOutcomeShares[outcome]);
    const poolTotal = (0, lodash_1.sum)(Object.values(contract.pool));
    const payouts = winningBets.map(({ userId, allBetAmounts, allOutcomeShares }) => {
        var _a, _b;
        const shares = (_a = allOutcomeShares[outcome]) !== null && _a !== void 0 ? _a : 0;
        const winnings = (shares / totalShares) * poolTotal;
        const amount = (_b = allBetAmounts[outcome]) !== null && _b !== void 0 ? _b : 0;
        const profit = winnings - amount;
        // profit can be negative if using phantom shares
        const payout = amount + (1 - fees_1.DPM_FEES) * Math.max(0, profit);
        return { userId, profit, payout };
    });
    const profits = (0, lodash_1.sumBy)(payouts, (po) => Math.max(0, po.profit));
    const creatorFee = fees_1.DPM_CREATOR_FEE * profits;
    const platformFee = fees_1.DPM_PLATFORM_FEE * profits;
    const collectedFees = (0, object_1.addObjects)(contract.collectedFees, {
        creatorFee,
        platformFee,
        liquidityFee: 0,
    });
    return {
        payouts: payouts.map(({ userId, payout }) => ({ userId, payout })),
        creatorPayout: creatorFee,
        liquidityPayouts: [],
        collectedFees,
    };
};
exports.getNumericDpmPayouts = getNumericDpmPayouts;
const getDpmMktPayouts = (contract, bets, resolutionProbability) => {
    const p = resolutionProbability === undefined
        ? (0, calculate_dpm_1.getDpmProbability)(contract.totalShares)
        : resolutionProbability;
    const weightedShareTotal = (0, lodash_1.sumBy)(bets, (b) => b.outcome === 'YES' ? p * b.shares : (1 - p) * b.shares);
    const pool = contract.pool.YES + contract.pool.NO;
    const payouts = bets.map(({ userId, outcome, amount, shares }) => {
        const betP = outcome === 'YES' ? p : 1 - p;
        const winnings = ((betP * shares) / weightedShareTotal) * pool;
        const profit = winnings - amount;
        const payout = (0, calculate_dpm_1.deductDpmFees)(amount, winnings);
        return { userId, profit, payout };
    });
    const profits = (0, lodash_1.sumBy)(payouts, (po) => Math.max(0, po.profit));
    const creatorFee = fees_1.DPM_CREATOR_FEE * profits;
    const platformFee = fees_1.DPM_PLATFORM_FEE * profits;
    const collectedFees = (0, object_1.addObjects)(contract.collectedFees, {
        creatorFee,
        platformFee,
        liquidityFee: 0,
    });
    return {
        payouts: payouts.map(({ userId, payout }) => ({ userId, payout })),
        creatorPayout: creatorFee,
        liquidityPayouts: [],
        collectedFees,
    };
};
exports.getDpmMktPayouts = getDpmMktPayouts;
const getPayoutsMultiOutcome = (resolutions, contract, bets) => {
    const poolTotal = (0, lodash_1.sum)(Object.values(contract.pool));
    const winningBets = bets.filter((bet) => resolutions[bet.outcome]);
    const betsByOutcome = (0, lodash_1.groupBy)(winningBets, (bet) => bet.outcome);
    const sharesByOutcome = (0, lodash_1.mapValues)(betsByOutcome, (bets) => (0, lodash_1.sumBy)(bets, (bet) => bet.shares));
    const probTotal = (0, lodash_1.sum)(Object.values(resolutions));
    const payouts = winningBets.map(({ userId, outcome, amount, shares }) => {
        const prob = resolutions[outcome] / probTotal;
        const winnings = (shares / sharesByOutcome[outcome]) * prob * poolTotal;
        const profit = winnings - amount;
        const payout = amount + (1 - fees_1.DPM_FEES) * profit;
        return { userId, profit, payout };
    });
    const profits = (0, lodash_1.sumBy)(payouts, (po) => po.profit);
    const creatorFee = fees_1.DPM_CREATOR_FEE * profits;
    const platformFee = fees_1.DPM_PLATFORM_FEE * profits;
    const collectedFees = (0, object_1.addObjects)(contract.collectedFees, {
        creatorFee,
        platformFee,
        liquidityFee: 0,
    });
    return {
        payouts: payouts.map(({ userId, payout }) => ({ userId, payout })),
        creatorPayout: creatorFee,
        liquidityPayouts: [],
        collectedFees,
    };
};
exports.getPayoutsMultiOutcome = getPayoutsMultiOutcome;
//# sourceMappingURL=payouts-dpm.js.map