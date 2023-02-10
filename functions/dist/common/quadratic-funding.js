"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quadraticMatches = void 0;
const lodash_1 = require("lodash");
// Returns a map of charity ids to the amount of M$ matched
function quadraticMatches(txns, matchingPool, 
// What txn field uniquely identifies the recipients
// TODO: Perhaps this should always be toId anyways, to combat sockpuppet adding?
groupField) {
    // For each charity, group the donations by each individual donor
    const donationsByRecipient = (0, lodash_1.groupBy)(txns, groupField);
    const donationsByDonors = (0, lodash_1.mapValues)(donationsByRecipient, (txns) => (0, lodash_1.groupBy)(txns, 'fromId'));
    // Weight for each charity = [sum of sqrt(individual donor)] ^ 2 - sum of donations
    const weights = (0, lodash_1.mapValues)(donationsByDonors, (byDonor) => {
        const sumByDonor = Object.values(byDonor).map((txns) => (0, lodash_1.sumBy)(txns, 'amount'));
        const sumOfRoots = (0, lodash_1.sumBy)(sumByDonor, Math.sqrt);
        return clean(sumOfRoots ** 2 - (0, lodash_1.sum)(sumByDonor));
    });
    // Then distribute the matching pool based on the individual weights
    const totalWeight = (0, lodash_1.sum)(Object.values(weights));
    // Cap factor at 1 so that matching pool isn't always fully used
    const factor = Math.min(1, matchingPool / totalWeight);
    // Round to the nearest 0.01 mana
    return (0, lodash_1.mapValues)(weights, (weight) => Math.round(weight * factor * 100) / 100);
}
exports.quadraticMatches = quadraticMatches;
// If a number is epsilon close to 0, return 0
function clean(num) {
    const EPSILON = 0.0001;
    return Math.abs(num) < EPSILON ? 0 : num;
}
//# sourceMappingURL=quadratic-funding.js.map