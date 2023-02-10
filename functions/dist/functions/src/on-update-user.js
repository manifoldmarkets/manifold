"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onUpdateUser = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const antes_1 = require("../../common/antes");
const create_notification_1 = require("./create-notification");
const economy_1 = require("../../common/economy");
const firestore = admin.firestore();
exports.onUpdateUser = functions.firestore
    .document('users/{userId}')
    .onUpdate(async (change, context) => {
    const prevUser = change.before.data();
    const user = change.after.data();
    const { eventId } = context;
    if (prevUser.referredByUserId !== user.referredByUserId) {
        await handleUserUpdatedReferral(user, eventId);
    }
    if (user.balance <= 0) {
        await cancelLimitOrders(user.id);
    }
});
async function handleUserUpdatedReferral(user, eventId) {
    // Only create a referral txn if the user has a referredByUserId
    if (!user.referredByUserId) {
        console.log(`Not set: referredByUserId ${user.referredByUserId}`);
        return;
    }
    const referredByUserId = user.referredByUserId;
    await firestore.runTransaction(async (transaction) => {
        // get user that referred this user
        const referredByUserDoc = firestore.doc(`users/${referredByUserId}`);
        const referredByUserSnap = await transaction.get(referredByUserDoc);
        if (!referredByUserSnap.exists) {
            console.log(`User ${referredByUserId} not found`);
            return;
        }
        const referredByUser = referredByUserSnap.data();
        let referredByContract = undefined;
        if (user.referredByContractId) {
            const referredByContractDoc = firestore.doc(`contracts/${user.referredByContractId}`);
            referredByContract = await transaction
                .get(referredByContractDoc)
                .then((snap) => snap.data());
        }
        console.log(`referredByContract: ${referredByContract}`);
        let referredByGroup = undefined;
        if (user.referredByGroupId) {
            const referredByGroupDoc = firestore.doc(`groups/${user.referredByGroupId}`);
            referredByGroup = await transaction
                .get(referredByGroupDoc)
                .then((snap) => snap.data());
        }
        console.log(`referredByGroup: ${referredByGroup}`);
        const txns = (await firestore
            .collection('txns')
            .where('toId', '==', referredByUserId)
            .where('category', '==', 'REFERRAL')
            .get()).docs.map((txn) => txn.ref);
        if (txns.length > 0) {
            const referralTxns = await transaction.getAll(...txns).catch((err) => {
                console.error('error getting txns:', err);
                throw err;
            });
            // If the referring user already has a referral txn due to referring this user, halt
            if (referralTxns.map((txn) => { var _a; return (_a = txn.data()) === null || _a === void 0 ? void 0 : _a.description; }).includes(user.id)) {
                console.log('found referral txn with the same details, aborting');
                return;
            }
        }
        console.log('creating referral txns');
        const fromId = antes_1.HOUSE_LIQUIDITY_PROVIDER_ID;
        // if they're updating their referredId, create a txn for both
        const txn = {
            id: eventId,
            createdTime: Date.now(),
            fromId,
            fromType: 'BANK',
            toId: referredByUserId,
            toType: 'USER',
            amount: economy_1.REFERRAL_AMOUNT,
            token: 'M$',
            category: 'REFERRAL',
            description: `Referred new user id: ${user.id} for ${economy_1.REFERRAL_AMOUNT}`,
        };
        const txnDoc = firestore.collection(`txns/`).doc(txn.id);
        transaction.set(txnDoc, txn);
        console.log('created referral with txn id:', txn.id);
        // We're currently not subtracting M$ from the house, not sure if we want to for accounting purposes.
        transaction.update(referredByUserDoc, {
            balance: referredByUser.balance + economy_1.REFERRAL_AMOUNT,
            totalDeposits: referredByUser.totalDeposits + economy_1.REFERRAL_AMOUNT,
        });
        await (0, create_notification_1.createReferralNotification)(referredByUser, user, eventId, txn.amount.toString(), referredByContract, referredByGroup);
    });
}
async function cancelLimitOrders(userId) {
    const snapshot = (await firestore
        .collectionGroup('bets')
        .where('userId', '==', userId)
        .where('isFilled', '==', false)
        .get());
    await Promise.all(snapshot.docs.map((doc) => doc.ref.update({ isCancelled: true })));
}
//# sourceMappingURL=on-update-user.js.map