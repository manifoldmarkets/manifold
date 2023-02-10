"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const lodash_1 = require("lodash");
const script_init_1 = require("./script-init");
(0, script_init_1.initAdmin)();
const payouts_1 = require("../../../common/payouts");
const array_1 = require("../../../common/util/array");
const firestore = admin.firestore();
async function checkIfPayOutAgain(contractRef, contract) {
    const bets = await contractRef
        .collection('bets')
        .get()
        .then((snap) => snap.docs.map((bet) => bet.data()));
    const openBets = bets.filter((b) => !b.isSold && !b.sale);
    const loanedBets = openBets.filter((bet) => bet.loanAmount);
    if (loanedBets.length && contract.resolution) {
        const { resolution, resolutions, resolutionProbability } = contract;
        const { payouts } = (0, payouts_1.getPayouts)(resolution, contract, openBets, [], resolutions, resolutionProbability);
        const loanPayouts = (0, payouts_1.getLoanPayouts)(openBets);
        const groups = (0, lodash_1.groupBy)([...payouts, ...loanPayouts], (payout) => payout.userId);
        const userPayouts = (0, lodash_1.mapValues)(groups, (group) => (0, lodash_1.sumBy)(group, (g) => g.payout));
        const entries = Object.entries(userPayouts);
        const firstNegative = entries.findIndex(([_, payout]) => payout < 0);
        const toBePaidOut = firstNegative === -1 ? [] : entries.slice(firstNegative);
        if (toBePaidOut.length) {
            console.log('to be paid out', toBePaidOut.length, 'already paid out', entries.length - toBePaidOut.length);
            const positivePayouts = toBePaidOut.filter(([_, payout]) => payout > 0);
            if (positivePayouts.length)
                return { contract, toBePaidOut: positivePayouts };
        }
    }
    return undefined;
}
async function payOutContractAgain() {
    console.log('Recalculating contract info');
    const snapshot = await firestore.collection('contracts').get();
    const [startTime, endTime] = [
        new Date('2022-03-02'),
        new Date('2022-03-07'),
    ].map((date) => date.getTime());
    const contracts = snapshot.docs
        .map((doc) => doc.data())
        .filter((contract) => {
        const { resolutionTime } = contract;
        return (resolutionTime && resolutionTime > startTime && resolutionTime < endTime);
    });
    console.log('Loaded', contracts.length, 'contracts');
    const toPayOutAgain = (0, array_1.filterDefined)(await Promise.all(contracts.map(async (contract) => {
        const contractRef = firestore.doc(`contracts/${contract.id}`);
        return await checkIfPayOutAgain(contractRef, contract);
    })));
    const flattened = (0, lodash_1.flatten)(toPayOutAgain.map((d) => d.toBePaidOut));
    for (const [userId, payout] of flattened) {
        console.log('Paying out', userId, payout);
        // await payUser(userId, payout)
    }
}
if (require.main === module)
    payOutContractAgain().then(() => process.exit());
//# sourceMappingURL=pay-out-contract-again.js.map