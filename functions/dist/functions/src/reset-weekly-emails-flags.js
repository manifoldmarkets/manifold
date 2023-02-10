"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetWeeklyEmailsFlags = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const utils_1 = require("./utils");
exports.resetWeeklyEmailsFlags = functions
    .runWith({
    timeoutSeconds: 300,
    memory: '4GB',
})
    .pubsub // every Monday at 12 am PT (UTC -07:00) ( 12 hours before the emails will be sent)
    .schedule('0 7 * * 1')
    .timeZone('Etc/UTC')
    .onRun(async () => {
    const privateUsers = await (0, utils_1.getAllPrivateUsers)();
    const firestore = admin.firestore();
    await Promise.all(privateUsers.map(async (user) => {
        return firestore.collection('private-users').doc(user.id).update({
            weeklyTrendingEmailSent: false,
            weeklyPortfolioUpdateEmailSent: false,
        });
    }));
});
//# sourceMappingURL=reset-weekly-emails-flags.js.map