"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const script_init_1 = require("./script-init");
(0, script_init_1.initAdmin)();
const utils_1 = require("../utils");
const firestore = admin.firestore();
async function renameUserContracts(username, newNames) {
    console.log(`Renaming contracts of ${username} to`, newNames);
    const contracts = await (0, utils_1.getValues)(firestore.collection('contracts').where('creatorUsername', '==', username));
    console.log('Loaded', contracts.length, 'contracts by', username);
    for (const contract of contracts) {
        const contractRef = firestore.doc(`contracts/${contract.id}`);
        console.log('Renaming', contract.slug);
        await contractRef.update({
            creatorUsername: newNames.username,
            creatorName: newNames.name,
        });
    }
}
if (require.main === module)
    renameUserContracts('ManticMarkets', {
        username: 'ManifoldMarkets',
        name: 'Manifold Markets',
    }).then(() => process.exit());
//# sourceMappingURL=rename-user-contracts.js.map