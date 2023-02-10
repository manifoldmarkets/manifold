"use strict";
// check every day if the user has created a bet since 4pm UTC, and if not, reset their streak
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetBettingStreaksForUsers = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const time_1 = require("../../common/util/time");
const economy_1 = require("../../common/economy");
const firestore = admin.firestore();
exports.resetBettingStreaksForUsers = functions
    .runWith({ timeoutSeconds: 540, memory: '4GB' })
    .pubsub.schedule(`0 ${economy_1.BETTING_STREAK_RESET_HOUR} * * *`)
    .timeZone('Etc/UTC')
    .onRun(async () => {
    await resetBettingStreaksInternal();
});
const resetBettingStreaksInternal = async () => {
    const usersSnap = await firestore
        .collection('users')
        .where('currentBettingStreak', '>', 0)
        .get();
    const users = usersSnap.docs.map((doc) => doc.data());
    const betStreakResetTime = Date.now() - time_1.DAY_MS;
    await Promise.all(users.map((user) => resetBettingStreakForUser(user, betStreakResetTime)));
};
const resetBettingStreakForUser = async (user, betStreakResetTime) => {
    var _a;
    // if they made a bet within the last day, don't reset their streak
    if (((_a = user === null || user === void 0 ? void 0 : user.lastBetTime) !== null && _a !== void 0 ? _a : 0) > betStreakResetTime ||
        !user.currentBettingStreak ||
        user.currentBettingStreak === 0)
        return;
    if (user.streakForgiveness > 0) {
        await firestore
            .collection('users')
            .doc(user.id)
            .update({
            streakForgiveness: user.streakForgiveness - 1,
        });
        // Should we send a notification to the user?
    }
    else {
        await firestore.collection('users').doc(user.id).update({
            currentBettingStreak: 0,
        });
    }
};
//# sourceMappingURL=reset-betting-streaks.js.map