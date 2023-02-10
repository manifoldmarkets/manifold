"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDpmPayouts = exports.getFixedPayouts = exports.getPayouts = exports.groupPayoutsByUser = exports.getLoanPayouts = void 0;
const lodash_1 = require("lodash");
const payouts_dpm_1 = require("./payouts-dpm");
const payouts_fixed_1 = require("./payouts-fixed");
const getLoanPayouts = (bets) => {
    const betsWithLoans = bets.filter((bet) => bet.loanAmount);
    const betsByUser = (0, lodash_1.groupBy)(betsWithLoans, (bet) => bet.userId);
    const loansByUser = (0, lodash_1.mapValues)(betsByUser, (bets) => (0, lodash_1.sumBy)(bets, (bet) => { var _a; return -((_a = bet.loanAmount) !== null && _a !== void 0 ? _a : 0); }));
    return Object.entries(loansByUser).map(([userId, payout]) => ({
        userId,
        payout,
    }));
};
exports.getLoanPayouts = getLoanPayouts;
const groupPayoutsByUser = (payouts) => {
    const groups = (0, lodash_1.groupBy)(payouts, (payout) => payout.userId);
    return (0, lodash_1.mapValues)(groups, (group) => (0, lodash_1.sumBy)(group, (g) => g.payout));
};
exports.groupPayoutsByUser = groupPayoutsByUser;
const getPayouts = (outcome, contract, bets, liquidities, resolutions, resolutionProbability) => {
    if (contract.mechanism === 'cpmm-1' || contract.mechanism === 'cpmm-2') {
        return (0, exports.getFixedPayouts)(outcome, contract, bets, liquidities, resolutions, resolutionProbability);
    }
    if (contract.mechanism === 'dpm-2') {
        return (0, exports.getDpmPayouts)(outcome, contract, bets, resolutions, resolutionProbability);
    }
    throw new Error('getPayouts not implemented');
};
exports.getPayouts = getPayouts;
const getFixedPayouts = (outcome, contract, bets, liquidities, resolutions, resolutionProbability) => {
    switch (outcome) {
        case 'YES':
        case 'NO':
            return (0, payouts_fixed_1.getStandardFixedPayouts)(outcome, contract, bets, liquidities);
        case 'MKT':
            return (0, payouts_fixed_1.getMktFixedPayouts)(contract, bets, liquidities, resolutions, resolutionProbability);
        default:
        case 'CANCEL':
            if (contract.mechanism === 'cpmm-2' && outcome !== 'CANCEL')
                return (0, payouts_fixed_1.getStandardFixedPayouts)(outcome !== null && outcome !== void 0 ? outcome : '', contract, bets, liquidities);
            return (0, payouts_fixed_1.getFixedCancelPayouts)(bets, liquidities);
    }
};
exports.getFixedPayouts = getFixedPayouts;
const getDpmPayouts = (outcome, contract, bets, resolutions, resolutionProbability) => {
    const openBets = bets.filter((b) => !b.isSold && !b.sale);
    const { outcomeType } = contract;
    switch (outcome) {
        case 'YES':
        case 'NO':
            return (0, payouts_dpm_1.getDpmStandardPayouts)(outcome, contract, openBets);
        case 'MKT':
            return outcomeType === 'FREE_RESPONSE' ||
                outcomeType === 'MULTIPLE_CHOICE' // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                ? (0, payouts_dpm_1.getPayoutsMultiOutcome)(resolutions, contract, openBets)
                : (0, payouts_dpm_1.getDpmMktPayouts)(contract, openBets, resolutionProbability);
        case 'CANCEL':
        case undefined:
            return (0, payouts_dpm_1.getDpmCancelPayouts)(contract, openBets);
        default:
            if (outcomeType === 'NUMERIC')
                return (0, payouts_dpm_1.getNumericDpmPayouts)(outcome, contract, openBets);
            // Outcome is a free response answer id.
            return (0, payouts_dpm_1.getDpmStandardPayouts)(outcome, contract, openBets);
    }
};
exports.getDpmPayouts = getDpmPayouts;
//# sourceMappingURL=payouts.js.map