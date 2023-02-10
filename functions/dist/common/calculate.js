"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLargestPosition = exports.getTopNSortedAnswers = exports.getTopAnswer = exports.getContractBetNullMetrics = exports.getContractBetMetrics = exports.resolvedPayout = exports.calculatePayout = exports.calculateSharesBought = exports.getOutcomeProbabilityAfterBet = exports.getOutcomeProbability = exports.getInitialProbability = exports.getProbability = void 0;
const lodash_1 = require("lodash");
const calculate_cpmm_1 = require("./calculate-cpmm");
const calculate_cpmm_multi_1 = require("./calculate-cpmm-multi");
const calculate_dpm_1 = require("./calculate-dpm");
const calculate_fixed_payouts_1 = require("./calculate-fixed-payouts");
const math_1 = require("./util/math");
function getProbability(contract) {
    return contract.mechanism === 'cpmm-1'
        ? (0, calculate_cpmm_1.getCpmmProbability)(contract.pool, contract.p)
        : (0, calculate_dpm_1.getDpmProbability)(contract.totalShares);
}
exports.getProbability = getProbability;
function getInitialProbability(contract) {
    var _a;
    if (contract.initialProbability)
        return contract.initialProbability;
    if (contract.mechanism === 'dpm-2' || contract.totalShares)
        // use totalShares to calculate prob for ported contracts
        return (0, calculate_dpm_1.getDpmProbability)((_a = contract.phantomShares) !== null && _a !== void 0 ? _a : contract.totalShares);
    return (0, calculate_cpmm_1.getCpmmProbability)(contract.pool, contract.p);
}
exports.getInitialProbability = getInitialProbability;
function getOutcomeProbability(contract, outcome) {
    const { mechanism, pool } = contract;
    switch (mechanism) {
        case 'cpmm-1':
            return outcome === 'YES'
                ? (0, calculate_cpmm_1.getCpmmProbability)(pool, contract.p)
                : 1 - (0, calculate_cpmm_1.getCpmmProbability)(pool, contract.p);
        case 'cpmm-2':
            return (0, calculate_cpmm_multi_1.getProb)(pool, outcome);
        case 'dpm-2':
            return (0, calculate_dpm_1.getDpmOutcomeProbability)(contract.totalShares, outcome);
        default:
            throw new Error('getOutcomeProbability not implemented');
    }
}
exports.getOutcomeProbability = getOutcomeProbability;
function getOutcomeProbabilityAfterBet(contract, outcome, bet) {
    const { mechanism, pool } = contract;
    switch (mechanism) {
        case 'cpmm-1':
            return (0, calculate_cpmm_1.getCpmmOutcomeProbabilityAfterBet)(contract, outcome, bet);
        case 'cpmm-2':
            return (0, calculate_cpmm_multi_1.getProb)((0, calculate_cpmm_multi_1.buy)(pool, outcome, bet).newPool, outcome);
        case 'dpm-2':
            return (0, calculate_dpm_1.getDpmOutcomeProbabilityAfterBet)(contract.totalShares, outcome, bet);
        default:
            throw new Error('getOutcomeProbabilityAfterBet not implemented');
    }
}
exports.getOutcomeProbabilityAfterBet = getOutcomeProbabilityAfterBet;
function calculateSharesBought(contract, outcome, amount) {
    const { mechanism, pool } = contract;
    switch (mechanism) {
        case 'cpmm-1':
            return (0, calculate_cpmm_1.calculateCpmmPurchase)(contract, amount, outcome).shares;
        case 'cpmm-2':
            return (0, calculate_cpmm_multi_1.buy)(pool, outcome, amount).shares;
        case 'dpm-2':
            return (0, calculate_dpm_1.calculateDpmShares)(contract.totalShares, amount, outcome);
        default:
            throw new Error('calculateSharesBought not implemented');
    }
}
exports.calculateSharesBought = calculateSharesBought;
function calculatePayout(contract, bet, outcome) {
    const { mechanism } = contract;
    return mechanism === 'cpmm-1' || mechanism === 'cpmm-2'
        ? (0, calculate_fixed_payouts_1.calculateFixedPayout)(contract, bet, outcome)
        : mechanism === 'dpm-2'
            ? (0, calculate_dpm_1.calculateDpmPayout)(contract, bet, outcome)
            : 0;
}
exports.calculatePayout = calculatePayout;
function resolvedPayout(contract, bet) {
    const { resolution, mechanism } = contract;
    if (!resolution)
        throw new Error('Contract not resolved');
    return mechanism === 'cpmm-1' || mechanism === 'cpmm-2'
        ? (0, calculate_fixed_payouts_1.calculateFixedPayout)(contract, bet, resolution)
        : mechanism === 'dpm-2'
            ? (0, calculate_dpm_1.calculateDpmPayout)(contract, bet, resolution)
            : 0;
}
exports.resolvedPayout = resolvedPayout;
// Note: Works for cpmm-1 and cpmm-2.
function getCpmmInvested(yourBets) {
    var _a, _b;
    const totalShares = {};
    const totalSpent = {};
    const sortedBets = (0, lodash_1.sortBy)(yourBets, 'createdTime');
    const sharePurchases = sortedBets
        .map((bet) => {
        const { sharesByOutcome } = bet;
        if (sharesByOutcome) {
            const shareSum = (0, lodash_1.sum)(Object.values(sharesByOutcome));
            return Object.entries(sharesByOutcome).map(([outcome, shares]) => ({
                outcome,
                shares,
                amount: (bet.amount * shares) / shareSum,
            }));
        }
        return [bet];
    })
        .flat();
    for (const purchase of sharePurchases) {
        const { outcome, shares, amount } = purchase;
        if ((0, math_1.floatingEqual)(shares, 0))
            continue;
        const spent = (_a = totalSpent[outcome]) !== null && _a !== void 0 ? _a : 0;
        const position = (_b = totalShares[outcome]) !== null && _b !== void 0 ? _b : 0;
        if (amount > 0) {
            totalShares[outcome] = position + shares;
            totalSpent[outcome] = spent + amount;
        }
        else if (amount < 0) {
            const averagePrice = position === 0 ? 0 : spent / position;
            totalShares[outcome] = position + shares;
            totalSpent[outcome] = spent + averagePrice * shares;
        }
    }
    return (0, lodash_1.sum)(Object.values(totalSpent));
}
function getDpmInvested(yourBets) {
    const sortedBets = (0, lodash_1.sortBy)(yourBets, 'createdTime');
    return (0, lodash_1.sumBy)(sortedBets, (bet) => {
        const { amount, sale } = bet;
        if (sale) {
            const originalBet = sortedBets.find((b) => b.id === sale.betId);
            if (originalBet)
                return -originalBet.amount;
            return 0;
        }
        return amount;
    });
}
function getContractBetMetrics(contract, yourBets) {
    var _a, _b;
    const sortedBets = (0, lodash_1.sortBy)(yourBets, 'createdTime');
    const { resolution, mechanism } = contract;
    const isCpmm = mechanism === 'cpmm-1';
    let totalInvested = 0;
    let payout = 0;
    let loan = 0;
    let saleValue = 0;
    let redeemed = 0;
    const totalShares = {};
    for (const bet of sortedBets) {
        const { isSold, sale, amount, loanAmount, isRedemption, shares, sharesByOutcome, outcome, } = bet;
        if (sharesByOutcome) {
            for (const [o, s] of Object.entries(sharesByOutcome)) {
                totalShares[o] = ((_a = totalShares[o]) !== null && _a !== void 0 ? _a : 0) + s;
            }
        }
        else {
            totalShares[outcome] = ((_b = totalShares[outcome]) !== null && _b !== void 0 ? _b : 0) + shares;
        }
        if (isSold) {
            totalInvested += amount;
        }
        else if (sale) {
            saleValue += sale.amount;
        }
        else {
            if (isRedemption) {
                redeemed += -1 * amount;
            }
            else if (amount > 0) {
                totalInvested += amount;
            }
            else {
                saleValue -= amount;
            }
            loan += loanAmount !== null && loanAmount !== void 0 ? loanAmount : 0;
            payout += resolution
                ? calculatePayout(contract, bet, resolution)
                : calculatePayout(contract, bet, 'MKT');
        }
    }
    const profit = payout + saleValue + redeemed - totalInvested;
    const profitPercent = totalInvested === 0 ? 0 : (profit / totalInvested) * 100;
    const invested = isCpmm
        ? getCpmmInvested(sortedBets)
        : getDpmInvested(sortedBets);
    const hasShares = Object.values(totalShares).some((shares) => !(0, math_1.floatingEqual)(shares, 0));
    const { YES: yesShares, NO: noShares } = totalShares;
    const hasYesShares = yesShares >= 1;
    const hasNoShares = noShares >= 1;
    const lastBetTime = Math.max(...sortedBets.map((b) => b.createdTime));
    const maxSharesOutcome = hasShares
        ? (0, lodash_1.maxBy)(Object.keys(totalShares), (outcome) => totalShares[outcome])
        : null;
    return {
        invested,
        loan,
        payout,
        profit,
        profitPercent,
        totalShares,
        hasShares,
        hasYesShares,
        hasNoShares,
        maxSharesOutcome,
        lastBetTime,
    };
}
exports.getContractBetMetrics = getContractBetMetrics;
function getContractBetNullMetrics() {
    return {
        invested: 0,
        loan: 0,
        payout: 0,
        profit: 0,
        profitPercent: 0,
        totalShares: {},
        hasShares: false,
        hasYesShares: false,
        hasNoShares: false,
        maxSharesOutcome: null,
    };
}
exports.getContractBetNullMetrics = getContractBetNullMetrics;
function getTopAnswer(contract) {
    const { answers } = contract;
    const top = (0, lodash_1.maxBy)(answers === null || answers === void 0 ? void 0 : answers.map((answer) => ({
        answer,
        prob: getOutcomeProbability(contract, answer.id),
    })), ({ prob }) => prob);
    return top === null || top === void 0 ? void 0 : top.answer;
}
exports.getTopAnswer = getTopAnswer;
function getTopNSortedAnswers(contract, n) {
    const { answers, resolution, resolutions } = contract;
    const [winningAnswers, losingAnswers] = (0, lodash_1.partition)(answers, (answer) => answer.id === resolution || (resolutions && resolutions[answer.id]));
    const sortedAnswers = [
        ...(0, lodash_1.sortBy)(winningAnswers, (answer) => resolutions ? -1 * resolutions[answer.id] : 0),
        ...(0, lodash_1.sortBy)(losingAnswers, (answer) => -1 * getOutcomeProbability(contract, answer.id)),
    ].slice(0, n);
    return sortedAnswers;
}
exports.getTopNSortedAnswers = getTopNSortedAnswers;
function getLargestPosition(contract, userBets) {
    if (userBets.length === 0) {
        return null;
    }
    const { totalShares, hasShares } = getContractBetMetrics(contract, userBets);
    if (!hasShares)
        return null;
    const outcome = (0, lodash_1.maxBy)(Object.keys(totalShares), (outcome) => totalShares[outcome]);
    if (!outcome)
        return null;
    const shares = totalShares[outcome];
    return { outcome, shares };
}
exports.getLargestPosition = getLargestPosition;
//# sourceMappingURL=calculate.js.map