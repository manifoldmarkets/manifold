"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onCreateUser = void 0;
const functions = require("firebase-functions");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
dayjs.extend(utc);
const utils_1 = require("./utils");
const emails_1 = require("./emails");
const weekly_markets_emails_1 = require("./weekly-markets-emails");
exports.onCreateUser = functions
    .runWith({ secrets: ['MAILGUN_KEY'] })
    .firestore.document('users/{userId}')
    .onCreate(async (snapshot) => {
    const user = snapshot.data();
    const privateUser = await (0, utils_1.getPrivateUser)(user.id);
    if (!privateUser)
        return;
    await (0, emails_1.sendWelcomeEmail)(user, privateUser);
    const followupSendTime = dayjs().add(48, 'hours').toString();
    await (0, emails_1.sendPersonalFollowupEmail)(user, privateUser, followupSendTime);
    const guideSendTime = dayjs().add(96, 'hours').toString();
    await (0, emails_1.sendCreatorGuideEmail)(user, privateUser, guideSendTime);
    // skip email if weekly email is about to go out
    const day = dayjs().utc().day();
    if (day === 0 || (day === 1 && dayjs().utc().hour() <= 19))
        return;
    const contracts = await (0, weekly_markets_emails_1.getTrendingContracts)();
    const marketsSendTime = dayjs().add(24, 'hours').toString();
    await (0, emails_1.sendInterestingMarketsEmail)(user, privateUser, contracts, marketsSendTime);
});
//# sourceMappingURL=on-create-user.js.map