"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCertPoints = exports.toPayoutsMap = exports.getDividendPayouts = exports.getCertOwnershipUsers = exports.getCertOwnership = void 0;
const lodash_1 = require("lodash");
const uniswap2_1 = require("./uniswap2");
// e.g. { 'user/jasldfjdkl': 900, 'contract/afsdjkla': 100 }
function getCertOwnership(txns) {
    const ownership = {};
    const sortedTxns = (0, lodash_1.sortBy)(txns, 'createdTime');
    for (const txn of sortedTxns) {
        const fromId = `${txn.fromType}/${txn.fromId}`;
        const toId = `${txn.toType}/${txn.toId}`;
        if (txn.category === 'CERT_MINT') {
            ownership[toId] = txn.amount;
        }
        else if (txn.category === 'CERT_TRANSFER') {
            ownership[fromId] -= txn.amount;
            ownership[toId] = (ownership[toId] || 0) + txn.amount;
        }
    }
    return ownership;
}
exports.getCertOwnership = getCertOwnership;
// Like the above, but with userIds only.
// We mapping any CONTRACT types to 'USER/{creatorId}'
function getCertOwnershipUsers(creatorId, txns) {
    const ownership = getCertOwnership(txns);
    const users = {};
    for (const ownerId in ownership) {
        const [type, id] = ownerId.split('/');
        switch (type) {
            case 'USER':
                users[id] = (users[id] || 0) + ownership[ownerId];
                break;
            case 'CONTRACT':
                users[creatorId] = (users[creatorId] || 0) + ownership[ownerId];
        }
    }
    return users;
}
exports.getCertOwnershipUsers = getCertOwnershipUsers;
// Map each user to amount to pay
// E.g. { 'alice': -100, 'bob': 25, 'carol': 75 }
function getDividendPayouts(providerId, totalDividend, txns) {
    // 1) Calculate the total shares
    // 2) Divide to get the M$ amount to distribute per share
    // 3) Pay out that much M$ to each holder (assume that all pool shares belong to cert creator)
    const ownership = getCertOwnershipUsers(providerId, txns);
    const totalShares = (0, lodash_1.sum)(Object.values(ownership));
    const dividendPerShare = totalDividend / totalShares;
    const payouts = Object.entries(ownership).map(([ownerId, shares]) => ({
        userId: ownerId,
        payout: shares * dividendPerShare -
            // Set a negative total payout for the provider
            (ownerId === providerId ? totalDividend : 0),
    }));
    return payouts;
}
exports.getDividendPayouts = getDividendPayouts;
function toPayoutsMap(payouts) {
    return Object.fromEntries(payouts.map(({ userId, payout }) => [userId, payout]));
}
exports.toPayoutsMap = toPayoutsMap;
// For each cert txn, calculate a point: {x: timestamp, y: price}
// Right now, txns don't have a "priceAfter" field
// so instead we calculate the current pool at each step after the latest txn has been applied
function getCertPoints(txns) {
    const points = [];
    const sortedTxns = (0, lodash_1.sortBy)(txns, 'createdTime');
    const currentPool = { SHARE: 0, M$: 0 };
    for (const txn of sortedTxns) {
        const fromId = `${txn.fromType}/${txn.fromId}`;
        const toId = `${txn.toType}/${txn.toId}`;
        const certId = `CONTRACT/${txn.certId}`;
        switch (txn.category) {
            case 'CERT_TRANSFER':
                if (toId === certId) {
                    currentPool.SHARE += txn.amount;
                }
                else if (fromId === certId) {
                    currentPool.SHARE -= txn.amount;
                }
                break;
            case 'CERT_PAY_MANA':
                if (toId === certId) {
                    currentPool['M$'] += txn.amount;
                }
                else if (fromId === certId) {
                    currentPool['M$'] -= txn.amount;
                }
                break;
        }
        const price = (0, uniswap2_1.calculatePrice)(currentPool);
        // Only add point if price is valid and not 0
        if (price)
            points.push({ x: txn.createdTime, y: price });
    }
    return points;
}
exports.getCertPoints = getCertPoints;
//# sourceMappingURL=cert.js.map