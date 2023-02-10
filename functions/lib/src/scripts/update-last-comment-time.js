"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const script_init_1 = require("./script-init");
(0, script_init_1.initAdmin)();
const utils_1 = require("../utils");
async function updateLastCommentTime() {
    const firestore = admin.firestore();
    console.log('Updating contracts lastCommentTime');
    const contracts = await (0, utils_1.getValues)(firestore.collection('contracts'));
    console.log('Loaded', contracts.length, 'contracts');
    for (const contract of contracts) {
        const contractRef = firestore.doc(`contracts/${contract.id}`);
        const lastComments = await (0, utils_1.getValues)(contractRef.collection('comments').orderBy('createdTime', 'desc').limit(1));
        if (lastComments.length > 0) {
            const lastCommentTime = lastComments[0].createdTime;
            console.log('Updating lastCommentTime', contract.question, lastCommentTime);
            await contractRef.update({
                lastCommentTime,
            });
        }
    }
}
if (require.main === module) {
    updateLastCommentTime().then(() => process.exit());
}
//# sourceMappingURL=update-last-comment-time.js.map