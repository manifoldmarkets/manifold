"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const script_init_1 = require("./script-init");
(0, script_init_1.initAdmin)();
const admin = require("firebase-admin");
const utils_1 = require("../utils");
const firestore = admin.firestore();
async function main() {
    const privateUsers = await (0, utils_1.getAllPrivateUsers)();
    await Promise.all(privateUsers.map(async (privateUser) => {
        if (!privateUser || !privateUser.id)
            return;
        return firestore
            .collection('private-users')
            .doc(privateUser.id)
            .update(Object.assign(Object.assign({}, privateUser), { blockedByUserIds: [], blockedUserIds: [], blockedContractIds: [], blockedGroupSlugs: [] }));
    }));
}
if (require.main === module)
    main().then(() => process.exit());
//# sourceMappingURL=backfill-blocks.js.map