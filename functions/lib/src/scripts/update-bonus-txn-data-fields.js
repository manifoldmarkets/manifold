"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const script_init_1 = require("./script-init");
const utils_1 = require("functions/src/utils");
(0, script_init_1.initAdmin)();
const firestore = admin.firestore();
async function main() {
    // get all txns
    const bonusTxns = await (0, utils_1.getValues)(firestore
        .collection('txns')
        .where('category', 'in', ['UNIQUE_BETTOR_BONUS', 'BETTING_STREAK_BONUS']));
    // JSON parse description field and add to data field
    const updatedTxns = bonusTxns.map((txn) => {
        txn.data = txn.description && JSON.parse(txn.description);
        return txn;
    });
    console.log('updatedTxns', updatedTxns[0]);
    // update txns
    await Promise.all(updatedTxns.map((txn) => {
        return firestore.collection('txns').doc(txn.id).update({
            data: txn.data,
        });
    }));
}
if (require.main === module)
    main().then(() => process.exit());
//# sourceMappingURL=update-bonus-txn-data-fields.js.map