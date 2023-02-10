"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCpmmSellBetInfo = exports.getSellBetInfo = void 0;
const calculate_dpm_1 = require("./calculate-dpm");
const calculate_cpmm_1 = require("./calculate-cpmm");
const fees_1 = require("./fees");
const lodash_1 = require("lodash");
const getSellBetInfo = (bet, contract) => {
    const { pool, totalShares, totalBets } = contract;
    const { id: betId, amount, shares, outcome, loanAmount } = bet;
    const adjShareValue = (0, calculate_dpm_1.calculateDpmShareValue)(contract, bet);
    const newPool = Object.assign(Object.assign({}, pool), { [outcome]: pool[outcome] - adjShareValue });
    const newTotalShares = Object.assign(Object.assign({}, totalShares), { [outcome]: totalShares[outcome] - shares });
    const newTotalBets = Object.assign(Object.assign({}, totalBets), { [outcome]: totalBets[outcome] - amount });
    const probBefore = (0, calculate_dpm_1.getDpmOutcomeProbability)(totalShares, outcome);
    const probAfter = (0, calculate_dpm_1.getDpmOutcomeProbability)(newTotalShares, outcome);
    const profit = adjShareValue - amount;
    const creatorFee = fees_1.DPM_CREATOR_FEE * Math.max(0, profit);
    const platformFee = fees_1.DPM_PLATFORM_FEE * Math.max(0, profit);
    const fees = {
        creatorFee,
        platformFee,
        liquidityFee: 0,
    };
    const saleAmount = (0, calculate_dpm_1.deductDpmFees)(amount, adjShareValue);
    console.log('SELL Mana', amount, outcome, 'for M', saleAmount, 'creator fee: M', creatorFee);
    const newBet = {
        contractId: contract.id,
        amount: -adjShareValue,
        shares: -shares,
        outcome,
        probBefore,
        probAfter,
        createdTime: Date.now(),
        sale: {
            amount: saleAmount,
            betId,
        },
        fees,
        loanAmount: -(loanAmount !== null && loanAmount !== void 0 ? loanAmount : 0),
        isAnte: false,
        isRedemption: false,
        isChallenge: false,
    };
    return {
        newBet,
        newPool,
        newTotalShares,
        newTotalBets,
        fees,
    };
};
exports.getSellBetInfo = getSellBetInfo;
const getCpmmSellBetInfo = (shares, outcome, contract, unfilledBets, balanceByUserId, loanPaid) => {
    const { pool, p } = contract;
    const { saleValue, cpmmState, fees, makers, takers, ordersToCancel } = (0, calculate_cpmm_1.calculateCpmmSale)(contract, shares, outcome, unfilledBets, balanceByUserId);
    const probBefore = (0, calculate_cpmm_1.getCpmmProbability)(pool, p);
    const probAfter = (0, calculate_cpmm_1.getCpmmProbability)(cpmmState.pool, cpmmState.p);
    const takerAmount = (0, lodash_1.sumBy)(takers, 'amount');
    const takerShares = (0, lodash_1.sumBy)(takers, 'shares');
    console.log('SELL ', shares, outcome, 'for M', saleValue, 'creator fee: M', fees.creatorFee);
    const newBet = {
        contractId: contract.id,
        amount: takerAmount,
        shares: takerShares,
        outcome,
        probBefore,
        probAfter,
        createdTime: Date.now(),
        loanAmount: -loanPaid,
        fees,
        fills: takers,
        isFilled: true,
        isCancelled: false,
        orderAmount: takerAmount,
        isAnte: false,
        isRedemption: false,
        isChallenge: false,
    };
    return {
        newBet,
        newPool: cpmmState.pool,
        newP: cpmmState.p,
        fees,
        makers,
        takers,
        ordersToCancel,
    };
};
exports.getCpmmSellBetInfo = getCpmmSellBetInfo;
//# sourceMappingURL=sell-bet.js.map