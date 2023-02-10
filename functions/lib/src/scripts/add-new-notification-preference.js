"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const script_init_1 = require("./script-init");
(0, script_init_1.initAdmin)();
const utils_1 = require("functions/src/utils");
const user_notification_preferences_1 = require("common/user-notification-preferences");
const array_1 = require("common/util/array");
const firestore = admin.firestore();
async function main() {
    const privateUsers = (0, array_1.filterDefined)(await (0, utils_1.getAllPrivateUsers)());
    const defaults = (0, user_notification_preferences_1.getDefaultNotificationPreferences)(!(0, utils_1.isProd)());
    await Promise.all(privateUsers.map((privateUser) => {
        if (!privateUser.id)
            return Promise.resolve();
        const prefs = privateUser.notificationPreferences
            ? privateUser.notificationPreferences
            : defaults;
        // Add your new pref here, and be sure to add the default as well
        const newPref = 'group_role_changed';
        if (prefs[newPref] === undefined) {
            prefs[newPref] = defaults[newPref];
        }
        return firestore
            .collection('private-users')
            .doc(privateUser.id)
            .update({
            notificationPreferences: Object.assign({}, prefs),
        });
    }));
}
if (require.main === module)
    main().then(() => process.exit());
//# sourceMappingURL=add-new-notification-preference.js.map