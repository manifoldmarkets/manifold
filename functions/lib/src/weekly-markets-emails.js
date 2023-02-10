"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendTrendingMarketsEmailsToAllUsers = exports.getTrendingContracts = exports.weeklyMarketsEmails = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const utils_1 = require("./utils");
const random_1 = require("../../common/util/random");
const time_1 = require("../../common/util/time");
const array_1 = require("../../common/util/array");
const lodash_1 = require("lodash");
const emails_1 = require("./emails");
const GROUP_SLUGS_TO_IGNORE_IN_TRENDING = [
    'manifold-features',
    'manifold-6748e065087e',
    'destinygg',
];
const USERS_TO_EMAIL = 500;
// This should(?) work until we have ~60k users (500 * 120)
exports.weeklyMarketsEmails = functions
    .runWith({ secrets: ['MAILGUN_KEY'], memory: '4GB', timeoutSeconds: 540 })
    // every minute on Monday for 2 hours starting at 12pm PT (UTC -07:00)
    .pubsub.schedule('* 19-20 * * 1')
    .timeZone('Etc/UTC')
    .onRun(async () => {
    await sendTrendingMarketsEmailsToAllUsers();
});
const firestore = admin.firestore();
async function getTrendingContracts() {
    return await (0, utils_1.getValues)(firestore
        .collection('contracts')
        .where('isResolved', '==', false)
        .where('visibility', '==', 'public')
        // can't use multiple inequality (/orderBy) operators on different fields,
        // so have to filter for closed contracts separately
        .orderBy('popularityScore', 'desc')
        // might as well go big and do a quick filter for closed ones later
        .limit(500));
}
exports.getTrendingContracts = getTrendingContracts;
async function sendTrendingMarketsEmailsToAllUsers() {
    const numContractsToSend = 6;
    const privateUsers = (0, utils_1.isProd)()
        ? await (0, utils_1.getAllPrivateUsers)()
        : (0, array_1.filterDefined)([
            await (0, utils_1.getPrivateUser)('6hHpzvRG0pMq8PNJs7RZj2qlZGn2'), // dev Ian
        ]);
    const privateUsersToSendEmailsTo = privateUsers
        // Get all users that haven't unsubscribed from weekly emails
        .filter((user) => user.notificationPreferences.trending_markets.includes('email') &&
        !user.notificationPreferences.opt_out_all.includes('email') &&
        !user.weeklyTrendingEmailSent &&
        user.email)
        .slice(0, USERS_TO_EMAIL); // Send the emails out in batches
    if (privateUsersToSendEmailsTo.length === 0) {
        (0, utils_1.log)('No users to send trending markets emails to');
        return;
    }
    await Promise.all(privateUsersToSendEmailsTo.map(async (privateUser) => {
        await firestore.collection('private-users').doc(privateUser.id).update({
            weeklyTrendingEmailSent: true,
        });
    }));
    (0, utils_1.log)('Sending weekly trending emails to', privateUsersToSendEmailsTo.length, 'users');
    const trendingContracts = (await getTrendingContracts())
        .filter((contract) => {
        var _a, _b;
        return !(contract.question.toLowerCase().includes('stock') &&
            contract.question.toLowerCase().includes('permanent')) &&
            ((_a = contract === null || contract === void 0 ? void 0 : contract.closeTime) !== null && _a !== void 0 ? _a : 0) > Date.now() + time_1.DAY_MS &&
            !((_b = contract.groupSlugs) === null || _b === void 0 ? void 0 : _b.some((slug) => GROUP_SLUGS_TO_IGNORE_IN_TRENDING.includes(slug)));
    })
        .slice(0, 50);
    const uniqueTrendingContracts = removeSimilarQuestions(trendingContracts, trendingContracts, true).slice(0, 20);
    let sent = 0;
    await Promise.all(privateUsersToSendEmailsTo.map(async (privateUser) => {
        if (!privateUser.email)
            return;
        const unbetOnFollowedMarkets = await getUserUnBetOnFollowsMarkets(privateUser.id);
        const unBetOnGroupMarkets = await getUserUnBetOnGroupsMarkets(privateUser.id, unbetOnFollowedMarkets);
        const similarBettorsMarkets = await getSimilarBettorsMarkets(privateUser.id, unBetOnGroupMarkets);
        const marketsAvailableToSend = (0, lodash_1.uniqBy)([
            ...chooseRandomSubset(unbetOnFollowedMarkets, 2),
            // // Most people will belong to groups but may not follow other users,
            // so choose more from the other subsets if the followed markets is sparse
            ...chooseRandomSubset(unBetOnGroupMarkets, unbetOnFollowedMarkets.length < 2 ? 3 : 2),
            ...chooseRandomSubset(similarBettorsMarkets, unbetOnFollowedMarkets.length < 2 ? 3 : 2),
        ], (contract) => contract.id);
        // // at least send them trending contracts if nothing else
        if (marketsAvailableToSend.length < numContractsToSend) {
            const trendingMarketsToSend = numContractsToSend - marketsAvailableToSend.length;
            (0, utils_1.log)(`not enough personalized markets, sending ${trendingMarketsToSend} trending`);
            marketsAvailableToSend.push(...removeSimilarQuestions(uniqueTrendingContracts, marketsAvailableToSend, false)
                .filter((contract) => { var _a; return !((_a = contract.uniqueBettorIds) === null || _a === void 0 ? void 0 : _a.includes(privateUser.id)); })
                .slice(0, trendingMarketsToSend));
        }
        if (marketsAvailableToSend.length < numContractsToSend) {
            (0, utils_1.log)('not enough new, unbet-on contracts to send to user', privateUser.id);
            return;
        }
        // choose random subset of contracts to send to user
        const contractsToSend = chooseRandomSubset(marketsAvailableToSend, numContractsToSend);
        const user = await (0, utils_1.getUser)(privateUser.id);
        if (!user)
            return;
        await (0, emails_1.sendInterestingMarketsEmail)(user, privateUser, contractsToSend);
        sent++;
        (0, utils_1.log)(`emails sent: ${sent}/${USERS_TO_EMAIL}`);
    }));
}
exports.sendTrendingMarketsEmailsToAllUsers = sendTrendingMarketsEmailsToAllUsers;
const MINIMUM_POPULARITY_SCORE = 10;
const getUserUnBetOnFollowsMarkets = async (userId) => {
    const follows = await (0, utils_1.getValues)(firestore.collection('users').doc(userId).collection('follows'));
    const unBetOnContractsFromFollows = await Promise.all(follows.map(async (follow) => {
        const unresolvedContracts = await (0, utils_1.getValues)(firestore
            .collection('contracts')
            .where('isResolved', '==', false)
            .where('visibility', '==', 'public')
            .where('creatorId', '==', follow.userId)
            // can't use multiple inequality (/orderBy) operators on different fields,
            // so have to filter for closed contracts separately
            .orderBy('popularityScore', 'desc')
            .limit(50));
        // filter out contracts that have close times less than 6 hours from now
        const openContracts = unresolvedContracts.filter((contract) => { var _a; return ((_a = contract === null || contract === void 0 ? void 0 : contract.closeTime) !== null && _a !== void 0 ? _a : 0) > Date.now() + 6 * time_1.HOUR_MS; });
        return openContracts.filter((contract) => { var _a; return !((_a = contract.uniqueBettorIds) === null || _a === void 0 ? void 0 : _a.includes(userId)); });
    }));
    const sortedMarkets = (0, lodash_1.uniqBy)(unBetOnContractsFromFollows.flat(), (contract) => contract.id)
        .filter((contract) => contract.popularityScore !== undefined &&
        contract.popularityScore > MINIMUM_POPULARITY_SCORE)
        .sort((a, b) => { var _a, _b; return ((_a = b.popularityScore) !== null && _a !== void 0 ? _a : 0) - ((_b = a.popularityScore) !== null && _b !== void 0 ? _b : 0); });
    const uniqueSortedMarkets = removeSimilarQuestions(sortedMarkets, sortedMarkets, true);
    const topSortedMarkets = uniqueSortedMarkets.slice(0, 10);
    // log(
    //   'top 10 sorted markets by followed users',
    //   topSortedMarkets.map((c) => c.question + ' ' + c.popularityScore)
    // )
    return topSortedMarkets;
};
const getUserUnBetOnGroupsMarkets = async (userId, differentThanTheseContracts) => {
    const snap = await firestore
        .collectionGroup('groupMembers')
        .where('userId', '==', userId)
        .get();
    const groupIds = (0, array_1.filterDefined)(snap.docs.map((doc) => { var _a; return (_a = doc.ref.parent.parent) === null || _a === void 0 ? void 0 : _a.id; }));
    const groups = (0, array_1.filterDefined)(await Promise.all(groupIds.map(async (groupId) => await (0, utils_1.getGroup)(groupId))));
    if (groups.length === 0)
        return [];
    const unBetOnContractsFromGroups = await Promise.all(groups.map(async (group) => {
        const unresolvedContracts = await (0, utils_1.getValues)(firestore
            .collection('contracts')
            .where('isResolved', '==', false)
            .where('visibility', '==', 'public')
            .where('groupSlugs', 'array-contains', group.slug)
            // can't use multiple inequality (/orderBy) operators on different fields,
            // so have to filter for closed contracts separately
            .orderBy('popularityScore', 'desc')
            .limit(50));
        // filter out contracts that have close times less than 6 hours from now
        const openContracts = unresolvedContracts.filter((contract) => { var _a; return ((_a = contract === null || contract === void 0 ? void 0 : contract.closeTime) !== null && _a !== void 0 ? _a : 0) > Date.now() + 6 * time_1.HOUR_MS; });
        return openContracts.filter((contract) => { var _a; return !((_a = contract.uniqueBettorIds) === null || _a === void 0 ? void 0 : _a.includes(userId)); });
    }));
    const sortedMarkets = (0, lodash_1.uniqBy)(unBetOnContractsFromGroups.flat(), (contract) => contract.id)
        .filter((contract) => contract.popularityScore !== undefined &&
        contract.popularityScore > MINIMUM_POPULARITY_SCORE)
        .sort((a, b) => { var _a, _b; return ((_a = b.popularityScore) !== null && _a !== void 0 ? _a : 0) - ((_b = a.popularityScore) !== null && _b !== void 0 ? _b : 0); });
    const uniqueSortedMarkets = removeSimilarQuestions(sortedMarkets, sortedMarkets, true);
    const topSortedMarkets = removeSimilarQuestions(uniqueSortedMarkets, differentThanTheseContracts, false).slice(0, 10);
    // log(
    //   'top 10 sorted group markets',
    //   topSortedMarkets.map((c) => c.question + ' ' + c.popularityScore)
    // )
    return topSortedMarkets;
};
// Gets markets followed by similar bettors and bet on by similar bettors
const getSimilarBettorsMarkets = async (userId, differentThanTheseContracts) => {
    // get contracts with unique bettor ids with this user
    const contractsUserHasBetOn = await (0, utils_1.getValues)(firestore
        .collection('contracts')
        .where('uniqueBettorIds', 'array-contains', userId)
        // Favor more recently created markets
        .orderBy('createdTime', 'desc')
        .limit(100));
    if (contractsUserHasBetOn.length === 0)
        return [];
    // count the number of times each unique bettor id appears on those contracts
    const bettorIdsToCounts = (0, lodash_1.countBy)(contractsUserHasBetOn.map((contract) => contract.uniqueBettorIds).flat(), (bettorId) => bettorId);
    // sort by number of times they appear with at least 2 appearances
    const sortedBettorIds = Object.entries(bettorIdsToCounts)
        .sort((a, b) => b[1] - a[1])
        .filter((bettorId) => bettorId[1] > 2)
        .map((entry) => entry[0])
        .filter((bettorId) => bettorId !== userId);
    // get the top 10 most similar bettors (excluding this user)
    const similarBettorIds = sortedBettorIds.slice(0, 10);
    if (similarBettorIds.length === 0)
        return [];
    // get contracts with unique bettor ids with this user
    const contractsSimilarBettorsHaveBetOn = (0, lodash_1.uniqBy)((await (0, utils_1.getValues)(firestore
        .collection('contracts')
        .where('uniqueBettorIds', 'array-contains-any', similarBettorIds.slice(0, 10))
        .orderBy('popularityScore', 'desc')
        .limit(200))).filter((contract) => {
        var _a, _b;
        return !((_a = contract.uniqueBettorIds) === null || _a === void 0 ? void 0 : _a.includes(userId)) &&
            ((_b = contract.popularityScore) !== null && _b !== void 0 ? _b : 0) > MINIMUM_POPULARITY_SCORE;
    }), (contract) => contract.id);
    // sort the contracts by how many times similar bettor ids are in their unique bettor ids array
    const sortedContractsInSimilarBettorsBets = contractsSimilarBettorsHaveBetOn
        .map((contract) => {
        var _a;
        const appearances = (_a = contract.uniqueBettorIds) === null || _a === void 0 ? void 0 : _a.filter((bettorId) => similarBettorIds.includes(bettorId)).length;
        return [contract, appearances];
    })
        .sort((a, b) => b[1] - a[1])
        .map((entry) => entry[0]);
    const uniqueSortedContractsInSimilarBettorsBets = removeSimilarQuestions(sortedContractsInSimilarBettorsBets, sortedContractsInSimilarBettorsBets, true);
    const topMostSimilarContracts = removeSimilarQuestions(uniqueSortedContractsInSimilarBettorsBets, differentThanTheseContracts, false).slice(0, 10);
    // log(
    //   'top 10 sorted contracts other similar bettors have bet on',
    //   topMostSimilarContracts.map((c) => c.question)
    // )
    return topMostSimilarContracts;
};
// search contract array by question and remove contracts with 3 matching words in the question
const removeSimilarQuestions = (contractsToFilter, byContracts, allowExactSameContracts) => {
    // log(
    //   'contracts to filter by',
    //   byContracts.map((c) => c.question + ' ' + c.popularityScore)
    // )
    let contractsToRemove = [];
    byContracts.length > 0 &&
        byContracts.forEach((contract) => {
            const contractQuestion = stripNonAlphaChars(contract.question.toLowerCase());
            const contractQuestionWords = (0, lodash_1.uniq)(contractQuestion.split(' ')).filter((w) => !IGNORE_WORDS.includes(w));
            contractsToRemove = contractsToRemove.concat(contractsToFilter.filter(
            // Remove contracts with more than 2 matching (uncommon) words and a lower popularity score
            (c2) => {
                var _a, _b;
                const significantOverlap = 
                // TODO: we should probably use a library for comparing strings/sentiments
                (0, lodash_1.uniq)(stripNonAlphaChars(c2.question.toLowerCase()).split(' ')).filter((word) => contractQuestionWords.includes(word)).length >
                    2;
                const lessPopular = ((_a = c2.popularityScore) !== null && _a !== void 0 ? _a : 0) < ((_b = contract.popularityScore) !== null && _b !== void 0 ? _b : 0);
                return ((significantOverlap && lessPopular) ||
                    (allowExactSameContracts ? false : c2.id === contract.id));
            }));
        });
    // log(
    //   'contracts to filter out',
    //   contractsToRemove.map((c) => c.question)
    // )
    const returnContracts = contractsToFilter.filter((cf) => !contractsToRemove.some((c) => c.id === cf.id));
    return returnContracts;
};
const fiveMinutes = 5 * 60 * 1000;
const seed = Math.round(Date.now() / fiveMinutes).toString();
const rng = (0, random_1.createRNG)(seed);
function chooseRandomSubset(contracts, count) {
    (0, random_1.shuffle)(contracts, rng);
    return contracts.slice(0, count);
}
function stripNonAlphaChars(str) {
    return str.replace(/[^\w\s']|_/g, '').replace(/\s+/g, ' ');
}
const IGNORE_WORDS = [
    'the',
    'a',
    'an',
    'and',
    'or',
    'of',
    'to',
    'in',
    'on',
    'will',
    'be',
    'is',
    'are',
    'for',
    'by',
    'at',
    'from',
    'what',
    'when',
    'which',
    'that',
    'it',
    'as',
    'if',
    'then',
    'than',
    'but',
    'have',
    'has',
    'had',
];
//# sourceMappingURL=weekly-markets-emails.js.map