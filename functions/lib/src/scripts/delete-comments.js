"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const script_init_1 = require("./script-init");
(0, script_init_1.initAdmin)();
const parse_1 = require("common/util/parse");
const firestore = admin.firestore();
async function deleteComments(username, confirmed) {
    console.log('Deleting comments from username', username);
    const snapshot = await firestore
        .collectionGroup('comments')
        .where('userUsername', '==', username)
        .get();
    const comments = snapshot.docs.map((doc) => doc.data());
    console.log('Loaded', comments.length, 'comments');
    for (const doc of snapshot.docs) {
        const comment = doc.data();
        console.log('deleting', (0, parse_1.richTextToString)(comment.content));
        if (confirmed) {
            await doc.ref.delete();
        }
    }
}
if (require.main === module) {
    const [username, confirmed] = process.argv.slice(2);
    if (!username) {
        console.log('First argument must be username of account whose comments to delete');
        process.exit(1);
    }
    const didConfirm = confirmed === '--confirm';
    if (!didConfirm) {
        console.log('Run with "--confirm" to actually delete comments');
    }
    deleteComments(username, didConfirm).then(() => process.exit());
}
//# sourceMappingURL=delete-comments.js.map