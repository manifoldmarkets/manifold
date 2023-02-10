"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const lodash_1 = require("lodash");
const script_init_1 = require("./script-init");
(0, script_init_1.initAdmin)();
const calculate_dpm_1 = require("../../../common/calculate-dpm");
const antes_1 = require("../../../common/antes");
const fees_1 = require("../../../common/fees");
const object_1 = require("../../../common/util/object");
const firestore = admin.firestore();
async function recalculateContract(contractRef, isCommit = false) {
    await firestore.runTransaction(async (transaction) => {
        var _a, _b, _c;
        const contractDoc = await transaction.get(contractRef);
        const contract = contractDoc.data();
        if (!(contract === null || contract === void 0 ? void 0 : contract.slug)) {
            console.log('missing slug; id=', contractRef.id);
            return;
        }
        console.log('recalculating', contract.slug);
        if (contract.mechanism !== 'dpm-2' ||
            contract.outcomeType !== 'BINARY' ||
            contract.resolution) {
            console.log('invalid candidate to port to cfmm');
            return;
        }
        const betsRef = contractRef.collection('bets');
        const betDocs = await transaction.get(betsRef);
        const bets = (0, lodash_1.sortBy)(betDocs.docs.map((d) => d.data()), (b) => b.createdTime);
        const getSoldBetPayout = (bet) => {
            const soldBet = bets.find((b) => { var _a; return ((_a = bet.sale) === null || _a === void 0 ? void 0 : _a.betId) === b.id; });
            return soldBet
                ? -soldBet.amount / Math.sqrt(soldBet.probBefore * soldBet.probAfter)
                : 0;
        };
        for (const bet of bets) {
            const shares = bet.sale
                ? getSoldBetPayout(bet)
                : bet.isSold
                    ? bet.amount / Math.sqrt(bet.probBefore * bet.probAfter) // make up fake share qty
                    : (0, calculate_dpm_1.calculateDpmPayout)(contract, bet, (_a = contract.resolution) !== null && _a !== void 0 ? _a : bet.outcome);
            console.log('converting', bet.shares, bet.outcome, bet.isSold ? '(sold)' : '', 'shares to', shares);
            if (isCommit)
                transaction.update(betsRef.doc(bet.id), {
                    shares,
                    dpmShares: bet.shares,
                });
        }
        const prob = (_b = contract.resolutionProbability) !== null && _b !== void 0 ? _b : (0, calculate_dpm_1.getDpmProbability)(contract.totalShares);
        const ante = 100;
        const newPool = { YES: ante, NO: ante };
        console.log('creating liquidity pool at p=', prob, 'for Ṁ', ante);
        const contractUpdate = {
            pool: newPool,
            p: prob,
            mechanism: 'cpmm-1',
            totalLiquidity: ante,
            collectedFees: (0, object_1.addObjects)((_c = contract.collectedFees) !== null && _c !== void 0 ? _c : fees_1.noFees, fees_1.noFees),
        };
        const additionalInfo = {
            cfmmConversionTime: Date.now(),
            dpmPool: contract.pool,
        };
        const liquidityDocRef = contractRef.collection('liquidity').doc();
        const lp = (0, antes_1.getCpmmInitialLiquidity)('IPTOzEqrpkWmEzh6hwvAyY9PqFb2', // use @ManifoldMarkets' id
        Object.assign(Object.assign({}, contract), contractUpdate), liquidityDocRef.id, ante);
        if (isCommit) {
            transaction.update(contractRef, Object.assign(Object.assign({}, contractUpdate), additionalInfo));
            transaction.set(liquidityDocRef, lp);
            console.log('updated', contract.slug);
        }
    });
}
async function main() {
    const slug = process.argv[2];
    const isCommit = process.argv[3] === 'commit';
    const contractRefs = slug === 'all'
        ? await firestore.collection('contracts').listDocuments()
        : await firestore
            .collection('contracts')
            .where('slug', '==', slug)
            .get()
            .then((snap) => !snap.empty ? [firestore.doc(`contracts/${snap.docs[0].id}`)] : []);
    for (const contractRef of contractRefs) {
        await recalculateContract(contractRef, isCommit).catch((e) => console.log('error: ', e, 'id=', contractRef.id));
        console.log();
        console.log();
    }
}
if (require.main === module)
    main().then(() => process.exit());
//# sourceMappingURL=migrate-to-cfmm.js.map