"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRecentBetsAndComments = exports.getTaggedContracts = exports.getFeedContracts = void 0;
const admin = require("firebase-admin");
const time_1 = require("../../common/util/time");
const utils_1 = require("./utils");
const firestore = admin.firestore();
async function getFeedContracts() {
    // Get contracts bet on or created in last week.
    const [activeContracts, inactiveContracts] = await Promise.all([
        (0, utils_1.getValues)(firestore
            .collection('contracts')
            .where('isResolved', '==', false)
            .where('volume7Days', '>', 0)),
        (0, utils_1.getValues)(firestore
            .collection('contracts')
            .where('isResolved', '==', false)
            .where('createdTime', '>', Date.now() - time_1.DAY_MS * 7)
            .where('volume7Days', '==', 0)),
    ]);
    const combined = [...activeContracts, ...inactiveContracts];
    // Remove closed contracts.
    return combined.filter((c) => { var _a; return ((_a = c.closeTime) !== null && _a !== void 0 ? _a : Infinity) > Date.now(); });
}
exports.getFeedContracts = getFeedContracts;
async function getTaggedContracts(tag) {
    const taggedContracts = await (0, utils_1.getValues)(firestore
        .collection('contracts')
        .where('isResolved', '==', false)
        .where('lowercaseTags', 'array-contains', tag.toLowerCase()));
    // Remove closed contracts.
    return taggedContracts.filter((c) => { var _a; return ((_a = c.closeTime) !== null && _a !== void 0 ? _a : Infinity) > Date.now(); });
}
exports.getTaggedContracts = getTaggedContracts;
async function getRecentBetsAndComments(contractId) {
    const contractDoc = firestore.collection('contracts').doc(contractId);
    const [recentBets, recentComments] = await Promise.all([
        (0, utils_1.getValues)(contractDoc
            .collection('bets')
            .where('createdTime', '>', Date.now() - time_1.DAY_MS)
            .orderBy('createdTime', 'desc')
            .limit(1)),
        (0, utils_1.getValues)(contractDoc
            .collection('comments')
            .where('createdTime', '>', Date.now() - 3 * time_1.DAY_MS)
            .orderBy('createdTime', 'desc')
            .limit(3)),
    ]);
    return {
        recentBets,
        recentComments,
    };
}
exports.getRecentBetsAndComments = getRecentBetsAndComments;
//# sourceMappingURL=get-feed-data.js.map