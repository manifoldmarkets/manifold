"use strict";
// check every day if the user has created a bet since 4pm UTC, and if not, reset their streak
Object.defineProperty(exports, "__esModule", { value: true });
exports.incrementStreakForgiveness = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const firestore = admin.firestore();
exports.incrementStreakForgiveness = functions
    .runWith({ timeoutSeconds: 540, memory: '4GB' })
    // On every 1st day of the month at 12am PST
    .pubsub.schedule(`0 0 1 * *`)
    .onRun(async () => {
    await incrementStreakForgivenessInternal();
});
const incrementStreakForgivenessInternal = async () => {
    const usersSnap = await firestore.collection('users').get();
    const users = usersSnap.docs.map((doc) => doc.data());
    await Promise.all(users.map((user) => {
        var _a;
        return firestore
            .collection('users')
            .doc(user.id)
            .update({
            streakForgiveness: ((_a = user.streakForgiveness) !== null && _a !== void 0 ? _a : 0) + 1,
        });
    }));
};
//# sourceMappingURL=increment-streak-forgiveness.js.map