"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetWeeklyEmailsFlag = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const utils_1 = require("./utils");
exports.resetWeeklyEmailsFlag = functions
    .runWith({ secrets: ['MAILGUN_KEY'] })
    // every Monday at 12 am PT (UTC -07:00) ( 12 hours before the emails will be sent)
    .pubsub.schedule('0 7 * * 1')
    .timeZone('Etc/UTC')
    .onRun(async () => {
    const privateUsers = await (0, utils_1.getAllPrivateUsers)();
    // get all users that haven't unsubscribed from weekly emails
    const privateUsersToSendEmailsTo = privateUsers.filter((user) => {
        return !user.unsubscribedFromWeeklyTrendingEmails;
    });
    const firestore = admin.firestore();
    await Promise.all(privateUsersToSendEmailsTo.map(async (user) => {
        return firestore.collection('private-users').doc(user.id).update({
            weeklyTrendingEmailSent: false,
        });
    }));
});
//# sourceMappingURL=reset-weekly-emails-flag.js.map