"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onCreateCommentOnGroup = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const create_notification_1 = require("./create-notification");
const firestore = admin.firestore();
exports.onCreateCommentOnGroup = functions.firestore
    .document('groups/{groupId}/comments/{commentId}')
    .onCreate(async (change, context) => {
    const { eventId } = context;
    const { groupId } = context.params;
    const comment = change.data();
    const creatorSnapshot = await firestore
        .collection('users')
        .doc(comment.userId)
        .get();
    if (!creatorSnapshot.exists)
        throw new Error('Could not find user');
    const groupSnapshot = await firestore
        .collection('groups')
        .doc(groupId)
        .get();
    if (!groupSnapshot.exists)
        throw new Error('Could not find group');
    const group = groupSnapshot.data();
    await firestore.collection('groups').doc(groupId).update({
        mostRecentChatActivityTime: comment.createdTime,
    });
    await Promise.all(group.memberIds.map(async (memberId) => {
        return await (0, create_notification_1.createGroupCommentNotification)(creatorSnapshot.data(), memberId, comment, group, eventId);
    }));
});
//# sourceMappingURL=on-create-comment-on-group.js.map