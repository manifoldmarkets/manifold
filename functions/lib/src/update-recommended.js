"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadUserDataForRecommendations = exports.updateRecommendedMarkets = exports.updaterecommended = exports.scheduleUpdateRecommended = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const lodash_1 = require("lodash");
const utils_1 = require("./utils");
const api_1 = require("./api");
const recommendation_1 = require("../../common/recommendation");
const utils_2 = require("../../common/supabase/utils");
const promise_1 = require("../../common/util/promise");
const init_1 = require("./supabase/init");
const array_1 = require("../../common/util/array");
const random_1 = require("../../common/util/random");
const firestore = admin.firestore();
exports.scheduleUpdateRecommended = functions.pubsub
    // Run every hour.
    .schedule('0 * * * *')
    .timeZone('America/Los_Angeles')
    .onRun(async () => {
    try {
        console.log(await (0, utils_1.invokeFunction)('updaterecommended'));
    }
    catch (e) {
        console.error(e);
    }
});
exports.updaterecommended = (0, api_1.newEndpointNoAuth)({ timeoutSeconds: 3600, memory: '8GiB', minInstances: 0 }, async (_req) => {
    await (0, exports.updateRecommendedMarkets)();
    return { success: true };
});
const updateRecommendedMarkets = async () => {
    console.log('Loading user data...');
    const userData = await (0, exports.loadUserDataForRecommendations)();
    console.log('Computing recommendations...');
    const { userIds, userFeatures, contractIds, contractFeatures } = (0, recommendation_1.getMarketRecommendations)(userData, 2500);
    const userFeatureRows = userFeatures.map((features, i) => ({
        user_id: userIds[i],
        f0: features[0],
        f1: features[1],
        f2: features[2],
        f3: features[3],
        f4: features[4],
    }));
    const contractFeatureRows = contractFeatures.map((features, i) => ({
        contract_id: contractIds[i],
        f0: features[0],
        f1: features[1],
        f2: features[2],
        f3: features[3],
        f4: features[4],
    }));
    console.log('Writing recommendations to Supabase...');
    const db = (0, init_1.createSupabaseClient)();
    await (0, utils_2.run)(db.from('user_recommendation_features').upsert(userFeatureRows));
    await (0, utils_2.run)(db.from('contract_recommendation_features').upsert(contractFeatureRows));
    console.log('Done.');
};
exports.updateRecommendedMarkets = updateRecommendedMarkets;
const loadUserDataForRecommendations = async () => {
    const userIds = (await (0, utils_1.loadPaginated)(firestore.collection('users').select('id'))).map(({ id }) => id);
    console.log('Loaded', userIds.length, 'users');
    const db = (0, init_1.createSupabaseClient)();
    const { data } = await (0, utils_2.run)(db.rpc('search_contracts_by_group_slugs', {
        group_slugs: ['destinygg'],
        lim: 200,
        start: 0,
    }));
    const destinyContracts = data;
    const destinyContractIds = destinyContracts.map((c) => c.id);
    console.log('Loaded Destiny contracts', destinyContractIds.length);
    return await (0, promise_1.mapAsync)(userIds, async (userId) => {
        const betOnIds = (await (0, utils_1.loadPaginated)(firestore
            .collection('users')
            .doc(userId)
            .collection('contract-metrics')
            .select('contractId'))).map(({ contractId }) => contractId);
        const destinyContractIdSubset = (0, random_1.chooseRandomSubset)(destinyContractIds, 25);
        const swipeData = await (0, utils_1.loadPaginated)(admin
            .firestore()
            .collection('private-users')
            .doc(userId)
            .collection('seenMarkets')
            .select('id'));
        const swipedIds = (0, lodash_1.uniq)((0, array_1.buildArray)(swipeData.map(({ id }) => id), 
        // Pretend you swiped and skipped a subset of Destiny markets so it's prior is you don't like Destiny markets.
        destinyContractIdSubset));
        const viewedCardIds = (0, lodash_1.uniq)((await (0, utils_1.loadPaginated)(firestore
            .collection('users')
            .doc(userId)
            .collection('events')
            .where('name', '==', 'view market card')
            .select('contractId'))).map(({ contractId }) => contractId));
        const viewedPageIds = (0, lodash_1.uniq)((await (0, utils_1.loadPaginated)(firestore
            .collection('users')
            .doc(userId)
            .collection('events')
            .where('name', '==', 'view market')
            .select('contractId'))).map(({ contractId }) => contractId));
        const likedIds = (0, lodash_1.uniq)((await (0, utils_1.loadPaginated)(admin
            .firestore()
            .collection('users')
            .doc(userId)
            .collection('reactions')
            .where('contentType', '==', 'contract')
            .select('contentId'))).map(({ contentId }) => contentId));
        const groupMemberSnap = await admin
            .firestore()
            .collectionGroup('groupMembers')
            .where('userId', '==', userId)
            .select()
            .get();
        const groupIds = (0, lodash_1.uniq)((0, array_1.filterDefined)(groupMemberSnap.docs.map((doc) => { var _a; return (_a = doc.ref.parent.parent) === null || _a === void 0 ? void 0 : _a.id; })));
        return {
            userId,
            betOnIds,
            swipedIds,
            viewedCardIds,
            viewedPageIds,
            likedIds,
            groupIds,
        };
    }, 10);
};
exports.loadUserDataForRecommendations = loadUserDataForRecommendations;
//# sourceMappingURL=update-recommended.js.map