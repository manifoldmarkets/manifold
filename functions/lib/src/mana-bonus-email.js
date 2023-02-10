"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.manabonusemail = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const dayjs = require("dayjs");
const utils_1 = require("./utils");
const emails_1 = require("./emails");
exports.manabonusemail = functions
    .runWith({ secrets: ['MAILGUN_KEY'] })
    .pubsub.schedule('0 9 * * 1-7')
    .onRun(async () => {
    await sendOneWeekEmails();
});
const firestore = admin.firestore();
async function sendOneWeekEmails() {
    const oneWeekAgo = dayjs().subtract(1, 'week').valueOf();
    const twoWeekAgo = dayjs().subtract(2, 'weeks').valueOf();
    const userDocs = await firestore
        .collection('users')
        .where('createdTime', '<=', oneWeekAgo)
        .get();
    for (const user of userDocs.docs.map((d) => d.data())) {
        if (user.createdTime < twoWeekAgo)
            continue;
        const privateUser = await (0, utils_1.getPrivateUser)(user.id);
        if (!privateUser || privateUser.manaBonusEmailSent)
            continue;
        await firestore
            .collection('private-users')
            .doc(user.id)
            .update({ manaBonusEmailSent: true });
        console.log('sending m$ bonus email to', user.username);
        await (0, emails_1.sendOneWeekBonusEmail)(user, privateUser);
        return;
    }
}
//# sourceMappingURL=mana-bonus-email.js.map