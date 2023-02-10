"use strict";
// Filling in the contract-based fields on comments.
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const script_init_1 = require("./script-init");
const denormalize_1 = require("./denormalize");
(0, script_init_1.initAdmin)();
const firestore = admin.firestore();
async function getContractsById(transaction) {
    const contracts = await transaction.get(firestore.collection('contracts'));
    const results = Object.fromEntries(contracts.docs.map((doc) => [doc.id, doc]));
    console.log(`Found ${contracts.size} contracts.`);
    return results;
}
async function getCommentsByContractId(transaction) {
    const comments = await transaction.get(firestore.collectionGroup('comments').where('contractId', '!=', null));
    const results = new Map();
    comments.forEach((doc) => {
        const contractId = doc.get('contractId');
        const contractComments = results.get(contractId) || [];
        contractComments.push(doc);
        results.set(contractId, contractComments);
    });
    console.log(`Found ${comments.size} comments on ${results.size} contracts.`);
    return results;
}
async function denormalize() {
    let hasMore = true;
    while (hasMore) {
        hasMore = await admin.firestore().runTransaction(async (transaction) => {
            const [contractsById, commentsByContractId] = await Promise.all([
                getContractsById(transaction),
                getCommentsByContractId(transaction),
            ]);
            const mapping = Object.entries(contractsById).map(([id, doc]) => {
                return [doc, commentsByContractId.get(id) || []];
            });
            const diffs = (0, denormalize_1.findDiffs)(mapping, ['slug', 'contractSlug'], ['question', 'contractQuestion']);
            console.log(`Found ${diffs.length} comments with mismatched data.`);
            diffs.slice(0, 500).forEach((d) => {
                console.log((0, denormalize_1.describeDiff)(d));
                (0, denormalize_1.applyDiff)(transaction, d);
            });
            if (diffs.length > 500) {
                console.log(`Applying first 500 because of Firestore limit...`);
            }
            return diffs.length > 500;
        });
    }
}
if (require.main === module) {
    denormalize().catch((e) => console.error(e));
}
//# sourceMappingURL=denormalize-comment-contract-data.js.map