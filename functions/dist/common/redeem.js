"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRedemptionBetMulti = exports.getRedemptionBets = exports.getRedeemableAmount = void 0;
const lodash_1 = require("lodash");
const fees_1 = require("./fees");
const object_1 = require("./util/object");
const getBinaryRedeemableAmount = (bets) => {
    const [yesBets, noBets] = (0, lodash_1.partition)(bets, (b) => b.outcome === 'YES');
    const yesShares = (0, lodash_1.sumBy)(yesBets, (b) => b.shares);
    const noShares = (0, lodash_1.sumBy)(noBets, (b) => b.shares);
    const shares = Math.max(Math.min(yesShares, noShares), 0);
    const soldFrac = shares > 0 ? shares / Math.max(yesShares, noShares) : 0;
    const loanAmount = (0, lodash_1.sumBy)(bets, (bet) => { var _a; return (_a = bet.loanAmount) !== null && _a !== void 0 ? _a : 0; });
    const loanPayment = loanAmount * soldFrac;
    const netAmount = shares - loanPayment;
    return { shares, loanPayment, netAmount };
};
const getRedeemableAmountMulti = (outcomes, bets) => {
    var _a;
    const zeros = Object.fromEntries(outcomes.map((o) => [o, 0]));
    const sharesByOutcome = bets
        .map(({ sharesByOutcome, shares, outcome }) => sharesByOutcome !== null && sharesByOutcome !== void 0 ? sharesByOutcome : { [outcome]: shares })
        .reduce(object_1.addObjects, zeros);
    const shares = Math.max(0, (_a = (0, lodash_1.min)(Object.values(sharesByOutcome))) !== null && _a !== void 0 ? _a : 0);
    const soldFrac = shares > 0 ? shares / (0, lodash_1.max)(Object.values(sharesByOutcome)) : 0;
    const loanAmount = (0, lodash_1.sumBy)(bets, (bet) => { var _a; return (_a = bet.loanAmount) !== null && _a !== void 0 ? _a : 0; });
    const loanPayment = loanAmount * soldFrac;
    const netAmount = shares - loanPayment;
    return { shares, loanPayment, netAmount };
};
const getRedeemableAmount = (contract, bets) => {
    if (contract.mechanism === 'cpmm-2') {
        return getRedeemableAmountMulti(contract.answers.map((a) => a.id), bets);
    }
    return getBinaryRedeemableAmount(bets);
};
exports.getRedeemableAmount = getRedeemableAmount;
const getRedemptionBets = (contractId, shares, loanPayment, prob) => {
    const createdTime = Date.now();
    const yesBet = {
        contractId: contractId,
        amount: prob * -shares,
        shares: -shares,
        loanAmount: loanPayment ? -loanPayment / 2 : 0,
        outcome: 'YES',
        probBefore: prob,
        probAfter: prob,
        createdTime,
        fees: fees_1.noFees,
        isAnte: false,
        isRedemption: true,
        isChallenge: false,
    };
    const noBet = {
        contractId: contractId,
        amount: (1 - prob) * -shares,
        shares: -shares,
        loanAmount: loanPayment ? -loanPayment / 2 : 0,
        outcome: 'NO',
        probBefore: prob,
        probAfter: prob,
        createdTime,
        fees: fees_1.noFees,
        isAnte: false,
        isRedemption: true,
        isChallenge: false,
    };
    return [yesBet, noBet];
};
exports.getRedemptionBets = getRedemptionBets;
const getRedemptionBetMulti = (contractId, shares, loanPayment, probsByOutcome) => {
    const sharesByOutcome = (0, lodash_1.mapValues)(probsByOutcome, () => -shares);
    const firstOutcome = Object.keys(sharesByOutcome)[0];
    const createdTime = Date.now();
    const redemptionBet = {
        contractId,
        amount: -shares,
        shares: -shares,
        loanAmount: loanPayment ? -loanPayment : 0,
        outcome: firstOutcome,
        sharesByOutcome,
        probBefore: probsByOutcome[firstOutcome],
        probAfter: probsByOutcome[firstOutcome],
        createdTime,
        isAnte: false,
        isRedemption: true,
        isChallenge: false,
        fees: fees_1.noFees,
    };
    return redemptionBet;
};
exports.getRedemptionBetMulti = getRedemptionBetMulti;
//# sourceMappingURL=redeem.js.map