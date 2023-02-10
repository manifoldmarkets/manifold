"use strict";
// We have some groups without IDs. Let's fill them in.
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const script_init_1 = require("./script-init");
const utils_1 = require("../utils");
(0, script_init_1.initAdmin)();
const firestore = admin.firestore();
if (require.main === module) {
    const groupsQuery = firestore.collection('groups');
    groupsQuery.get().then(async (groupSnaps) => {
        (0, utils_1.log)(`Loaded ${groupSnaps.size} groups.`);
        const needsFilling = groupSnaps.docs.filter((ct) => {
            return !('id' in ct.data());
        });
        (0, utils_1.log)(`${needsFilling.length} groups need IDs.`);
        const updates = needsFilling.map((group) => {
            return { doc: group.ref, fields: { id: group.id } };
        });
        (0, utils_1.log)(`Updating ${updates.length} groups.`);
        await (0, utils_1.writeAsync)(firestore, updates);
        (0, utils_1.log)(`Updated all groups.`);
    });
}
//# sourceMappingURL=backfill-group-ids.js.map