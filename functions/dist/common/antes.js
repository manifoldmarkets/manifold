"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNumericAnte = exports.getFreeAnswerAnte = exports.getAnteBets = exports.getMultipleChoiceAntes = exports.getCpmm2InitialLiquidity = exports.getCpmmInitialLiquidity = exports.UNIQUE_BETTOR_LIQUIDITY_AMOUNT = exports.DEV_HOUSE_LIQUIDITY_PROVIDER_ID = exports.HOUSE_LIQUIDITY_PROVIDER_ID = void 0;
const lodash_1 = require("lodash");
const calculate_dpm_1 = require("./calculate-dpm");
const fees_1 = require("./fees");
exports.HOUSE_LIQUIDITY_PROVIDER_ID = 'IPTOzEqrpkWmEzh6hwvAyY9PqFb2'; // @ManifoldMarkets' id
exports.DEV_HOUSE_LIQUIDITY_PROVIDER_ID = '94YYTk1AFWfbWMpfYcvnnwI1veP2'; // @ManifoldMarkets' id
exports.UNIQUE_BETTOR_LIQUIDITY_AMOUNT = 20;
function getCpmmInitialLiquidity(providerId, contract, anteId, amount) {
    const { createdTime } = contract;
    const lp = {
        id: anteId,
        userId: providerId,
        contractId: contract.id,
        createdTime,
        isAnte: true,
        amount: amount,
        liquidity: amount,
        pool: { YES: 0, NO: 0 },
    };
    return lp;
}
exports.getCpmmInitialLiquidity = getCpmmInitialLiquidity;
function getCpmm2InitialLiquidity(providerId, contract, anteId, amount) {
    const { createdTime, pool } = contract;
    const lp = {
        id: anteId,
        userId: providerId,
        contractId: contract.id,
        createdTime,
        isAnte: true,
        amount: amount,
        liquidity: amount,
        pool,
    };
    return lp;
}
exports.getCpmm2InitialLiquidity = getCpmm2InitialLiquidity;
function getMultipleChoiceAntes(creator, contract, answers, betDocIds) {
    const { totalBets, totalShares } = contract;
    const amount = totalBets['0'];
    const shares = totalShares['0'];
    const p = 1 / answers.length;
    const { createdTime } = contract;
    const bets = answers.map((answer, i) => ({
        id: betDocIds[i],
        userId: creator.id,
        contractId: contract.id,
        amount,
        shares,
        outcome: i.toString(),
        probBefore: p,
        probAfter: p,
        createdTime,
        isAnte: true,
        isRedemption: false,
        isChallenge: false,
        fees: fees_1.noFees,
    }));
    const { username, name, avatarUrl } = creator;
    const answerObjects = answers.map((answer, i) => ({
        id: i.toString(),
        number: i,
        contractId: contract.id,
        createdTime,
        userId: creator.id,
        username,
        name,
        avatarUrl,
        text: answer,
    }));
    return { bets, answerObjects };
}
exports.getMultipleChoiceAntes = getMultipleChoiceAntes;
function getAnteBets(creator, contract, yesAnteId, noAnteId) {
    const p = (0, calculate_dpm_1.getDpmProbability)(contract.totalShares);
    const ante = contract.totalBets.YES + contract.totalBets.NO;
    const { createdTime } = contract;
    const yesBet = {
        id: yesAnteId,
        userId: creator.id,
        contractId: contract.id,
        amount: p * ante,
        shares: Math.sqrt(p) * ante,
        outcome: 'YES',
        probBefore: p,
        probAfter: p,
        createdTime,
        fees: fees_1.noFees,
        isAnte: true,
        isRedemption: false,
        isChallenge: false,
    };
    const noBet = {
        id: noAnteId,
        userId: creator.id,
        contractId: contract.id,
        amount: (1 - p) * ante,
        shares: Math.sqrt(1 - p) * ante,
        outcome: 'NO',
        probBefore: p,
        probAfter: p,
        createdTime,
        fees: fees_1.noFees,
        isAnte: true,
        isRedemption: false,
        isChallenge: false,
    };
    return { yesBet, noBet };
}
exports.getAnteBets = getAnteBets;
function getFreeAnswerAnte(anteBettorId, contract, anteBetId) {
    const { totalBets, totalShares } = contract;
    const amount = totalBets['0'];
    const shares = totalShares['0'];
    const { createdTime } = contract;
    const anteBet = {
        id: anteBetId,
        userId: anteBettorId,
        contractId: contract.id,
        amount,
        shares,
        outcome: '0',
        probBefore: 0,
        probAfter: 1,
        createdTime,
        fees: fees_1.noFees,
        isAnte: true,
        isRedemption: false,
        isChallenge: false,
    };
    return anteBet;
}
exports.getFreeAnswerAnte = getFreeAnswerAnte;
function getNumericAnte(anteBettorId, contract, ante, newBetId) {
    const { bucketCount, createdTime } = contract;
    const betAnte = ante / bucketCount;
    const betShares = Math.sqrt(ante ** 2 / bucketCount);
    const allOutcomeShares = Object.fromEntries((0, lodash_1.range)(0, bucketCount).map((_, i) => [i, betShares]));
    const allBetAmounts = Object.fromEntries((0, lodash_1.range)(0, bucketCount).map((_, i) => [i, betAnte]));
    const anteBet = {
        id: newBetId,
        userId: anteBettorId,
        contractId: contract.id,
        amount: ante,
        allBetAmounts,
        outcome: '0',
        value: (0, calculate_dpm_1.getValueFromBucket)('0', contract),
        shares: betShares,
        allOutcomeShares,
        probBefore: 0,
        probAfter: 1 / bucketCount,
        createdTime,
        fees: fees_1.noFees,
        isAnte: true,
        isRedemption: false,
        isChallenge: false,
    };
    return anteBet;
}
exports.getNumericAnte = getNumericAnte;
//# sourceMappingURL=antes.js.map