"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const script_init_1 = require("./script-init");
const utils_1 = require("../utils");
const badge_1 = require("common/badge");
(0, script_init_1.initAdmin)();
const firestore = admin.firestore();
async function main() {
    const users = await (0, utils_1.getAllUsers)();
    // const users = filterDefined([await getUser('6hHpzvRG0pMq8PNJs7RZj2qlZGn2')]) // dev ian
    // const users = filterDefined([await getUser('uglwf3YKOZNGjjEXKc5HampOFRE2')]) // prod David
    // const users = filterDefined([await getUser('AJwLWoo3xue32XIiAVrL5SyR1WB2')]) // prod ian
    await Promise.all(users.map(async (user) => {
        if (!user.id)
            return;
        // Only backfill users without achievements
        if (user.achievements === undefined) {
            await firestore.collection('users').doc(user.id).update({
                achievements: {},
            });
            user.achievements = {};
            user.achievements = await awardMarketCreatorBadges(user);
            user.achievements = await awardBettingStreakBadges(user);
            console.log('Added achievements to user', user.id);
            // going to ignore backfilling the proven correct badges for now
        }
        else {
            // Make corrections to existing achievements
            await awardMarketCreatorBadges(user);
        }
    }));
}
if (require.main === module)
    main().then(() => process.exit());
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function removeErrorBadges(user) {
    var _a, _b;
    if ((_a = user.achievements.streaker) === null || _a === void 0 ? void 0 : _a.badges.some((b) => b.data.totalBettingStreak > 1)) {
        console.log(`User ${user.id} has a streaker badge with streaks ${(_b = user.achievements.streaker) === null || _b === void 0 ? void 0 : _b.badges.map((b) => b.data.totalBettingStreak)}`);
        // delete non 1,50 streaks
        user.achievements.streaker.badges =
            user.achievements.streaker.badges.filter((b) => badge_1.streakerBadgeRarityThresholds.includes(b.data.totalBettingStreak));
        // update user
        await firestore.collection('users').doc(user.id).update({
            achievements: user.achievements,
        });
    }
}
async function awardMarketCreatorBadges(user) {
    var _a, _b, _c;
    // Award market maker badges
    const contracts = (await (0, utils_1.getValues)(firestore.collection(`contracts`).where('creatorId', '==', user.id))).filter((c) => !c.resolution || c.resolution != 'CANCEL');
    const achievements = Object.assign(Object.assign({}, user.achievements), { marketCreator: {
            badges: [...((_b = (_a = user.achievements.marketCreator) === null || _a === void 0 ? void 0 : _a.badges) !== null && _b !== void 0 ? _b : [])],
        } });
    for (const threshold of badge_1.marketCreatorBadgeRarityThresholds) {
        const alreadyHasBadge = (_c = user.achievements.marketCreator) === null || _c === void 0 ? void 0 : _c.badges.some((b) => b.data.totalContractsCreated === threshold);
        if (alreadyHasBadge)
            continue;
        if (contracts.length >= threshold) {
            console.log(`User ${user.id} has at least ${threshold} contracts`);
            const badge = {
                type: 'MARKET_CREATOR',
                name: 'Market Creator',
                data: {
                    totalContractsCreated: threshold,
                },
                createdTime: Date.now(),
            };
            achievements.marketCreator.badges.push(badge);
        }
    }
    // update user
    await firestore.collection('users').doc(user.id).update({
        achievements,
    });
    return achievements;
}
async function awardBettingStreakBadges(user) {
    var _a, _b, _c, _d;
    const streak = (_a = user.currentBettingStreak) !== null && _a !== void 0 ? _a : 0;
    const achievements = Object.assign(Object.assign({}, user.achievements), { streaker: {
            badges: [...((_d = (_c = (_b = user.achievements) === null || _b === void 0 ? void 0 : _b.streaker) === null || _c === void 0 ? void 0 : _c.badges) !== null && _d !== void 0 ? _d : [])],
        } });
    for (const threshold of badge_1.streakerBadgeRarityThresholds) {
        if (streak >= threshold) {
            const badge = {
                type: 'STREAKER',
                name: 'Streaker',
                data: {
                    totalBettingStreak: threshold,
                },
                createdTime: Date.now(),
            };
            achievements.streaker.badges.push(badge);
        }
    }
    // update user
    await firestore.collection('users').doc(user.id).update({
        achievements,
    });
    return achievements;
}
//# sourceMappingURL=backfill-badges.js.map