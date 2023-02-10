"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreContracts = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const utils_1 = require("./utils");
const object_1 = require("../../common/util/object");
const time_1 = require("../../common/util/time");
const init_1 = require("./supabase/init");
const likes_1 = require("./supabase/likes");
exports.scoreContracts = functions
    .runWith({ memory: '4GB', timeoutSeconds: 540, secrets: ['SUPABASE_KEY'] })
    .pubsub.schedule('every 1 hours')
    .onRun(async () => {
    await scoreContractsInternal();
});
const firestore = admin.firestore();
async function scoreContractsInternal() {
    var _a, _b, _c, _d, _e;
    const now = Date.now();
    const hourAgo = now - time_1.HOUR_MS;
    const dayAgo = now - time_1.DAY_MS;
    const weekAgo = now - 7 * time_1.DAY_MS;
    const activeContracts = await (0, utils_1.loadPaginated)(firestore
        .collection('contracts')
        .where('lastUpdatedTime', '>', hourAgo));
    // We have to downgrade previously active contracts to allow the new ones to bubble up
    const previouslyActiveContractsSnap = await firestore
        .collection('contracts')
        .where('popularityScore', '>', 0)
        .get();
    const activeContractIds = activeContracts.map((c) => c.id);
    const previouslyActiveContracts = previouslyActiveContractsSnap.docs
        .map((doc) => doc.data())
        .filter((c) => !activeContractIds.includes(c.id));
    const contracts = activeContracts.concat(previouslyActiveContracts);
    (0, utils_1.log)(`Found ${contracts.length} contracts to score`);
    const db = (0, init_1.createSupabaseClient)();
    const todayLikesByContract = await (0, likes_1.getRecentContractLikes)(db, dayAgo);
    const thisWeekLikesByContract = await (0, likes_1.getRecentContractLikes)(db, weekAgo);
    for (const contract of contracts) {
        const likesToday = (_a = todayLikesByContract[contract.id]) !== null && _a !== void 0 ? _a : 0;
        const likes7Days = (_b = thisWeekLikesByContract[contract.id]) !== null && _b !== void 0 ? _b : 0;
        const popularityScore = likesToday +
            likes7Days / 10 +
            ((_c = contract.uniqueBettors7Days) !== null && _c !== void 0 ? _c : 0) / 10 +
            ((_d = contract.uniqueBettors24Hours) !== null && _d !== void 0 ? _d : 0);
        const wasCreatedToday = contract.createdTime > dayAgo;
        let dailyScore;
        if (contract.outcomeType === 'BINARY' &&
            contract.mechanism === 'cpmm-1' &&
            !wasCreatedToday) {
            const percentChange = Math.abs(contract.probChanges.day);
            dailyScore =
                Math.log(((_e = contract.uniqueBettors7Days) !== null && _e !== void 0 ? _e : 0) + 1) * percentChange;
        }
        if (contract.popularityScore !== popularityScore ||
            contract.dailyScore !== dailyScore) {
            await firestore
                .collection('contracts')
                .doc(contract.id)
                .update((0, object_1.removeUndefinedProps)({ popularityScore, dailyScore }));
        }
    }
}
//# sourceMappingURL=score-contracts.js.map