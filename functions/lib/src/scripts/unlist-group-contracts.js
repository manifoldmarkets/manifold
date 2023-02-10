"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const script_init_1 = require("./script-init");
(0, script_init_1.initAdmin)();
const firestore = admin.firestore();
async function unlistContractsInGroup() {
    console.log('Updating some contracts to be unlisted');
    const snapshot = await firestore
        .collection('contracts')
        .where('groupSlugs', 'array-contains', 'fantasy-football-stock-exchange')
        .get();
    const contracts = snapshot.docs.map((doc) => doc.data());
    console.log('Loaded', contracts.length, 'contracts');
    for (const contract of contracts) {
        const contractRef = firestore.doc(`contracts/${contract.id}`);
        console.log('Updating', contract.question);
        await contractRef.update({ visibility: 'unlisted' });
    }
}
if (require.main === module)
    unlistContractsInGroup().then(() => process.exit());
//# sourceMappingURL=unlist-group-contracts.js.map