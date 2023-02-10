"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const script_init_1 = require("./script-init");
(0, script_init_1.initAdmin)();
const firestore = admin.firestore();
if (require.main === module) {
    const contractsRef = firestore.collection('contracts');
    contractsRef.get().then(async (contractsSnaps) => {
        console.log(`Loaded ${contractsSnaps.size} contracts.`);
        const needsFilling = contractsSnaps.docs.filter((ct) => {
            return !('subsidyPool' in ct.data());
        });
        console.log(`Found ${needsFilling.length} contracts to update.`);
        await Promise.all(needsFilling.map((ct) => ct.ref.update({ subsidyPool: 0 })));
        console.log(`Updated all contracts.`);
    });
}
//# sourceMappingURL=backfill-subsidy-pool.js.map