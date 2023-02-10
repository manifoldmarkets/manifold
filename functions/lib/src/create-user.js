"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.numberUsersWithIp = exports.createuser = void 0;
const admin = require("firebase-admin");
const zod_1 = require("zod");
const utils_1 = require("./utils");
const random_1 = require("../../common/util/random");
const clean_username_1 = require("../../common/util/clean-username");
const constants_1 = require("../../common/envs/constants");
const categories_1 = require("../../common/categories");
const analytics_1 = require("./analytics");
const api_1 = require("./api");
const economy_1 = require("../../common/economy");
const user_notification_preferences_1 = require("../../common/user-notification-preferences");
const object_1 = require("../../common/util/object");
const generate_and_update_avatar_urls_1 = require("./helpers/generate-and-update-avatar-urls");
const storage_1 = require("firebase-admin/storage");
const bodySchema = zod_1.z.object({
    deviceToken: zod_1.z.string().optional(),
});
const opts = { secrets: ['MAILGUN_KEY'] };
exports.createuser = (0, api_1.newEndpoint)(opts, async (req, auth) => {
    const { deviceToken } = (0, api_1.validate)(bodySchema, req.body);
    const preexistingUser = await (0, utils_1.getUser)(auth.uid);
    if (preexistingUser)
        throw new api_1.APIError(400, 'User already exists', { user: preexistingUser });
    const fbUser = await admin.auth().getUser(auth.uid);
    const email = fbUser.email;
    if (!(0, constants_1.isWhitelisted)(email)) {
        throw new api_1.APIError(400, `${email} is not whitelisted`);
    }
    const emailName = email === null || email === void 0 ? void 0 : email.replace(/@.*$/, '');
    const rawName = fbUser.displayName || emailName || 'User' + (0, random_1.randomString)(4);
    const name = (0, clean_username_1.cleanDisplayName)(rawName);
    let username = (0, clean_username_1.cleanUsername)(name);
    const sameNameUser = await (0, utils_1.getUserByUsername)(username);
    if (sameNameUser) {
        username += (0, random_1.randomString)(4);
    }
    const avatarUrl = fbUser.photoURL
        ? fbUser.photoURL
        : await (0, generate_and_update_avatar_urls_1.generateAvatarUrl)(auth.uid, name, (0, storage_1.getStorage)().bucket());
    const deviceUsedBefore = !deviceToken || (await isPrivateUserWithDeviceToken(deviceToken));
    const balance = deviceUsedBefore ? economy_1.SUS_STARTING_BALANCE : economy_1.STARTING_BALANCE;
    // Only undefined prop should be avatarUrl
    const user = (0, object_1.removeUndefinedProps)({
        id: auth.uid,
        name,
        username,
        avatarUrl,
        balance,
        totalDeposits: balance,
        createdTime: Date.now(),
        profitCached: { daily: 0, weekly: 0, monthly: 0, allTime: 0 },
        nextLoanCached: 0,
        followerCountCached: 0,
        streakForgiveness: 1,
        shouldShowWelcome: true,
        achievements: {},
        creatorTraders: { daily: 0, weekly: 0, monthly: 0, allTime: 0 },
    });
    await firestore.collection('users').doc(auth.uid).create(user);
    console.log('created user', username, 'firebase id:', auth.uid);
    const privateUser = {
        id: auth.uid,
        email,
        initialIpAddress: req.ip,
        initialDeviceToken: deviceToken,
        notificationPreferences: (0, user_notification_preferences_1.getDefaultNotificationPreferences)(),
        blockedUserIds: [],
        blockedByUserIds: [],
        blockedContractIds: [],
        blockedGroupSlugs: [],
        weeklyTrendingEmailSent: false,
        weeklyPortfolioUpdateEmailSent: false,
    };
    await firestore.collection('private-users').doc(auth.uid).create(privateUser);
    await addUserToDefaultGroups(user);
    await (0, analytics_1.track)(auth.uid, 'create user', { username }, { ip: req.ip });
    return { user, privateUser };
});
const firestore = admin.firestore();
const isPrivateUserWithDeviceToken = async (deviceToken) => {
    const snap = await firestore
        .collection('private-users')
        .where('initialDeviceToken', '==', deviceToken)
        .get();
    return !snap.empty;
};
const numberUsersWithIp = async (ipAddress) => {
    const snap = await firestore
        .collection('private-users')
        .where('initialIpAddress', '==', ipAddress)
        .get();
    return snap.docs.length;
};
exports.numberUsersWithIp = numberUsersWithIp;
const addUserToDefaultGroups = async (user) => {
    for (const category of Object.values(categories_1.DEFAULT_CATEGORIES)) {
        const slug = category.toLowerCase() + categories_1.CATEGORIES_GROUP_SLUG_POSTFIX;
        const groups = await (0, utils_1.getValues)(firestore.collection('groups').where('slug', '==', slug));
        await firestore
            .collection(`groups/${groups[0].id}/groupMembers`)
            .doc(user.id)
            .set({ userId: user.id, createdTime: Date.now() });
    }
};
//# sourceMappingURL=create-user.js.map