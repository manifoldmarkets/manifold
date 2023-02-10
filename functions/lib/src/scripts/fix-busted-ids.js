"use strict";
// Fixing incorrect IDs in the document data, e.g. in the `bets` collection group.
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const script_init_1 = require("./script-init");
const utils_1 = require("../utils");
(0, script_init_1.initAdmin)();
const firestore = admin.firestore();
async function processGroup(group) {
    const writer = firestore.bulkWriter();
    await (0, utils_1.processPartitioned)(group, 100, async (docs) => {
        const mismatchedIds = docs.filter((d) => d.id !== d.get('id'));
        if (mismatchedIds.length > 0) {
            (0, utils_1.log)(`Found ${mismatchedIds.length} docs with mismatched IDs.`);
            for (const doc of mismatchedIds) {
                writer.update(doc.ref, { id: doc.id });
            }
        }
    });
    await writer.close();
}
if (require.main === module) {
    processGroup(firestore.collectionGroup('bets'));
}
//# sourceMappingURL=fix-busted-ids.js.map