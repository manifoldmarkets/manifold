"use strict";
// Filling in historical bet positions on comments.
Object.defineProperty(exports, "__esModule", { value: true });
// Warning: This just recalculates all of them, rather than trying to
// figure out which ones are out of date, since I'm using it to fill them
// in once in the first place.
const lodash_1 = require("lodash");
const admin = require("firebase-admin");
const array_1 = require("../../../common/util/array");
const calculate_1 = require("../../../common/calculate");
const script_init_1 = require("./script-init");
const utils_1 = require("../utils");
(0, script_init_1.initAdmin)();
const firestore = admin.firestore();
async function getContractsById() {
    const contracts = await firestore.collection('contracts').get();
    const results = Object.fromEntries(contracts.docs.map((doc) => [doc.id, doc.data()]));
    (0, utils_1.log)(`Found ${contracts.size} contracts.`);
    return results;
}
async function getCommentsByContractId() {
    const comments = await firestore
        .collectionGroup('comments')
        .where('contractId', '!=', null)
        .get();
    const results = new Map();
    comments.forEach((doc) => {
        const contractId = doc.get('contractId');
        const contractComments = results.get(contractId) || [];
        contractComments.push(doc);
        results.set(contractId, contractComments);
    });
    (0, utils_1.log)(`Found ${comments.size} comments on ${results.size} contracts.`);
    return results;
}
// not in a transaction for speed -- may need to be run more than once
async function denormalize() {
    const contractsById = await getContractsById();
    const commentsByContractId = await getCommentsByContractId();
    for (const [contractId, comments] of commentsByContractId.entries()) {
        const betsQuery = await firestore
            .collection('contracts')
            .doc(contractId)
            .collection('bets')
            .get();
        (0, utils_1.log)(`Loaded ${betsQuery.size} bets for contract ${contractId}.`);
        const bets = betsQuery.docs.map((d) => d.data());
        const updates = comments.map((doc) => {
            var _a;
            const comment = doc.data();
            const contract = contractsById[contractId];
            const previousBets = bets.filter((b) => b.createdTime < comment.createdTime);
            const position = (0, calculate_1.getLargestPosition)(contract, previousBets.filter((b) => b.userId === comment.userId && !b.isAnte));
            if (position) {
                const fields = {
                    commenterPositionShares: position.shares,
                    commenterPositionOutcome: position.outcome,
                };
                const previousProb = contract.outcomeType === 'BINARY'
                    ? (_a = (0, lodash_1.maxBy)(previousBets, (bet) => bet.createdTime)) === null || _a === void 0 ? void 0 : _a.probAfter
                    : undefined;
                if (previousProb != null) {
                    fields.commenterPositionProb = previousProb;
                }
                return { doc: doc.ref, fields };
            }
            else {
                return undefined;
            }
        });
        (0, utils_1.log)(`Updating ${updates.length} comments.`);
        await (0, utils_1.writeAsync)(firestore, (0, array_1.filterDefined)(updates));
    }
}
if (require.main === module) {
    denormalize().catch((e) => console.error(e));
}
//# sourceMappingURL=backfill-comment-position-data.js.map