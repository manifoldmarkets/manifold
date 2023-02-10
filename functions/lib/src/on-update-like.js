"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onDeleteLike = exports.onUpdateLike = exports.onCreateLike = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const utils_1 = require("./utils");
const create_notification_1 = require("./create-notification");
const lodash_1 = require("lodash");
const firestore = admin.firestore();
exports.onCreateLike = functions.firestore
    .document('users/{userId}/likes/{likeId}')
    .onCreate(async (change, context) => {
    const like = change.data();
    const { eventId } = context;
    if (like.type === 'contract') {
        await handleCreateLikeNotification(like, eventId);
        await updateContractLikes(like);
    }
});
exports.onUpdateLike = functions.firestore
    .document('users/{userId}/likes/{likeId}')
    .onUpdate(async (change, context) => {
    const like = change.after.data();
    const prevLike = change.before.data();
    const { eventId } = context;
    if (like.type === 'contract' && like.tipTxnId !== prevLike.tipTxnId) {
        await handleCreateLikeNotification(like, eventId);
        await updateContractLikes(like);
    }
});
exports.onDeleteLike = functions.firestore
    .document('users/{userId}/likes/{likeId}')
    .onDelete(async (change) => {
    const like = change.data();
    if (like.type === 'contract') {
        await removeContractLike(like);
    }
});
const updateContractLikes = async (like) => {
    var _a;
    const contract = await (0, utils_1.getContract)(like.id);
    if (!contract) {
        (0, utils_1.log)('Could not find contract');
        return;
    }
    const likedByUserIds = (0, lodash_1.uniq)(((_a = contract.likedByUserIds) !== null && _a !== void 0 ? _a : []).concat(like.userId));
    await firestore
        .collection('contracts')
        .doc(like.id)
        .update({ likedByUserIds, likedByUserCount: likedByUserIds.length });
};
const handleCreateLikeNotification = async (like, eventId) => {
    const contract = await (0, utils_1.getContract)(like.id);
    if (!contract) {
        (0, utils_1.log)('Could not find contract');
        return;
    }
    const contractCreator = await (0, utils_1.getUser)(contract.creatorId);
    if (!contractCreator) {
        (0, utils_1.log)('Could not find contract creator');
        return;
    }
    const liker = await (0, utils_1.getUser)(like.userId);
    if (!liker) {
        (0, utils_1.log)('Could not find liker');
        return;
    }
    let tipTxnData = undefined;
    if (like.tipTxnId) {
        const tipTxn = await firestore.collection('txns').doc(like.tipTxnId).get();
        if (!tipTxn.exists) {
            (0, utils_1.log)('Could not find tip txn');
            return;
        }
        tipTxnData = tipTxn.data();
    }
    await (0, create_notification_1.createLikeNotification)(liker, contractCreator, like, eventId, contract, tipTxnData);
};
const removeContractLike = async (like) => {
    var _a;
    const contract = await (0, utils_1.getContract)(like.id);
    if (!contract) {
        (0, utils_1.log)('Could not find contract');
        return;
    }
    const likedByUserIds = (0, lodash_1.uniq)((_a = contract.likedByUserIds) !== null && _a !== void 0 ? _a : []);
    const newLikedByUserIds = likedByUserIds.filter((userId) => userId !== like.userId);
    await firestore.collection('contracts').doc(like.id).update({
        likedByUserIds: newLikedByUserIds,
        likedByUserCount: newLikedByUserIds.length,
    });
};
//# sourceMappingURL=on-update-like.js.map