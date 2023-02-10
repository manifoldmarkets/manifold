"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const script_init_1 = require("./script-init");
(0, script_init_1.initAdmin)();
const utils_1 = require("../utils");
async function removeAnswerAnte() {
    const firestore = admin.firestore();
    console.log('Removing isAnte from bets on answers');
    const contracts = await (0, utils_1.getValues)(firestore
        .collection('contracts')
        .where('outcomeType', '==', 'FREE_RESPONSE'));
    console.log('Loaded', contracts, 'contracts');
    for (const contract of contracts) {
        const betsSnapshot = await firestore
            .collection('contracts')
            .doc(contract.id)
            .collection('bets')
            .get();
        console.log('updating', contract.question);
        for (const doc of betsSnapshot.docs) {
            const bet = doc.data();
            if (bet.isAnte && bet.outcome !== '0') {
                console.log('updating', bet.outcome);
                await doc.ref.update('isAnte', false);
            }
        }
    }
}
if (require.main === module) {
    removeAnswerAnte().then(() => process.exit());
}
//# sourceMappingURL=remove-answer-ante.js.map