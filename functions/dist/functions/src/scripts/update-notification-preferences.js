"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const script_init_1 = require("./script-init");
const utils_1 = require("functions/src/utils");
const firestore_1 = require("firebase-admin/firestore");
(0, script_init_1.initAdmin)();
const firestore = admin.firestore();
async function main() {
    const privateUsers = await (0, utils_1.getAllPrivateUsers)();
    await Promise.all(privateUsers.map((privateUser) => {
        if (!privateUser.id)
            return Promise.resolve();
        return firestore.collection('private-users').doc(privateUser.id).update({
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            notificationPreferences: privateUser.notificationSubscriptionTypes,
            notificationSubscriptionTypes: firestore_1.FieldValue.delete(),
        });
    }));
}
if (require.main === module)
    main().then(() => process.exit());
//# sourceMappingURL=update-notification-preferences.js.map