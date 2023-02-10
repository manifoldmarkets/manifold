"use strict";
// We used to allow bets to leave off the bet type flags, but that makes it hard to
// query on them in Firestore, so let's fill them in.
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const script_init_1 = require("./script-init");
const utils_1 = require("../utils");
(0, script_init_1.initAdmin)();
const firestore = admin.firestore();
async function updateAllBets() {
    const writer = firestore.bulkWriter({ throttling: false });
    const flags = ['isAnte', 'isRedemption', 'isChallenge'];
    let updated = 0;
    const bets = firestore.collectionGroup('bets');
    await (0, utils_1.processPartitioned)(bets, 100, async (docs) => {
        for (const doc of docs) {
            let needsUpdate = false;
            const update = {};
            for (const flag of flags) {
                const currVal = doc.get(flag);
                if (currVal == null) {
                    needsUpdate = true;
                    update[flag] = false;
                }
            }
            if (needsUpdate) {
                updated++;
                writer.update(doc.ref, update);
            }
        }
    });
    (0, utils_1.log)('Committing writes...');
    await writer.close();
    return updated;
}
if (require.main === module) {
    updateAllBets().then((n) => (0, utils_1.log)(`Updated ${n} bets.`));
}
//# sourceMappingURL=backfill-bet-flags.js.map