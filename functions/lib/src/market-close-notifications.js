"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMarketCloseEmails = exports.marketCloseNotifications = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const utils_1 = require("./utils");
const create_notification_1 = require("./create-notification");
const time_1 = require("../../common/util/time");
const SEND_NOTIFICATIONS_EVERY_DAYS = 5;
exports.marketCloseNotifications = functions
    .runWith({ secrets: ['MAILGUN_KEY'], memory: '4GB', timeoutSeconds: 540 })
    .pubsub.schedule('every 1 hours')
    .onRun(async () => {
    (0, utils_1.isProd)()
        ? await sendMarketCloseEmails()
        : console.log('Not prod, not sending emails');
});
const firestore = admin.firestore();
async function sendMarketCloseEmails() {
    const contracts = await firestore.runTransaction(async (transaction) => {
        const now = Date.now();
        const snap = await transaction.get(firestore
            .collection('contracts')
            .where('isResolved', '==', false)
            .where('closeTime', '<', now));
        const contracts = snap.docs.map((doc) => doc.data());
        console.log(`Found ${contracts.length} closed contracts`);
        const needsNotification = contracts.filter((contract) => shouldSendFirstOrFollowUpCloseNotification(contract));
        console.log(`Found ${needsNotification.length} notifications to send`);
        needsNotification.map(async (contract) => {
            transaction.update(firestore.collection('contracts').doc(contract.id), {
                closeEmailsSent: admin.firestore.FieldValue.increment(1),
            });
        });
        return needsNotification;
    });
    for (const contract of contracts) {
        console.log('sending close email for', contract.slug, 'closed', contract.closeTime);
        const user = await (0, utils_1.getUserByUsername)(contract.creatorUsername);
        if (!user)
            continue;
        const privateUser = await (0, utils_1.getPrivateUser)(user.id);
        if (!privateUser)
            continue;
        await (0, create_notification_1.createMarketClosedNotification)(contract, user, privateUser, contract.id + '-closed-at-' + contract.closeTime);
    }
}
exports.sendMarketCloseEmails = sendMarketCloseEmails;
// The downside of this approach is if this function goes down for the entire
// day of a multiple of the time period after the market has closed, it won't
// keep sending them notifications bc when it comes back online the time period will have passed
function shouldSendFirstOrFollowUpCloseNotification(contract) {
    if (!contract.closeEmailsSent || contract.closeEmailsSent === 0)
        return true;
    const { closedMultipleOfNDaysAgo, fullTimePeriodsSinceClose } = marketClosedMultipleOfNDaysAgo(contract);
    return (contract.closeEmailsSent > 0 &&
        closedMultipleOfNDaysAgo &&
        contract.closeEmailsSent === fullTimePeriodsSinceClose);
}
function marketClosedMultipleOfNDaysAgo(contract) {
    const now = Date.now();
    const closeTime = contract.closeTime;
    if (!closeTime)
        return { closedMultipleOfNDaysAgo: false, fullTimePeriodsSinceClose: 0 };
    const daysSinceClose = Math.floor((now - closeTime) / time_1.DAY_MS);
    return {
        closedMultipleOfNDaysAgo: daysSinceClose % SEND_NOTIFICATIONS_EVERY_DAYS == 0,
        fullTimePeriodsSinceClose: Math.floor(daysSinceClose / SEND_NOTIFICATIONS_EVERY_DAYS),
    };
}
//# sourceMappingURL=market-close-notifications.js.map