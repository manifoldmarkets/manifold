"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const script_init_1 = require("./script-init");
const utils_1 = require("functions/src/utils");
const user_notification_preferences_1 = require("common/user-notification-preferences");
(0, script_init_1.initAdmin)();
const firestore = admin.firestore();
async function main() {
    const privateUsers = await (0, utils_1.getAllPrivateUsers)();
    const disableEmails = !(0, utils_1.isProd)();
    await Promise.all(privateUsers.map((privateUser) => {
        if (!privateUser.id)
            return Promise.resolve();
        return firestore
            .collection('private-users')
            .doc(privateUser.id)
            .update({
            notificationPreferences: (0, user_notification_preferences_1.getDefaultNotificationPreferences)(disableEmails),
        });
    }));
}
if (require.main === module)
    main().then(() => process.exit());
//# sourceMappingURL=create-new-notification-preferences.js.map