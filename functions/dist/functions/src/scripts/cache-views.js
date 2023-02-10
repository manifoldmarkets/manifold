"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const script_init_1 = require("./script-init");
(0, script_init_1.initAdmin)();
const utils_1 = require("../utils");
const promise_1 = require("../../../common/util/promise");
const firestore = admin.firestore();
async function cacheViews() {
    console.log('Caching views');
    const users = await (0, utils_1.getValues)(firestore.collection('users'));
    await (0, promise_1.batchedWaitAll)(users.map((user) => () => {
        console.log('Caching views for', user.username);
        return cacheUserViews(user.id);
    }));
}
async function cacheUserViews(userId) {
    var _a, _b;
    const views = await (0, utils_1.getValues)(firestore.collection('private-users').doc(userId).collection('views'));
    const viewCounts = {};
    for (const view of views) {
        viewCounts[view.contractId] = ((_a = viewCounts[view.contractId]) !== null && _a !== void 0 ? _a : 0) + 1;
    }
    const lastViewTime = {};
    for (const view of views) {
        lastViewTime[view.contractId] = Math.max((_b = lastViewTime[view.contractId]) !== null && _b !== void 0 ? _b : 0, view.timestamp);
    }
    await firestore
        .doc(`private-users/${userId}/cache/viewCounts`)
        .set(viewCounts, { merge: true });
    await firestore
        .doc(`private-users/${userId}/cache/lastViewTime`)
        .set(lastViewTime, { merge: true });
    console.log(viewCounts, lastViewTime);
}
// async function deleteCache() {
//   console.log('Deleting view cache')
//   const users = await getValues<User>(firestore.collection('users'))
//   await batchedWaitAll(
//     users.map((user) => async () => {
//       console.log('Deleting view cache for', user.username)
//       await firestore.doc(`private-users/${user.id}/cache/viewCounts`).delete()
//       await firestore
//         .doc(`private-users/${user.id}/cache/lastViewTime`)
//         .delete()
//       await firestore
//         .doc(`private-users/${user.id}/cache/contractScores`)
//         .delete()
//       await firestore.doc(`private-users/${user.id}/cache/wordScores`).delete()
//     })
//   )
// }
if (require.main === module) {
    cacheViews().then(() => process.exit());
}
//# sourceMappingURL=cache-views.js.map