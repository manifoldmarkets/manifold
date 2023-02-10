"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleReferral = void 0;
const admin = require("firebase-admin");
const antes_1 = require("../../../common/antes");
const create_notification_1 = require("../create-notification");
const economy_1 = require("../../../common/economy");
const firestore = admin.firestore();
async function handleReferral(staleUser, eventId) {
    // Only create a referral txn if the user has a referredByUserId
    if (!staleUser.referredByUserId || staleUser.lastBetTime)
        return;
    const referredByUserId = staleUser.referredByUserId;
    await firestore.runTransaction(async (transaction) => {
        const userDoc = firestore.doc(`users/${staleUser.id}`);
        const user = (await transaction.get(userDoc)).data();
        // Double-check the last bet time in the transaction bc otherwise we'll hand out multiple referral bonuses
        if (user.lastBetTime !== undefined)
            return;
        // get user that referred this user
        const referredByUserDoc = firestore.doc(`users/${referredByUserId}`);
        const referredByUserSnap = await transaction.get(referredByUserDoc);
        if (!referredByUserSnap.exists) {
            console.log(`User ${referredByUserId} not found`);
            return;
        }
        const referredByUser = referredByUserSnap.data();
        console.log(`referredByUser: ${referredByUserId}`);
        let referredByContract = undefined;
        if (user.referredByContractId) {
            const referredByContractDoc = firestore.doc(`contracts/${user.referredByContractId}`);
            referredByContract = await transaction
                .get(referredByContractDoc)
                .then((snap) => snap.data());
        }
        console.log(`referredByContract: ${referredByContract === null || referredByContract === void 0 ? void 0 : referredByContract.slug}`);
        let referredByGroup = undefined;
        if (user.referredByGroupId) {
            const referredByGroupDoc = firestore.doc(`groups/${user.referredByGroupId}`);
            referredByGroup = await transaction
                .get(referredByGroupDoc)
                .then((snap) => snap.data());
        }
        console.log(`referredByGroup: ${referredByGroup === null || referredByGroup === void 0 ? void 0 : referredByGroup.slug}`);
        const txns = await transaction.get(firestore
            .collection('txns')
            .where('toId', '==', referredByUserId)
            .where('category', '==', 'REFERRAL'));
        if (txns.size > 0) {
            // If the referring user already has a referral txn due to referring this user, halt
            if (txns.docs.some((txn) => { var _a; return ((_a = txn.data()) === null || _a === void 0 ? void 0 : _a.description) === user.id; })) {
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
        // We're currently not subtracting Ṁ from the house, not sure if we want to for accounting purposes.
        transaction.update(referredByUserDoc, {
            balance: referredByUser.balance + economy_1.REFERRAL_AMOUNT,
            totalDeposits: referredByUser.totalDeposits + economy_1.REFERRAL_AMOUNT,
        });
        // Set lastBetTime to 0 the first time they bet so they still get a streak bonus, but we don't hand out multiple referral txns
        transaction.update(userDoc, {
            lastBetTime: 0,
        });
        await (0, create_notification_1.createReferralNotification)(referredByUser, user, eventId, txn.amount.toString(), referredByContract, referredByGroup);
    });
}
exports.handleReferral = handleReferral;
//# sourceMappingURL=handle-referral.js.map