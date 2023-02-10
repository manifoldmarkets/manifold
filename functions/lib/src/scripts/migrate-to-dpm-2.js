"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const lodash_1 = require("lodash");
const script_init_1 = require("./script-init");
(0, script_init_1.initAdmin)();
const calculate_dpm_1 = require("../../../common/calculate-dpm");
const sell_bet_1 = require("../../../common/sell-bet");
const firestore = admin.firestore();
async function recalculateContract(contractRef, contract, isCommit = false) {
    const startPool = contract.startPool;
    if (!startPool)
        return;
    console.log('recalculating', contract.slug);
    await firestore.runTransaction(async (transaction) => {
        const contractDoc = await transaction.get(contractRef);
        const contract = contractDoc.data();
        const betDocs = await transaction.get(contractRef.collection('bets'));
        const bets = (0, lodash_1.sortBy)(betDocs.docs.map((d) => d.data()), (b) => b.createdTime);
        const phantomAnte = startPool.YES + startPool.NO;
        const leftovers = (0, lodash_1.sumBy)(bets, (b) => b.amount) -
            (0, lodash_1.sumBy)(bets, (b) => {
                if (!b.sale)
                    return b.amount;
                const soldBet = bets.find((bet) => { var _a; return bet.id === ((_a = b.sale) === null || _a === void 0 ? void 0 : _a.betId); });
                return (soldBet === null || soldBet === void 0 ? void 0 : soldBet.amount) || 0;
            });
        const poolTotal = contract.pool.YES + contract.pool.NO;
        const prevTotalBets = contract.totalBets.YES + contract.totalBets.NO;
        const calculatedrealAnte = poolTotal - prevTotalBets - leftovers;
        const realAnte = Math.max(0, contract.realAnte || calculatedrealAnte);
        if (!contract.realAnte)
            transaction.update(contractRef, {
                realAnte,
            });
        console.log('pool', poolTotal, 'phantomAnte', phantomAnte, 'realAnte', realAnte, 'calculatedRealAnte', calculatedrealAnte, 'leftovers', leftovers);
        let p = startPool.YES ** 2 / (startPool.YES ** 2 + startPool.NO ** 2);
        const phantomShares = {
            YES: Math.sqrt(p) * phantomAnte,
            NO: Math.sqrt(1 - p) * phantomAnte,
        };
        let totalShares = {
            YES: Math.sqrt(p) * (phantomAnte + realAnte),
            NO: Math.sqrt(1 - p) * (phantomAnte + realAnte),
        };
        let pool = { YES: p * realAnte, NO: (1 - p) * realAnte };
        let totalBets = { YES: p * realAnte, NO: (1 - p) * realAnte };
        const betsRef = contractRef.collection('bets');
        console.log('start', { pool, totalBets, totalShares });
        for (const bet of bets) {
            if (bet.sale) {
                const soldBet = bets.find((b) => { var _a; return b.id === ((_a = bet.sale) === null || _a === void 0 ? void 0 : _a.betId); });
                if (!soldBet)
                    throw new Error('invalid sold bet' + bet.sale.betId);
                const fakeContract = Object.assign(Object.assign({}, contract), { totalBets,
                    totalShares,
                    pool,
                    phantomShares });
                const { newBet, newPool, newTotalShares, newTotalBets } = (0, sell_bet_1.getSellBetInfo)(soldBet, fakeContract);
                const betDoc = betsRef.doc(bet.id);
                const userId = soldBet.userId;
                newBet.createdTime = bet.createdTime;
                console.log('sale bet', newBet);
                if (isCommit)
                    transaction.update(betDoc, Object.assign({ id: bet.id, userId }, newBet));
                pool = newPool;
                totalShares = newTotalShares;
                totalBets = newTotalBets;
                continue;
            }
            const shares = (0, calculate_dpm_1.calculateDpmShares)(totalShares, bet.amount, bet.outcome);
            const probBefore = p;
            const ind = bet.outcome === 'YES' ? 1 : 0;
            totalShares = {
                YES: totalShares.YES + ind * shares,
                NO: totalShares.NO + (1 - ind) * shares,
            };
            pool = {
                YES: pool.YES + ind * bet.amount,
                NO: pool.NO + (1 - ind) * bet.amount,
            };
            totalBets = {
                YES: totalBets.YES + ind * bet.amount,
                NO: totalBets.NO + (1 - ind) * bet.amount,
            };
            p = (0, calculate_dpm_1.getDpmProbability)(totalShares);
            const probAfter = p;
            const betUpdate = {
                shares,
                probBefore,
                probAfter,
            };
            console.log('bet', betUpdate);
            console.log('update', { pool, totalBets, totalShares });
            if (isCommit)
                transaction.update(betsRef.doc(bet.id), betUpdate);
        }
        const contractUpdate = {
            pool,
            totalBets,
            totalShares,
            phantomShares,
        };
        console.log('final', contractUpdate);
        if (isCommit)
            transaction.update(contractRef, contractUpdate);
    });
    console.log('updated', contract.slug);
    console.log();
    console.log();
}
async function main() {
    var _a;
    const slug = process.argv[2];
    const isCommit = process.argv[3] === 'commit';
    const snap = await firestore
        .collection('contracts')
        .where('slug', '==', slug)
        .get();
    const contract = (_a = snap.docs[0]) === null || _a === void 0 ? void 0 : _a.data();
    if (!contract) {
        console.log('No contract found for', slug);
        return;
    }
    const contractRef = firestore.doc(`contracts/${contract.id}`);
    await recalculateContract(contractRef, contract, isCommit);
}
if (require.main === module)
    main().then(() => process.exit());
//# sourceMappingURL=migrate-to-dpm-2.js.map