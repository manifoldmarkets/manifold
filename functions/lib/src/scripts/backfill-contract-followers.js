"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const script_init_1 = require("./script-init");
(0, script_init_1.initAdmin)();
const utils_1 = require("../utils");
const lodash_1 = require("lodash");
const antes_1 = require("common/antes");
const firestore = admin.firestore();
async function backfillContractFollowers() {
    console.log('Backfilling contract followers');
    const contracts = await (0, utils_1.getValues)(firestore.collection('contracts').where('isResolved', '==', false));
    let count = 0;
    for (const contract of contracts) {
        const comments = await (0, utils_1.getValues)(firestore.collection('contracts').doc(contract.id).collection('comments'));
        const commenterIds = (0, lodash_1.uniq)(comments.map((comment) => comment.userId));
        const betsSnap = await firestore
            .collection(`contracts/${contract.id}/bets`)
            .get();
        const bets = betsSnap.docs.map((doc) => doc.data());
        // filter bets for only users that have an amount invested still
        const bettorIds = (0, lodash_1.uniq)(bets.map((bet) => bet.userId));
        const liquidityProviders = await firestore
            .collection(`contracts/${contract.id}/liquidity`)
            .get();
        const liquidityProvidersIds = (0, lodash_1.uniq)(liquidityProviders.docs.map((doc) => doc.data().userId)
        // exclude free market liquidity provider
        ).filter((id) => id !== antes_1.HOUSE_LIQUIDITY_PROVIDER_ID ||
            id !== antes_1.DEV_HOUSE_LIQUIDITY_PROVIDER_ID);
        const followerIds = (0, lodash_1.uniq)([
            ...commenterIds,
            ...bettorIds,
            ...liquidityProvidersIds,
            contract.creatorId,
        ]);
        for (const followerId of followerIds) {
            await firestore
                .collection(`contracts/${contract.id}/follows`)
                .doc(followerId)
                .set({ id: followerId, createdTime: Date.now() });
        }
        // Perhaps handled by the trigger?
        // const followerCount = followerIds.length
        // await firestore
        //   .collection(`contracts`)
        //   .doc(contract.id)
        //   .update({ followerCount: followerCount })
        count += 1;
        if (count % 100 === 0) {
            console.log(`${count} contracts processed`);
        }
    }
}
if (require.main === module) {
    backfillContractFollowers()
        .then(() => process.exit())
        .catch(console.log);
}
//# sourceMappingURL=backfill-contract-followers.js.map