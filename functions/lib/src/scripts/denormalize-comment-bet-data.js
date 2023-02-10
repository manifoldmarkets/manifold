"use strict";
// Filling in the bet-based fields on comments.
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const lodash_1 = require("lodash");
const script_init_1 = require("./script-init");
const denormalize_1 = require("./denormalize");
const utils_1 = require("../utils");
(0, script_init_1.initAdmin)();
const firestore = admin.firestore();
async function getBetComments(transaction) {
    const allComments = await transaction.get(firestore.collectionGroup('comments'));
    const betComments = allComments.docs.filter((d) => d.get('betId'));
    (0, utils_1.log)(`Found ${betComments.length} comments associated with bets.`);
    return betComments;
}
async function denormalize() {
    let hasMore = true;
    while (hasMore) {
        hasMore = await admin.firestore().runTransaction(async (trans) => {
            const betComments = await getBetComments(trans);
            const bets = await Promise.all(betComments.map((doc) => trans.get(firestore
                .collection('contracts')
                .doc(doc.get('contractId'))
                .collection('bets')
                .doc(doc.get('betId')))));
            (0, utils_1.log)(`Found ${bets.length} bets associated with comments.`);
            // dev DB has some invalid bet IDs
            const mapping = (0, lodash_1.zip)(bets, betComments)
                .filter(([bet, _]) => bet.exists) // eslint-disable-line
                .map(([bet, comment]) => {
                return [bet, [comment]]; // eslint-disable-line
            });
            const diffs = (0, denormalize_1.findDiffs)(mapping, ['amount', 'betAmount'], ['outcome', 'betOutcome']);
            (0, utils_1.log)(`Found ${diffs.length} comments with mismatched data.`);
            diffs.slice(0, 500).forEach((d) => {
                (0, utils_1.log)((0, denormalize_1.describeDiff)(d));
                (0, denormalize_1.applyDiff)(trans, d);
            });
            if (diffs.length > 500) {
                console.log(`Applying first 500 because of Firestore limit...`);
            }
            return diffs.length > 500;
        });
    }
}
if (require.main === module) {
    denormalize().catch((e) => console.error(e));
}
//# sourceMappingURL=denormalize-comment-bet-data.js.map