"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const script_init_1 = require("./script-init");
(0, script_init_1.initAdmin)();
const utils_1 = require("functions/src/utils");
const firestore = admin.firestore();
async function refundCommentBounties() {
    const snapshot = await firestore
        .collection('contracts')
        .where('openCommentBounties', '>=', 0)
        .get();
    const contracts = snapshot.docs.map((doc) => doc.data());
    console.log('Loaded', contracts.length, 'contracts');
    await Promise.all(contracts.map(async (contract) => {
        const contractRef = firestore.doc(`contracts/${contract.id}`);
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const bounty = contract.openCommentBounties;
        if (bounty > 0)
            await (0, utils_1.payUser)(contract.creatorId, bounty, true);
        console.log('Updating', contract.slug + ' with ' + bounty + ' open bounties');
        await contractRef.update({
            openCommentBounties: admin.firestore.FieldValue.delete(),
        });
    }));
}
if (require.main === module) {
    refundCommentBounties().catch((e) => console.error(e));
}
//# sourceMappingURL=refund-bounties.js.map