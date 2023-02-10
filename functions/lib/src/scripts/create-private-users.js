"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const script_init_1 = require("./script-init");
(0, script_init_1.initAdmin)();
const economy_1 = require("common/economy");
const user_notification_preferences_1 = require("common/user-notification-preferences");
const firestore = admin.firestore();
async function main() {
    const snap = await firestore.collection('users').get();
    const users = snap.docs.map((d) => d.data());
    for (const user of users) {
        const fbUser = await admin.auth().getUser(user.id);
        const email = fbUser.email;
        const privateUser = {
            id: user.id,
            email,
            notificationPreferences: (0, user_notification_preferences_1.getDefaultNotificationPreferences)(),
            blockedUserIds: [],
            blockedByUserIds: [],
            blockedContractIds: [],
            blockedGroupSlugs: [],
        };
        if (user.totalDeposits === undefined) {
            await firestore
                .collection('users')
                .doc(user.id)
                .update({ totalDeposits: economy_1.STARTING_BALANCE });
            console.log('set starting balance for:', user.username);
        }
        try {
            await firestore
                .collection('private-users')
                .doc(user.id)
                .create(privateUser);
            console.log('created private user for:', user.username);
        }
        catch (_) {
            // private user already created
        }
    }
}
if (require.main === module)
    main().then(() => process.exit());
//# sourceMappingURL=create-private-users.js.map