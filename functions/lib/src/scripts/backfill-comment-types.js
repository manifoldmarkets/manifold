"use strict";
// Comment types were introduced in August 2022.
Object.defineProperty(exports, "__esModule", { value: true });
const script_init_1 = require("./script-init");
const utils_1 = require("../utils");
if (require.main === module) {
    const app = (0, script_init_1.initAdmin)();
    const firestore = app.firestore();
    const commentsRef = firestore.collectionGroup('comments');
    commentsRef.get().then(async (commentsSnaps) => {
        (0, utils_1.log)(`Loaded ${commentsSnaps.size} comments.`);
        const needsFilling = commentsSnaps.docs.filter((ct) => {
            return !('commentType' in ct.data());
        });
        (0, utils_1.log)(`Found ${needsFilling.length} comments to update.`);
        const updates = needsFilling.map((d) => {
            const comment = d.data();
            const fields = {};
            if (comment.contractId != null && comment.groupId == null) {
                fields.commentType = 'contract';
            }
            else if (comment.groupId != null && comment.contractId == null) {
                fields.commentType = 'group';
            }
            else {
                (0, utils_1.log)(`Invalid comment ${comment}; not touching it.`);
            }
            return { doc: d.ref, fields, info: comment };
        });
        await (0, utils_1.writeAsync)(firestore, updates);
        (0, utils_1.log)(`Updated all comments.`);
    });
}
//# sourceMappingURL=backfill-comment-types.js.map