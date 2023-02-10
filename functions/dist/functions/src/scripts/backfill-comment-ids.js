"use strict";
// We have some old comments without IDs and user IDs. Let's fill them in.
// Luckily, this was back when all comments had associated bets, so it's possible
// to retrieve the user IDs through the bets.
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const script_init_1 = require("./script-init");
const utils_1 = require("../utils");
(0, script_init_1.initAdmin)();
const firestore = admin.firestore();
const getUserIdsByCommentId = async (comments) => {
    const bets = await firestore.collectionGroup('bets').get();
    (0, utils_1.log)(`Loaded ${bets.size} bets.`);
    const betsById = Object.fromEntries(bets.docs.map((b) => [b.id, b.data()]));
    return Object.fromEntries(comments.map((c) => [c.id, betsById[c.data().betId].userId]));
};
if (require.main === module) {
    const commentsQuery = firestore.collectionGroup('comments');
    commentsQuery.get().then(async (commentSnaps) => {
        (0, utils_1.log)(`Loaded ${commentSnaps.size} comments.`);
        const needsFilling = commentSnaps.docs.filter((ct) => {
            return !('id' in ct.data()) || !('userId' in ct.data());
        });
        (0, utils_1.log)(`${needsFilling.length} comments need IDs.`);
        const userIdNeedsFilling = needsFilling.filter((ct) => {
            return !('userId' in ct.data());
        });
        (0, utils_1.log)(`${userIdNeedsFilling.length} comments need user IDs.`);
        const userIdsByCommentId = userIdNeedsFilling.length > 0
            ? await getUserIdsByCommentId(userIdNeedsFilling)
            : {};
        const updates = needsFilling.map((ct) => {
            const fields = {};
            if (!ct.data().id) {
                fields.id = ct.id;
            }
            if (!ct.data().userId && userIdsByCommentId[ct.id]) {
                fields.userId = userIdsByCommentId[ct.id];
            }
            return { doc: ct.ref, fields };
        });
        (0, utils_1.log)(`Updating ${updates.length} comments.`);
        await (0, utils_1.writeAsync)(firestore, updates);
        (0, utils_1.log)(`Updated all comments.`);
    });
}
//# sourceMappingURL=backfill-comment-ids.js.map