"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onCreateContractFollow = exports.onDeleteContractFollow = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const firestore_1 = require("firebase-admin/firestore");
// TODO: should cache the follower user ids in the contract as these triggers aren't idempotent
exports.onDeleteContractFollow = functions.firestore
    .document('contracts/{contractId}/follows/{userId}')
    .onDelete(async (_change, context) => {
    const { contractId } = context.params;
    const firestore = admin.firestore();
    await firestore
        .collection(`contracts`)
        .doc(contractId)
        .update({
        followerCount: firestore_1.FieldValue.increment(-1),
    });
});
exports.onCreateContractFollow = functions.firestore
    .document('contracts/{contractId}/follows/{userId}')
    .onCreate(async (_change, context) => {
    const { contractId } = context.params;
    const firestore = admin.firestore();
    await firestore
        .collection(`contracts`)
        .doc(contractId)
        .update({
        followerCount: firestore_1.FieldValue.increment(1),
    });
});
//# sourceMappingURL=on-update-contract-follow.js.map