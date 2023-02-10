"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateUserMetrics = exports.calculateMetricsByContract = exports.calculateNewProfit = exports.calculatePortfolioProfit = exports.calculateNewPortfolioMetrics = exports.calculateCreatorTraders = exports.computeDpmElasticity = exports.computeCPMM2Elasticity = exports.computeBinaryCpmmElasticityFromAnte = exports.computeBinaryCpmmElasticity = exports.computeElasticity = exports.ELASTICITY_BET_AMOUNT = exports.computeInvestmentValueCustomProb = void 0;
const lodash_1 = require("lodash");
const calculate_1 = require("./calculate");
const time_1 = require("./util/time");
const new_bet_1 = require("./new-bet");
const calculate_cpmm_1 = require("./calculate-cpmm");
const object_1 = require("./util/object");
const calculate_cpmm_multi_1 = require("./calculate-cpmm-multi");
const math_1 = require("./util/math");
const computeInvestmentValue = (bets, contractsDict) => {
    return (0, lodash_1.sumBy)(bets, (bet) => {
        var _a;
        const contract = contractsDict[bet.contractId];
        if (!contract || contract.isResolved)
            return 0;
        if (bet.sale || bet.isSold)
            return 0;
        let payout;
        try {
            payout = (0, calculate_1.calculatePayout)(contract, bet, 'MKT');
        }
        catch (e) {
            console.log('contract', contract.question, contract.mechanism, contract.id);
            console.error(e);
            payout = 0;
        }
        const value = payout - ((_a = bet.loanAmount) !== null && _a !== void 0 ? _a : 0);
        if (isNaN(value))
            return 0;
        return value;
    });
};
const computeInvestmentValueCustomProb = (bets, contract, p) => {
    return (0, lodash_1.sumBy)(bets, (bet) => {
        if (!contract)
            return 0;
        if (bet.sale || bet.isSold)
            return 0;
        const { outcome, shares } = bet;
        const betP = outcome === 'YES' ? p : 1 - p;
        const value = betP * shares;
        if (isNaN(value))
            return 0;
        return value;
    });
};
exports.computeInvestmentValueCustomProb = computeInvestmentValueCustomProb;
exports.ELASTICITY_BET_AMOUNT = 100;
const computeElasticity = (unfilledBets, contract, betAmount = exports.ELASTICITY_BET_AMOUNT) => {
    switch (contract.mechanism) {
        case 'cpmm-1':
            return (0, exports.computeBinaryCpmmElasticity)(unfilledBets, contract, betAmount);
        case 'cpmm-2':
            return (0, exports.computeCPMM2Elasticity)(contract, betAmount);
        case 'dpm-2':
            return (0, exports.computeDpmElasticity)(contract, betAmount);
        default: // there are some contracts on the dev DB with crazy mechanisms
            return 1;
    }
};
exports.computeElasticity = computeElasticity;
const logit = (x) => Math.log(x / (1 - x));
const computeBinaryCpmmElasticity = (unfilledBets, contract, betAmount) => {
    const sortedBets = unfilledBets.sort((a, b) => a.createdTime - b.createdTime);
    const userIds = (0, lodash_1.uniq)(unfilledBets.map((b) => b.userId));
    // Assume all limit orders are good.
    const userBalances = Object.fromEntries(userIds.map((id) => [id, Number.MAX_SAFE_INTEGER]));
    const { newPool: poolY, newP: pY } = (0, new_bet_1.getBinaryCpmmBetInfo)('YES', betAmount, contract, undefined, sortedBets, userBalances);
    const resultYes = (0, calculate_cpmm_1.getCpmmProbability)(poolY, pY);
    const { newPool: poolN, newP: pN } = (0, new_bet_1.getBinaryCpmmBetInfo)('NO', betAmount, contract, undefined, sortedBets, userBalances);
    const resultNo = (0, calculate_cpmm_1.getCpmmProbability)(poolN, pN);
    // handle AMM overflow
    const safeYes = Number.isFinite(resultYes) ? resultYes : 1;
    const safeNo = Number.isFinite(resultNo) ? resultNo : 0;
    return logit(safeYes) - logit(safeNo);
};
exports.computeBinaryCpmmElasticity = computeBinaryCpmmElasticity;
const computeBinaryCpmmElasticityFromAnte = (ante, betAmount = exports.ELASTICITY_BET_AMOUNT) => {
    const pool = { YES: ante, NO: ante };
    const p = 0.5;
    const contract = { pool, p };
    const { newPool: poolY, newP: pY } = (0, new_bet_1.getBinaryCpmmBetInfo)('YES', betAmount, contract, undefined, [], {});
    const resultYes = (0, calculate_cpmm_1.getCpmmProbability)(poolY, pY);
    const { newPool: poolN, newP: pN } = (0, new_bet_1.getBinaryCpmmBetInfo)('NO', betAmount, contract, undefined, [], {});
    const resultNo = (0, calculate_cpmm_1.getCpmmProbability)(poolN, pN);
    // handle AMM overflow
    const safeYes = Number.isFinite(resultYes) ? resultYes : 1;
    const safeNo = Number.isFinite(resultNo) ? resultNo : 0;
    return logit(safeYes) - logit(safeNo);
};
exports.computeBinaryCpmmElasticityFromAnte = computeBinaryCpmmElasticityFromAnte;
const computeCPMM2Elasticity = (contract, betAmount) => {
    const { pool, answers } = contract;
    const probDiffs = answers.map((a) => {
        const { newPool: buyPool } = (0, calculate_cpmm_multi_1.buy)(pool, a.id, betAmount);
        const { newPool: sellPool } = (0, calculate_cpmm_multi_1.shortSell)(pool, a.id, betAmount);
        const buyProb = (0, calculate_cpmm_multi_1.getProb)(buyPool, a.id);
        const sellProb = (0, calculate_cpmm_multi_1.getProb)(sellPool, a.id);
        const safeBuy = Number.isFinite(buyProb) ? buyProb : 1;
        const safeSell = Number.isFinite(sellProb) ? sellProb : 0;
        return logit(safeBuy) - logit(safeSell);
    });
    return (0, math_1.average)(probDiffs);
};
exports.computeCPMM2Elasticity = computeCPMM2Elasticity;
const computeDpmElasticity = (contract, betAmount) => {
    const afterProb = (0, new_bet_1.getNewMultiBetInfo)('', betAmount + 1, contract).newBet
        .probAfter;
    const initialProb = (0, new_bet_1.getNewMultiBetInfo)('', 1, contract).newBet.probAfter;
    return logit(afterProb) - logit(initialProb);
};
exports.computeDpmElasticity = computeDpmElasticity;
const calculateCreatorTraders = (userContracts) => {
    let allTimeCreatorTraders = 0;
    let dailyCreatorTraders = 0;
    let weeklyCreatorTraders = 0;
    let monthlyCreatorTraders = 0;
    userContracts.forEach((contract) => {
        var _a, _b, _c, _d;
        allTimeCreatorTraders += (_a = contract.uniqueBettorCount) !== null && _a !== void 0 ? _a : 0;
        dailyCreatorTraders += (_b = contract.uniqueBettors24Hours) !== null && _b !== void 0 ? _b : 0;
        weeklyCreatorTraders += (_c = contract.uniqueBettors7Days) !== null && _c !== void 0 ? _c : 0;
        monthlyCreatorTraders += (_d = contract.uniqueBettors30Days) !== null && _d !== void 0 ? _d : 0;
    });
    return {
        daily: dailyCreatorTraders,
        weekly: weeklyCreatorTraders,
        monthly: monthlyCreatorTraders,
        allTime: allTimeCreatorTraders,
    };
};
exports.calculateCreatorTraders = calculateCreatorTraders;
const calculateNewPortfolioMetrics = (user, contractsById, unresolvedBets) => {
    const investmentValue = computeInvestmentValue(unresolvedBets, contractsById);
    const newPortfolio = {
        investmentValue: investmentValue,
        balance: user.balance,
        totalDeposits: user.totalDeposits,
        timestamp: Date.now(),
        userId: user.id,
    };
    return newPortfolio;
};
exports.calculateNewPortfolioMetrics = calculateNewPortfolioMetrics;
const calculateProfitForPeriod = (startingPortfolio, currentProfit) => {
    if (startingPortfolio === undefined) {
        return currentProfit;
    }
    const startingProfit = (0, exports.calculatePortfolioProfit)(startingPortfolio);
    return currentProfit - startingProfit;
};
const calculatePortfolioProfit = (portfolio) => {
    return portfolio.investmentValue + portfolio.balance - portfolio.totalDeposits;
};
exports.calculatePortfolioProfit = calculatePortfolioProfit;
const calculateNewProfit = (portfolioHistory, newPortfolio) => {
    const allTimeProfit = (0, exports.calculatePortfolioProfit)(newPortfolio);
    const newProfit = {
        daily: calculateProfitForPeriod(portfolioHistory.day, allTimeProfit),
        weekly: calculateProfitForPeriod(portfolioHistory.week, allTimeProfit),
        monthly: calculateProfitForPeriod(portfolioHistory.month, allTimeProfit),
        allTime: allTimeProfit,
    };
    return newProfit;
};
exports.calculateNewProfit = calculateNewProfit;
const calculateMetricsByContract = (betsByContractId, contractsById, user) => {
    return Object.entries(betsByContractId).map(([contractId, bets]) => {
        const contract = contractsById[contractId];
        return (0, exports.calculateUserMetrics)(contract, bets, user);
    });
};
exports.calculateMetricsByContract = calculateMetricsByContract;
const calculateUserMetrics = (contract, bets, user) => {
    const current = (0, calculate_1.getContractBetMetrics)(contract, bets);
    let periodMetrics;
    if (contract.mechanism === 'cpmm-1' && contract.outcomeType === 'BINARY') {
        const periods = ['day', 'week', 'month'];
        periodMetrics = Object.fromEntries(periods.map((period) => [
            period,
            calculatePeriodProfit(contract, bets, period),
        ]));
    }
    return (0, object_1.removeUndefinedProps)(Object.assign(Object.assign({ contractId: contract.id }, current), { from: periodMetrics, userName: user === null || user === void 0 ? void 0 : user.name, userId: user === null || user === void 0 ? void 0 : user.id, userUsername: user === null || user === void 0 ? void 0 : user.username, userAvatarUrl: user === null || user === void 0 ? void 0 : user.avatarUrl }));
};
exports.calculateUserMetrics = calculateUserMetrics;
const calculatePeriodProfit = (contract, bets, period) => {
    const days = period === 'day' ? 1 : period === 'week' ? 7 : 30;
    const fromTime = Date.now() - days * time_1.DAY_MS;
    const [previousBets, recentBets] = (0, lodash_1.partition)(bets, (b) => b.createdTime < fromTime);
    const { prob, probChanges } = contract;
    const prevProb = prob - probChanges[period];
    const previousBetsValue = (0, exports.computeInvestmentValueCustomProb)(previousBets, contract, prevProb);
    const currentBetsValue = (0, exports.computeInvestmentValueCustomProb)(previousBets, contract, prob);
    const { profit: recentProfit, invested: recentInvested } = (0, calculate_1.getContractBetMetrics)(contract, recentBets);
    const profit = currentBetsValue - previousBetsValue + recentProfit;
    const invested = previousBetsValue + recentInvested;
    const profitPercent = invested === 0 ? 0 : 100 * (profit / invested);
    return {
        profit,
        profitPercent,
        invested,
        prevValue: previousBetsValue,
        value: currentBetsValue,
    };
};
//# sourceMappingURL=calculate-metrics.js.map