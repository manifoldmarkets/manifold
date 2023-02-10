"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendOneWeekManaBonuses = exports.manasignupbonus = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const dayjs = require("dayjs");
const utils_1 = require("./utils");
const user_1 = require("../../common/user");
const economy_1 = require("../../common/economy");
const antes_1 = require("../../common/antes");
const api_1 = require("../../common/api");
const user_notification_preferences_1 = require("../../common/user-notification-preferences");
const run_txn_1 = require("./run-txn");
// TODO: delete email mana signup bonus
exports.manasignupbonus = functions
    .runWith({ secrets: ['MAILGUN_KEY'] })
    .pubsub.schedule('0 9 * * 1-7')
    .onRun(async () => {
    await sendOneWeekManaBonuses();
});
const firestore = admin.firestore();
async function sendOneWeekManaBonuses() {
    const oneWeekAgo = dayjs().subtract(1, 'week').valueOf();
    const twoWeekAgo = dayjs().subtract(2, 'weeks').valueOf();
    const userDocs = await firestore
        .collection('users')
        .where('createdTime', '>', twoWeekAgo)
        .get();
    const users = userDocs.docs
        .map((d) => d.data())
        .filter((u) => u.createdTime <= oneWeekAgo);
    console.log('Users created older than 1 week, younger than 2 weeks:', users.length);
    await Promise.all(users.map(async (user) => {
        const privateUser = await (0, utils_1.getPrivateUser)(user.id);
        if (!privateUser || privateUser.manaBonusSent)
            return;
        await firestore
            .collection('private-users')
            .doc(user.id)
            .update({ manaBonusSent: true });
        console.log('sending m$ bonus to', user.username);
        const signupBonusTxn = {
            fromType: 'BANK',
            amount: economy_1.STARTING_BONUS,
            category: 'SIGNUP_BONUS',
            toId: user.id,
            token: 'M$',
            toType: 'USER',
            fromId: (0, utils_1.isProd)()
                ? antes_1.HOUSE_LIQUIDITY_PROVIDER_ID
                : antes_1.DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
            description: 'Signup bonus',
            data: {},
        };
        const result = await firestore.runTransaction(async (transaction) => {
            var _a;
            const result = await (0, run_txn_1.runTxn)(transaction, signupBonusTxn);
            if (result.status == 'error') {
                throw new api_1.APIError(500, (_a = result.message) !== null && _a !== void 0 ? _a : 'An unknown error occurred.');
            }
            return result;
        });
        if (!result.txn)
            throw new Error(`txn not created ${result.message}`);
        // Only don't send if opted out, otherwise they'll wonder where the 500 mana came from
        if ((0, user_notification_preferences_1.userOptedOutOfBrowserNotifications)(privateUser))
            return;
        const notificationRef = firestore
            .collection(`/users/${user.id}/notifications`)
            .doc();
        const notification = {
            id: notificationRef.id,
            userId: user.id,
            reason: 'onboarding_flow',
            createdTime: Date.now(),
            isSeen: false,
            sourceId: result.txn.id,
            sourceType: 'signup_bonus',
            sourceUpdateType: 'created',
            sourceUserName: user_1.MANIFOLD_USER_NAME,
            sourceUserUsername: user_1.MANIFOLD_USER_USERNAME,
            sourceUserAvatarUrl: user_1.MANIFOLD_AVATAR_URL,
            sourceText: economy_1.STARTING_BONUS.toString(),
        };
        return await notificationRef.set(notification);
    }));
}
exports.sendOneWeekManaBonuses = sendOneWeekManaBonuses;
//# sourceMappingURL=mana-signup-bonus.js.map