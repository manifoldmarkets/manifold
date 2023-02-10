"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const lodash_1 = require("lodash");
const script_init_1 = require("./script-init");
(0, script_init_1.initAdmin)();
const firestore = admin.firestore();
async function recalculateContract(contractRef, contract) {
    const bets = await contractRef
        .collection('bets')
        .get()
        .then((snap) => snap.docs.map((bet) => bet.data()));
    const openBets = bets.filter((b) => !b.isSold && !b.sale);
    const totalShares = {
        YES: (0, lodash_1.sumBy)(openBets, (bet) => (bet.outcome === 'YES' ? bet.shares : 0)),
        NO: (0, lodash_1.sumBy)(openBets, (bet) => (bet.outcome === 'NO' ? bet.shares : 0)),
    };
    const totalBets = {
        YES: (0, lodash_1.sumBy)(openBets, (bet) => (bet.outcome === 'YES' ? bet.amount : 0)),
        NO: (0, lodash_1.sumBy)(openBets, (bet) => (bet.outcome === 'NO' ? bet.amount : 0)),
    };
    await contractRef.update({ totalShares, totalBets });
    console.log('calculating totals for "', contract.question, '" total bets:', totalBets);
    console.log();
}
async function recalculateContractTotals() {
    console.log('Recalculating contract info');
    const snapshot = await firestore.collection('contracts').get();
    const contracts = snapshot.docs.map((doc) => doc.data());
    console.log('Loaded', contracts.length, 'contracts');
    for (const contract of contracts) {
        const contractRef = firestore.doc(`contracts/${contract.id}`);
        await recalculateContract(contractRef, contract);
    }
}
if (require.main === module)
    recalculateContractTotals().then(() => process.exit());
//# sourceMappingURL=recalculate-contract-totals.js.map