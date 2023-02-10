"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const script_init_1 = require("./script-init");
const utils_1 = require("../utils");
const firestore_1 = require("firebase-admin/firestore");
(0, script_init_1.initAdmin)();
const firestore = admin.firestore();
async function main() {
    const collection = 'private-users';
    const users = await (0, utils_1.getValues)(firestore.collection(collection));
    await Promise.all(users.map(async (user) => {
        await firestore.collection(collection).doc(user.id).update({
            username: firestore_1.FieldValue.delete(),
        });
    }));
}
if (require.main === module)
    main().then(() => process.exit());
//# sourceMappingURL=remove-unused-property.js.map