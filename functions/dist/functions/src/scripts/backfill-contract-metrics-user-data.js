"use strict";
// for each user, get all contract metrics
// fill in the user data
Object.defineProperty(exports, "__esModule", { value: true });
const script_init_1 = require("functions/src/scripts/script-init");
const admin = require("firebase-admin");
(0, script_init_1.initAdmin)();
const firestore = admin.firestore();
const getContractMetrics = async (userId) => {
    const contractMetrics = await firestore
        .collection(`users/${userId}/contract-metrics`)
        .get();
    return contractMetrics.docs.map((cm) => cm.data());
};
const updateContractMetricsForAllUsers = async () => {
    // get all users
    const users = await firestore.collection('users').get();
    const total = users.size;
    console.log(`Loaded ${total} users.`);
    // for each user, get all contract metrics
    let count = 0;
    return await Promise.all(users.docs.map(async (u) => {
        const user = u.data();
        const contractMetrics = await getContractMetrics(u.id);
        // filter out contract metrics that have already user data
        const contractMetricsWithoutUserData = contractMetrics.filter((cm) => !cm.userAvatarUrl);
        // fill in the user data
        await Promise.all(contractMetricsWithoutUserData.map(async (cm) => {
            await firestore
                .doc(`users/${u.id}/contract-metrics/${cm.contractId}`)
                .set(Object.assign(Object.assign({}, cm), { userId: user.id, userUsername: user.username, userName: user.name, userAvatarUrl: user.avatarUrl }));
        }));
        count++;
        console.log(`Updated ${count}/${total} users.`);
    }));
};
if (require.main === module) {
    updateContractMetricsForAllUsers()
        .then(() => {
        console.log('Done.');
        process.exit();
    })
        .catch((e) => {
        console.error(e);
        process.exit();
    });
}
//# sourceMappingURL=backfill-contract-metrics-user-data.js.map