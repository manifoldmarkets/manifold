"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onDeleteReaction = exports.onCreateReaction = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const create_notification_1 = require("./create-notification");
const firestore = admin.firestore();
exports.onCreateReaction = functions.firestore
    .document('users/{userId}/reactions/{reactionId}')
    .onCreate(async (change) => {
    const reaction = change.data();
    const { type } = reaction;
    await updateCountsOnDocuments(reaction);
    if (type === 'like') {
        await (0, create_notification_1.createLikeNotification)(reaction);
    }
});
exports.onDeleteReaction = functions.firestore
    .document('users/{userId}/reactions/{reactionId}')
    .onDelete(async (change) => {
    const reaction = change.data();
    await updateCountsOnDocuments(reaction);
});
const updateCountsOnDocuments = async (reaction) => {
    const { type, contentType, contentId } = reaction;
    const group = firestore
        .collectionGroup('reactions')
        .where('contentType', '==', contentType)
        .where('contentId', '==', contentId)
        .where('type', '==', type);
    const count = (await group.count().get()).data().count;
    if (reaction.contentType === 'contract') {
        await updateContractReactions(reaction, count);
    }
    else if (reaction.contentType === 'comment') {
        await updateCommentReactions(reaction, count);
    }
};
const updateContractReactions = async (reaction, count) => {
    await firestore.collection('contracts').doc(reaction.contentId).update({
        likedByUserCount: count,
    });
};
const updateCommentReactions = async (reaction, count) => {
    // getServerCount of reactions with content type and id equal to this comment
    await firestore
        .collection(`contracts/${reaction.contentParentId}/comments`)
        .doc(reaction.contentId)
        .update({
        likes: count,
    });
};
//# sourceMappingURL=on-update-reaction.js.map