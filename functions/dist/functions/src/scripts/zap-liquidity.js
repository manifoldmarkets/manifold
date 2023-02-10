"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const calculate_1 = require("common/calculate");
const format_1 = require("common/util/format");
const admin = require("firebase-admin");
const script_init_1 = require("./script-init");
(0, script_init_1.initAdmin)();
const firestore = admin.firestore();
async function main() {
    if (process.argv.length !== 4) {
        console.log('usage: [liquidity amount] [contract slug]');
        return;
    }
    const newPoolAmount = Number(process.argv[2]);
    if (!isFinite(newPoolAmount) || newPoolAmount <= 0)
        throw new Error('invalid pool amount');
    const pool = { YES: newPoolAmount, NO: newPoolAmount };
    const slug = process.argv[3];
    if (!slug)
        throw new Error('missing slug');
    await firestore.runTransaction(async (trans) => {
        const snap = await trans.get(firestore.collection('contracts').where('slug', '==', slug));
        const doc = snap.docs[0];
        const contract = doc.data();
        const p = (0, calculate_1.getProbability)(contract);
        const totalLiquidity = newPoolAmount + contract.subsidyPool;
        trans.update(doc.ref, { p, pool, totalLiquidity });
    });
    console.log(slug, 'liquidity changed to ', (0, format_1.formatMoney)(newPoolAmount));
}
if (require.main === module)
    main().then(() => process.exit());
//# sourceMappingURL=zap-liquidity.js.map