"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onView = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const firestore = admin.firestore();
exports.onView = functions.firestore
    .document('private-users/{userId}/views/{viewId}')
    .onCreate(async (snapshot, context) => {
    const { userId } = context.params;
    const { contractId, timestamp } = snapshot.data();
    await firestore
        .doc(`private-users/${userId}/cache/viewCounts`)
        .set({ [contractId]: admin.firestore.FieldValue.increment(1) }, { merge: true });
    await firestore
        .doc(`private-users/${userId}/cache/lastViewTime`)
        .set({ [contractId]: timestamp }, { merge: true });
});
//# sourceMappingURL=on-view.js.map