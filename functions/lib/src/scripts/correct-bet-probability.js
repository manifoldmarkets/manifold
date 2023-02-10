"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const lodash_1 = require("lodash");
const script_init_1 = require("./script-init");
(0, script_init_1.initAdmin)();
const calculate_dpm_1 = require("../../../common/calculate-dpm");
const firestore = admin.firestore();
async function migrateContract(contractRef, contract) {
    const bets = await contractRef
        .collection('bets')
        .get()
        .then((snap) => snap.docs.map((bet) => bet.data()));
    const lastBet = (0, lodash_1.sortBy)(bets, (bet) => -bet.createdTime)[0];
    if (lastBet) {
        const probAfter = (0, calculate_dpm_1.getDpmProbability)(contract.totalShares);
        await firestore
            .doc(`contracts/${contract.id}/bets/${lastBet.id}`)
            .update({ probAfter });
        console.log('updating last bet from', lastBet.probAfter, 'to', probAfter);
    }
}
async function migrateContracts() {
    const snapshot = await firestore.collection('contracts').get();
    const contracts = snapshot.docs.map((doc) => doc.data());
    console.log('Loaded contracts', contracts.length);
    for (const contract of contracts) {
        const contractRef = firestore.doc(`contracts/${contract.id}`);
        console.log('contract', contract.question);
        await migrateContract(contractRef, contract);
    }
}
if (require.main === module)
    migrateContracts().then(() => process.exit());
//# sourceMappingURL=correct-bet-probability.js.map