"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const script_init_1 = require("./script-init");
(0, script_init_1.initAdmin)();
const user_notification_preferences_1 = require("common/user-notification-preferences");
const utils_1 = require("functions/src/utils");
const firestore = admin.firestore();
async function main() {
    if ((0, utils_1.isProd)())
        return console.log('This script is not allowed to run in production');
    const snap = await firestore.collection('private-users').get();
    const users = snap.docs.map((d) => d.data());
    await Promise.all(users.map(async (user) => {
        const privateUser = {
            id: user.id,
            notificationPreferences: (0, user_notification_preferences_1.getDefaultNotificationPreferences)(true),
            blockedUserIds: [],
            blockedByUserIds: [],
            blockedContractIds: [],
            blockedGroupSlugs: [],
        };
        try {
            await firestore
                .collection('private-users')
                .doc(user.id)
                .set(privateUser);
            console.log('created private user for:', user.id);
        }
        catch (e) {
            console.log('error creating private user for:', user.id, e);
        }
    }));
}
if (require.main === module)
    main().then(() => process.exit());
//# sourceMappingURL=create-dev-private-users.js.map