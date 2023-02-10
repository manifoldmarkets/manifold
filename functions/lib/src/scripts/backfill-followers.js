"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const script_init_1 = require("./script-init");
(0, script_init_1.initAdmin)();
const utils_1 = require("../utils");
const firestore = admin.firestore();
async function backfillFollowers() {
    console.log('Backfilling user follower counts');
    const followerCounts = {};
    const users = await (0, utils_1.getValues)(firestore.collection('users'));
    console.log(`Loaded ${users.length} users. Calculating follower counts...`);
    for (const [idx, user] of users.entries()) {
        console.log(`Querying user ${user.id} (${idx + 1}/${users.length})`);
        const follows = await (0, utils_1.getValues)(firestore.collection('users').doc(user.id).collection('follows'));
        for (const follow of follows) {
            followerCounts[follow.userId] = (followerCounts[follow.userId] || 0) + 1;
        }
    }
    console.log(`Finished calculating follower counts. Persisting cached follower counts...`);
    for (const [idx, user] of users.entries()) {
        console.log(`Persisting user ${user.id} (${idx + 1}/${users.length})`);
        const followerCount = followerCounts[user.id] || 0;
        await firestore
            .collection('users')
            .doc(user.id)
            .update({ followerCountCached: followerCount });
    }
}
if (require.main === module) {
    backfillFollowers()
        .then(() => process.exit())
        .catch(console.log);
}
//# sourceMappingURL=backfill-followers.js.map