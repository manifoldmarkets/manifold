"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isUserEligibleForLoan = exports.getUserLoanUpdates = void 0;
const lodash_1 = require("lodash");
const calculate_1 = require("./calculate");
const array_1 = require("./util/array");
const LOAN_DAILY_RATE = 0.02;
const calculateNewLoan = (investedValue, loanTotal) => {
    const netValue = investedValue - loanTotal;
    return netValue * LOAN_DAILY_RATE;
};
const getUserLoanUpdates = (betsByContractId, contractsById) => {
    const updates = calculateLoanBetUpdates(betsByContractId, contractsById);
    return { updates, payout: (0, lodash_1.sumBy)(updates, (update) => update.newLoan) };
};
exports.getUserLoanUpdates = getUserLoanUpdates;
const isUserEligibleForLoan = (portfolio) => {
    if (!portfolio)
        return true;
    const { balance, investmentValue } = portfolio;
    return balance + investmentValue > 0;
};
exports.isUserEligibleForLoan = isUserEligibleForLoan;
const calculateLoanBetUpdates = (betsByContractId, contractsById) => {
    const contracts = (0, array_1.filterDefined)(Object.keys(betsByContractId).map((contractId) => contractsById[contractId])).filter((c) => !c.isResolved);
    return contracts
        .map((c) => {
        var _a;
        const bets = betsByContractId[c.id];
        if (c.mechanism === 'cpmm-1' || c.mechanism === 'cpmm-2') {
            return (_a = getCpmmContractLoanUpdate(c, bets)) !== null && _a !== void 0 ? _a : [];
        }
        else if (c.mechanism === 'dpm-2')
            return (0, array_1.filterDefined)(getDpmContractLoanUpdate(c, bets));
        else {
            // Unsupported contract / mechanism for loans.
            return [];
        }
    })
        .flat();
};
const getCpmmContractLoanUpdate = (contract, bets) => {
    var _a;
    const { invested } = (0, calculate_1.getContractBetMetrics)(contract, bets);
    const loanAmount = (0, lodash_1.sumBy)(bets, (bet) => { var _a; return (_a = bet.loanAmount) !== null && _a !== void 0 ? _a : 0; });
    const oldestBet = (0, lodash_1.minBy)(bets, (bet) => bet.createdTime);
    const newLoan = calculateNewLoan(invested, loanAmount);
    if (!isFinite(newLoan) || newLoan <= 0 || !oldestBet)
        return undefined;
    const loanTotal = ((_a = oldestBet.loanAmount) !== null && _a !== void 0 ? _a : 0) + newLoan;
    return {
        userId: oldestBet.userId,
        contractId: contract.id,
        betId: oldestBet.id,
        newLoan,
        loanTotal,
    };
};
const getDpmContractLoanUpdate = (contract, bets) => {
    const openBets = bets.filter((bet) => !bet.isSold && !bet.sale);
    return openBets.map((bet) => {
        var _a;
        const loanAmount = (_a = bet.loanAmount) !== null && _a !== void 0 ? _a : 0;
        const newLoan = calculateNewLoan(bet.amount, loanAmount);
        const loanTotal = loanAmount + newLoan;
        if (!isFinite(newLoan) || newLoan <= 0)
            return undefined;
        return {
            userId: bet.userId,
            contractId: contract.id,
            betId: bet.id,
            newLoan,
            loanTotal,
        };
    });
};
//# sourceMappingURL=loans.js.map