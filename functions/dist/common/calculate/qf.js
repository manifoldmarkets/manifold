"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.totalPaid = exports.calculateTotals = exports.calculateMatches = void 0;
// Functions for calculate quadratic funding amounts
const quadratic_funding_1 = require("../quadratic-funding");
const lodash_1 = require("lodash");
// Note: none of this allows for undone payments
// Return a map of answer ids to Qf matches for the given matching pool
function calculateMatches(txns, matchingPool) {
    return (0, quadratic_funding_1.quadraticMatches)(txns.filter((txn) => txn.category === 'QF_PAYMENT'), matchingPool, 'data.answerId');
}
exports.calculateMatches = calculateMatches;
// Return a map of answer ids to totals
function calculateTotals(txns) {
    const payTxns = txns.filter((txn) => txn.category === 'QF_PAYMENT');
    const grouped = (0, lodash_1.groupBy)(payTxns, 'data.answerId');
    return (0, lodash_1.mapValues)(grouped, (txns) => (0, lodash_1.sumBy)(txns, 'amount'));
}
exports.calculateTotals = calculateTotals;
function totalPaid(txns) {
    const payTxns = txns.filter((txn) => txn.category === 'QF_PAYMENT');
    return (0, lodash_1.sumBy)(payTxns, 'amount');
}
exports.totalPaid = totalPaid;
//# sourceMappingURL=qf.js.map