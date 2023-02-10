"use strict";
// For a while, we didn't enforce that display names would be clean in the `updateUserInfo`
// cloud function, so this script hunts down unclean ones.
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const script_init_1 = require("./script-init");
const clean_username_1 = require("../../../common/util/clean-username");
const utils_1 = require("../utils");
(0, script_init_1.initAdmin)();
const firestore = admin.firestore();
if (require.main === module) {
    const usersColl = firestore.collection('users');
    usersColl.get().then(async (userSnaps) => {
        (0, utils_1.log)(`Loaded ${userSnaps.size} users.`);
        const updates = userSnaps.docs.reduce((acc, u) => {
            const name = u.data().name;
            if (name != (0, clean_username_1.cleanDisplayName)(name)) {
                acc.push({ doc: u.ref, fields: { name: (0, clean_username_1.cleanDisplayName)(name) } });
            }
            return acc;
        }, []);
        (0, utils_1.log)(`Found ${updates.length} users to update:`, updates);
        await (0, utils_1.writeAsync)(firestore, updates);
        (0, utils_1.log)(`Updated all users.`);
    });
}
//# sourceMappingURL=clean-display-names.js.map