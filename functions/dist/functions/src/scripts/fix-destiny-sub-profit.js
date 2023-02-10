"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const script_init_1 = require("./script-init");
(0, script_init_1.initAdmin)();
const admin = require("firebase-admin");
const format_1 = require("common/util/format");
const firestore = admin.firestore();
// Deduct M1000 from totalDeposits from users with destiny sub purchases before: 1671304324034
async function fixDestinySubProfit() {
    const snap = await firestore
        .collection('destiny-subs')
        .where('createdTime', '<', 1671304324034)
        .get();
    const subs = snap.docs.map((doc) => doc.data());
    for (const sub of subs) {
        console.log('converting', sub.username, (0, format_1.formatMoney)(sub.cost), new Date(sub.createdTime).toISOString());
        await firestore
            .collection('users')
            .doc(sub.userId)
            .update({
            totalDeposits: admin.firestore.FieldValue.increment(-sub.cost),
        });
    }
}
if (require.main === module)
    fixDestinySubProfit().then(() => process.exit());
//# sourceMappingURL=fix-destiny-sub-profit.js.map