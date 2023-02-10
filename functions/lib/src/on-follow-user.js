"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onFollowUser = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const utils_1 = require("./utils");
const create_notification_1 = require("./create-notification");
const firestore_1 = require("firebase-admin/firestore");
exports.onFollowUser = functions.firestore
    .document('users/{userId}/follows/{followedUserId}')
    .onCreate(async (change, context) => {
    const { userId, followedUserId } = context.params;
    const { eventId } = context;
    const follow = change.data();
    const followingUser = await (0, utils_1.getUser)(userId);
    if (!followingUser)
        throw new Error('Could not find following user');
    await firestore.doc(`users/${followedUserId}`).update({
        followerCountCached: firestore_1.FieldValue.increment(1),
    });
    await (0, create_notification_1.createFollowOrMarketSubsidizedNotification)(followingUser.id, 'follow', 'created', followingUser, eventId, '', { recipients: [follow.userId] });
});
const firestore = admin.firestore();
//# sourceMappingURL=on-follow-user.js.map