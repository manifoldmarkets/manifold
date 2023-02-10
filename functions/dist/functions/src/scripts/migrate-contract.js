"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const lodash_1 = require("lodash");
const script_init_1 = require("./script-init");
(0, script_init_1.initAdmin)();
const firestore = admin.firestore();
async function migrateBet(contractRef, bet) {
    const { dpmWeight, amount, id } = bet;
    const shares = dpmWeight + amount;
    await contractRef.collection('bets').doc(id).update({ shares });
}
async function migrateContract(contractRef) {
    const bets = await contractRef
        .collection('bets')
        .get()
        .then((snap) => snap.docs.map((bet) => bet.data()));
    const totalShares = {
        YES: (0, lodash_1.sumBy)(bets, (bet) => (bet.outcome === 'YES' ? bet.shares : 0)),
        NO: (0, lodash_1.sumBy)(bets, (bet) => (bet.outcome === 'NO' ? bet.shares : 0)),
    };
    await contractRef.update({ totalShares });
}
async function migrateContracts() {
    console.log('Migrating contracts');
    const snapshot = await firestore.collection('contracts').get();
    const contracts = snapshot.docs.map((doc) => doc.data());
    console.log('Loaded contracts', contracts.length);
    for (const contract of contracts) {
        const contractRef = firestore.doc(`contracts/${contract.id}`);
        const betsSnapshot = await contractRef.collection('bets').get();
        const bets = betsSnapshot.docs.map((bet) => bet.data());
        console.log('contract', contract.question, 'bets', bets.length);
        for (const bet of bets)
            await migrateBet(contractRef, bet);
        await migrateContract(contractRef);
    }
}
if (require.main === module)
    migrateContracts().then(() => process.exit());
//# sourceMappingURL=migrate-contract.js.map