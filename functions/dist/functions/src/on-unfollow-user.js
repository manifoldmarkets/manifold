"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onUnfollowUser = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const firestore_1 = require("firebase-admin/firestore");
exports.onUnfollowUser = functions.firestore
    .document('users/{userId}/follows/{followedUserId}')
    .onDelete(async (change, context) => {
    const { followedUserId } = context.params;
    await firestore.doc(`users/${followedUserId}`).update({
        followerCountCached: firestore_1.FieldValue.increment(-1),
    });
});
const firestore = admin.firestore();
//# sourceMappingURL=on-unfollow-user.js.map