"use strict";
// Filling in the user-based fields on bets.
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const script_init_1 = require("./script-init");
const denormalize_1 = require("./denormalize");
const utils_1 = require("../utils");
(0, script_init_1.initAdmin)();
const firestore = admin.firestore();
// not in a transaction for speed -- may need to be run more than once
async function denormalize() {
    const users = await firestore.collection('users').get();
    (0, utils_1.log)(`Found ${users.size} users.`);
    for (const userDoc of users.docs) {
        const userBets = await firestore
            .collectionGroup('bets')
            .where('userId', '==', userDoc.id)
            .get();
        const mapping = [[userDoc, userBets.docs]];
        const diffs = (0, denormalize_1.findDiffs)(mapping, ['avatarUrl', 'userAvatarUrl'], ['name', 'userName'], ['username', 'userUsername']);
        (0, utils_1.log)(`Found ${diffs.length} bets with mismatched user data.`);
        const updates = diffs.map((d) => {
            (0, utils_1.log)((0, denormalize_1.describeDiff)(d));
            return (0, denormalize_1.getDiffUpdate)(d);
        });
        await (0, utils_1.writeAsync)(firestore, updates);
    }
}
if (require.main === module) {
    denormalize().catch((e) => console.error(e));
}
//# sourceMappingURL=denormalize-bet-user-data.js.map