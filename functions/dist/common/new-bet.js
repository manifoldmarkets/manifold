"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNumericBetsInfo = exports.getNewMultiCpmmBetInfo = exports.getNewMultiBetInfo = exports.getNewBinaryDpmBetInfo = exports.getBinaryBetStats = exports.getBinaryCpmmBetInfo = exports.computeFills = void 0;
const lodash_1 = require("lodash");
const calculate_dpm_1 = require("./calculate-dpm");
const calculate_cpmm_1 = require("./calculate-cpmm");
const fees_1 = require("./fees");
const object_1 = require("./util/object");
const numeric_constants_1 = require("./numeric-constants");
const math_1 = require("./util/math");
const calculate_cpmm_multi_1 = require("./calculate-cpmm-multi");
const computeFill = (amount, outcome, limitProb, cpmmState, matchedBet) => {
    var _a, _b;
    const prob = (0, calculate_cpmm_1.getCpmmProbability)(cpmmState.pool, cpmmState.p);
    if (limitProb !== undefined &&
        (outcome === 'YES'
            ? (0, math_1.floatingGreaterEqual)(prob, limitProb) &&
                ((_a = matchedBet === null || matchedBet === void 0 ? void 0 : matchedBet.limitProb) !== null && _a !== void 0 ? _a : 1) > limitProb
            : (0, math_1.floatingLesserEqual)(prob, limitProb) &&
                ((_b = matchedBet === null || matchedBet === void 0 ? void 0 : matchedBet.limitProb) !== null && _b !== void 0 ? _b : 0) < limitProb)) {
        // No fill.
        return undefined;
    }
    const timestamp = Date.now();
    if (!matchedBet ||
        (outcome === 'YES'
            ? !(0, math_1.floatingGreaterEqual)(prob, matchedBet.limitProb)
            : !(0, math_1.floatingLesserEqual)(prob, matchedBet.limitProb))) {
        // Fill from pool.
        const limit = !matchedBet
            ? limitProb
            : outcome === 'YES'
                ? Math.min(matchedBet.limitProb, limitProb !== null && limitProb !== void 0 ? limitProb : 1)
                : Math.max(matchedBet.limitProb, limitProb !== null && limitProb !== void 0 ? limitProb : 0);
        const buyAmount = limit === undefined
            ? amount
            : Math.min(amount, (0, calculate_cpmm_1.calculateCpmmAmountToProb)(cpmmState, limit, outcome));
        const { shares, newPool, newP, fees } = (0, calculate_cpmm_1.calculateCpmmPurchase)(cpmmState, buyAmount, outcome);
        const newState = { pool: newPool, p: newP };
        return {
            maker: {
                matchedBetId: null,
                shares,
                amount: buyAmount,
                state: newState,
                fees,
                timestamp,
            },
            taker: {
                matchedBetId: null,
                shares,
                amount: buyAmount,
                timestamp,
            },
        };
    }
    // Fill from matchedBet.
    const matchRemaining = matchedBet.orderAmount - matchedBet.amount;
    const shares = Math.min(amount /
        (outcome === 'YES' ? matchedBet.limitProb : 1 - matchedBet.limitProb), matchRemaining /
        (outcome === 'YES' ? 1 - matchedBet.limitProb : matchedBet.limitProb));
    const maker = {
        bet: matchedBet,
        matchedBetId: 'taker',
        amount: shares *
            (outcome === 'YES' ? 1 - matchedBet.limitProb : matchedBet.limitProb),
        shares,
        timestamp,
    };
    const taker = {
        matchedBetId: matchedBet.id,
        amount: shares *
            (outcome === 'YES' ? matchedBet.limitProb : 1 - matchedBet.limitProb),
        shares,
        timestamp,
    };
    return { maker, taker };
};
const computeFills = (outcome, betAmount, state, limitProb, unfilledBets, balanceByUserId) => {
    if (isNaN(betAmount)) {
        throw new Error('Invalid bet amount: ${betAmount}');
    }
    if (isNaN(limitProb !== null && limitProb !== void 0 ? limitProb : 0)) {
        throw new Error('Invalid limitProb: ${limitProb}');
    }
    const sortedBets = (0, lodash_1.sortBy)(unfilledBets.filter((bet) => bet.outcome !== outcome), (bet) => (outcome === 'YES' ? bet.limitProb : -bet.limitProb), (bet) => bet.createdTime);
    const takers = [];
    const makers = [];
    const ordersToCancel = [];
    let amount = betAmount;
    let cpmmState = { pool: state.pool, p: state.p };
    let totalFees = fees_1.noFees;
    const currentBalanceByUserId = Object.assign({}, balanceByUserId);
    let i = 0;
    while (true) {
        const matchedBet = sortedBets[i];
        const fill = computeFill(amount, outcome, limitProb, cpmmState, matchedBet);
        if (!fill)
            break;
        const { taker, maker } = fill;
        if (maker.matchedBetId === null) {
            // Matched against pool.
            cpmmState = maker.state;
            totalFees = (0, object_1.addObjects)(totalFees, maker.fees);
            takers.push(taker);
        }
        else {
            // Matched against bet.
            i++;
            const { userId } = maker.bet;
            const makerBalance = currentBalanceByUserId[userId];
            if ((0, math_1.floatingGreaterEqual)(makerBalance, maker.amount)) {
                currentBalanceByUserId[userId] = makerBalance - maker.amount;
            }
            else {
                // Insufficient balance. Cancel maker bet.
                ordersToCancel.push(maker.bet);
                continue;
            }
            takers.push(taker);
            makers.push(maker);
        }
        amount -= taker.amount;
        if ((0, math_1.floatingEqual)(amount, 0))
            break;
    }
    return { takers, makers, totalFees, cpmmState, ordersToCancel };
};
exports.computeFills = computeFills;
const getBinaryCpmmBetInfo = (outcome, betAmount, contract, limitProb, unfilledBets, balanceByUserId) => {
    var _a;
    const { pool, p } = contract;
    const { takers, makers, cpmmState, totalFees, ordersToCancel } = (0, exports.computeFills)(outcome, betAmount, { pool, p }, limitProb, unfilledBets, balanceByUserId);
    const probBefore = (0, calculate_cpmm_1.getCpmmProbability)(contract.pool, contract.p);
    const probAfter = (0, calculate_cpmm_1.getCpmmProbability)(cpmmState.pool, cpmmState.p);
    const takerAmount = (0, lodash_1.sumBy)(takers, 'amount');
    const takerShares = (0, lodash_1.sumBy)(takers, 'shares');
    const isFilled = (0, math_1.floatingEqual)(betAmount, takerAmount);
    const newBet = (0, object_1.removeUndefinedProps)({
        orderAmount: betAmount,
        amount: takerAmount,
        shares: takerShares,
        limitProb,
        isFilled,
        isCancelled: false,
        fills: takers,
        contractId: contract.id,
        outcome,
        probBefore,
        probAfter,
        loanAmount: 0,
        createdTime: Date.now(),
        fees: totalFees,
        isAnte: false,
        isRedemption: false,
        isChallenge: false,
    });
    const { liquidityFee } = totalFees;
    const newTotalLiquidity = ((_a = contract.totalLiquidity) !== null && _a !== void 0 ? _a : 0) + liquidityFee;
    return {
        newBet,
        newPool: cpmmState.pool,
        newP: cpmmState.p,
        newTotalLiquidity,
        makers,
        ordersToCancel,
    };
};
exports.getBinaryCpmmBetInfo = getBinaryCpmmBetInfo;
const getBinaryBetStats = (outcome, betAmount, contract, limitProb, unfilledBets, balanceByUserId) => {
    var _a;
    const { newBet } = (0, exports.getBinaryCpmmBetInfo)(outcome, betAmount !== null && betAmount !== void 0 ? betAmount : 0, contract, limitProb, unfilledBets, balanceByUserId);
    const remainingMatched = (((_a = newBet.orderAmount) !== null && _a !== void 0 ? _a : 0) - newBet.amount) /
        (outcome === 'YES' ? limitProb : 1 - limitProb);
    const currentPayout = newBet.shares + remainingMatched;
    const currentReturn = betAmount ? (currentPayout - betAmount) / betAmount : 0;
    const totalFees = (0, lodash_1.sum)(Object.values(newBet.fees));
    return { currentPayout, currentReturn, totalFees, newBet };
};
exports.getBinaryBetStats = getBinaryBetStats;
const getNewBinaryDpmBetInfo = (outcome, amount, contract) => {
    const { YES: yesPool, NO: noPool } = contract.pool;
    const newPool = outcome === 'YES'
        ? { YES: yesPool + amount, NO: noPool }
        : { YES: yesPool, NO: noPool + amount };
    const shares = (0, calculate_dpm_1.calculateDpmShares)(contract.totalShares, amount, outcome);
    const { YES: yesShares, NO: noShares } = contract.totalShares;
    const newTotalShares = outcome === 'YES'
        ? { YES: yesShares + shares, NO: noShares }
        : { YES: yesShares, NO: noShares + shares };
    const { YES: yesBets, NO: noBets } = contract.totalBets;
    const newTotalBets = outcome === 'YES'
        ? { YES: yesBets + amount, NO: noBets }
        : { YES: yesBets, NO: noBets + amount };
    const probBefore = (0, calculate_dpm_1.getDpmProbability)(contract.totalShares);
    const probAfter = (0, calculate_dpm_1.getDpmProbability)(newTotalShares);
    const newBet = {
        contractId: contract.id,
        amount,
        loanAmount: 0,
        shares,
        outcome,
        probBefore,
        probAfter,
        createdTime: Date.now(),
        fees: fees_1.noFees,
        isAnte: false,
        isRedemption: false,
        isChallenge: false,
    };
    return { newBet, newPool, newTotalShares, newTotalBets };
};
exports.getNewBinaryDpmBetInfo = getNewBinaryDpmBetInfo;
const getNewMultiBetInfo = (outcome, amount, contract) => {
    var _a, _b, _c;
    const { pool, totalShares, totalBets } = contract;
    const prevOutcomePool = (_a = pool[outcome]) !== null && _a !== void 0 ? _a : 0;
    const newPool = Object.assign(Object.assign({}, pool), { [outcome]: prevOutcomePool + amount });
    const shares = (0, calculate_dpm_1.calculateDpmShares)(contract.totalShares, amount, outcome);
    const prevShares = (_b = totalShares[outcome]) !== null && _b !== void 0 ? _b : 0;
    const newTotalShares = Object.assign(Object.assign({}, totalShares), { [outcome]: prevShares + shares });
    const prevTotalBets = (_c = totalBets[outcome]) !== null && _c !== void 0 ? _c : 0;
    const newTotalBets = Object.assign(Object.assign({}, totalBets), { [outcome]: prevTotalBets + amount });
    const probBefore = (0, calculate_dpm_1.getDpmOutcomeProbability)(totalShares, outcome);
    const probAfter = (0, calculate_dpm_1.getDpmOutcomeProbability)(newTotalShares, outcome);
    const newBet = {
        contractId: contract.id,
        amount,
        loanAmount: 0,
        shares,
        outcome,
        probBefore,
        probAfter,
        createdTime: Date.now(),
        fees: fees_1.noFees,
        isAnte: false,
        isRedemption: false,
        isChallenge: false,
    };
    return { newBet, newPool, newTotalShares, newTotalBets };
};
exports.getNewMultiBetInfo = getNewMultiBetInfo;
const getNewMultiCpmmBetInfo = (contract, outcome, amount, shouldShortSell) => {
    var _a;
    const { pool } = contract;
    let newPool;
    let gainedShares = undefined;
    let shares;
    if (shouldShortSell)
        ({ newPool, gainedShares } = (0, calculate_cpmm_multi_1.shortSell)(pool, outcome, amount));
    else
        ({ newPool, shares } = (0, calculate_cpmm_multi_1.buy)(pool, outcome, amount));
    shares = gainedShares ? (_a = gainedShares[outcome]) !== null && _a !== void 0 ? _a : 0 : shares;
    const probBefore = (0, calculate_cpmm_multi_1.getProb)(pool, outcome);
    const probAfter = (0, calculate_cpmm_multi_1.getProb)(newPool, outcome);
    const newBet = (0, object_1.removeUndefinedProps)({
        contractId: contract.id,
        amount,
        loanAmount: 0,
        shares: shares,
        sharesByOutcome: gainedShares,
        outcome,
        probBefore,
        probAfter,
        createdTime: Date.now(),
        fees: fees_1.noFees,
        isAnte: false,
        isRedemption: false,
        isChallenge: false,
    });
    return { newBet, newPool };
};
exports.getNewMultiCpmmBetInfo = getNewMultiCpmmBetInfo;
const getNumericBetsInfo = (value, outcome, amount, contract) => {
    var _a;
    const { pool, totalShares, totalBets } = contract;
    const bets = (0, calculate_dpm_1.getNumericBets)(contract, outcome, amount, numeric_constants_1.NUMERIC_FIXED_VAR);
    const allBetAmounts = Object.fromEntries(bets);
    const newTotalBets = (0, object_1.addObjects)(totalBets, allBetAmounts);
    const newPool = (0, object_1.addObjects)(pool, allBetAmounts);
    const { shares, totalShares: newTotalShares } = (0, calculate_dpm_1.calculateNumericDpmShares)(contract.totalShares, bets);
    const allOutcomeShares = Object.fromEntries(bets.map(([outcome], i) => [outcome, shares[i]]));
    const probBefore = (0, calculate_dpm_1.getDpmOutcomeProbability)(totalShares, outcome);
    const probAfter = (0, calculate_dpm_1.getDpmOutcomeProbability)(newTotalShares, outcome);
    const newBet = {
        contractId: contract.id,
        value,
        amount,
        allBetAmounts,
        shares: (_a = shares.find((s, i) => bets[i][0] === outcome)) !== null && _a !== void 0 ? _a : 0,
        allOutcomeShares,
        outcome,
        probBefore,
        probAfter,
        createdTime: Date.now(),
        fees: fees_1.noFees,
        isAnte: false,
        isRedemption: false,
        isChallenge: false,
    };
    return { newBet, newPool, newTotalShares, newTotalBets };
};
exports.getNumericBetsInfo = getNumericBetsInfo;
//# sourceMappingURL=new-bet.js.map