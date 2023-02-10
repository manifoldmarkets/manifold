"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onCreateTxn = void 0;
const functions = require("firebase-functions");
const utils_1 = require("./utils");
const create_notification_1 = require("./create-notification");
const admin = require("firebase-admin");
const firestore = admin.firestore();
exports.onCreateTxn = functions.firestore
    .document('txns/{txnId}')
    .onCreate(async (change, context) => {
    const txn = change.data();
    const { eventId } = context;
    if (txn.category === 'TIP') {
        await handleTipTxn(txn, eventId);
    }
});
async function handleTipTxn(txn, eventId) {
    var _a;
    // get user sending and receiving tip
    const [sender, receiver] = await Promise.all([
        (0, utils_1.getUser)(txn.fromId),
        (0, utils_1.getUser)(txn.toId),
    ]);
    if (!sender || !receiver) {
        (0, utils_1.log)('Could not find corresponding users');
        return;
    }
    if (!((_a = txn.data) === null || _a === void 0 ? void 0 : _a.commentId)) {
        (0, utils_1.log)('No comment id in tip txn.data');
        return;
    }
    let contract = undefined;
    let group = undefined;
    let commentSnapshot = undefined;
    if (txn.data.contractId) {
        contract = await (0, utils_1.getContract)(txn.data.contractId);
        if (!contract) {
            (0, utils_1.log)('Could not find contract');
            return;
        }
        commentSnapshot = await firestore
            .collection('contracts')
            .doc(contract.id)
            .collection('comments')
            .doc(txn.data.commentId)
            .get();
    }
    else if (txn.data.groupId) {
        group = await (0, utils_1.getGroup)(txn.data.groupId);
        if (!group) {
            (0, utils_1.log)('Could not find group');
            return;
        }
        commentSnapshot = await firestore
            .collection('groups')
            .doc(group.id)
            .collection('comments')
            .doc(txn.data.commentId)
            .get();
    }
    if (!commentSnapshot || !commentSnapshot.exists) {
        (0, utils_1.log)('Could not find comment');
        return;
    }
    const comment = commentSnapshot.data();
    await (0, create_notification_1.createTipNotification)(sender, receiver, txn, eventId, comment.id, contract, group);
}
//# sourceMappingURL=on-create-txn.js.map