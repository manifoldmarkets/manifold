"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runContractPayoutTxn = exports.runTxn = void 0;
const admin = require("firebase-admin");
const firestore_1 = require("firebase-admin/firestore");
const object_1 = require("../../common/util/object");
async function runTxn(fbTransaction, data) {
    const { amount, fromId, toId, toType } = data;
    const fromDoc = firestore.doc(`users/${fromId}`);
    const fromSnap = await fbTransaction.get(fromDoc);
    if (!fromSnap.exists) {
        return { status: 'error', message: 'User not found' };
    }
    const fromUser = fromSnap.data();
    if (fromUser.balance < amount) {
        return {
            status: 'error',
            message: `Insufficient balance: ${fromUser.username} needed ${amount} but only had ${fromUser.balance} `,
        };
    }
    // TODO: Track payments received by charities, bank, contracts too.
    if (toType === 'USER') {
        const toDoc = firestore.doc(`users/${toId}`);
        fbTransaction.update(toDoc, {
            balance: firestore_1.FieldValue.increment(amount),
            totalDeposits: firestore_1.FieldValue.increment(amount),
        });
    }
    const newTxnDoc = firestore.collection(`txns/`).doc();
    const txn = Object.assign({ id: newTxnDoc.id, createdTime: Date.now() }, data);
    fbTransaction.create(newTxnDoc, (0, object_1.removeUndefinedProps)(txn));
    fbTransaction.update(fromDoc, {
        balance: firestore_1.FieldValue.increment(-amount),
        totalDeposits: firestore_1.FieldValue.increment(-amount),
    });
    return { status: 'success', txn };
}
exports.runTxn = runTxn;
function runContractPayoutTxn(fbTransaction, data, deposit) {
    const { amount, toId } = data;
    const toDoc = firestore.doc(`users/${toId}`);
    fbTransaction.update(toDoc, {
        balance: firestore_1.FieldValue.increment(amount),
        totalDeposits: firestore_1.FieldValue.increment(deposit),
    });
    const newTxnDoc = firestore.collection(`txns/`).doc();
    const txn = Object.assign({ id: newTxnDoc.id, createdTime: Date.now() }, data);
    fbTransaction.create(newTxnDoc, (0, object_1.removeUndefinedProps)(txn));
    return { status: 'success', txn };
}
exports.runContractPayoutTxn = runContractPayoutTxn;
const firestore = admin.firestore();
//# sourceMappingURL=run-txn.js.map