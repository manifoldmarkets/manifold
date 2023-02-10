"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const script_init_1 = require("./script-init");
(0, script_init_1.initAdmin)();
const firestore = admin.firestore();
async function makeContractsPublic() {
    console.log('Updating contracts to be public');
    const snapshot = await firestore.collection('contracts').get();
    const contracts = snapshot.docs.map((doc) => doc.data());
    console.log('Loaded', contracts.length, 'contracts');
    for (const contract of contracts) {
        const contractRef = firestore.doc(`contracts/${contract.id}`);
        console.log('Updating', contract.question);
        await contractRef.update({ visibility: 'public' });
    }
}
if (require.main === module)
    makeContractsPublic().then(() => process.exit());
//# sourceMappingURL=make-contracts-public.js.map