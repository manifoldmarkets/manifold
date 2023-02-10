"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const script_init_1 = require("./script-init");
(0, script_init_1.initAdmin)();
const firestore_1 = require("firebase-admin/firestore");
const utils_1 = require("../utils");
const promise_1 = require("common/util/promise");
const firestore = admin.firestore();
async function main() {
    const users = await (0, utils_1.getAllUsers)();
    console.log('Loaded', users.length, 'users');
    await (0, promise_1.mapAsync)(users, async (user) => {
        const u = user;
        if (!u.email)
            return;
        console.log('delete email for', u.id, u.email);
        await firestore.collection('users').doc(user.id).update({
            email: firestore_1.FieldValue.delete(),
        });
    });
}
if (require.main === module)
    main().then(() => process.exit());
//# sourceMappingURL=delete-email.js.map