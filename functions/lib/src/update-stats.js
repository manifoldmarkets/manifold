"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateStats = exports.updateStatsCore = exports.getDailyNewUsers = exports.getStripeSales = exports.getDailyContracts = exports.getDailyComments = exports.getDailyBets = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
dayjs.extend(utc);
dayjs.extend(timezone);
const lodash_1 = require("lodash");
const utils_1 = require("./utils");
const time_1 = require("../../common/util/time");
const math_1 = require("../../common/util/math");
const promise_1 = require("../../common/util/promise");
const firestore = admin.firestore();
const numberOfDays = 180;
const getBetsQuery = (startTime, endTime) => firestore
    .collectionGroup('bets')
    .where('createdTime', '>=', startTime)
    .where('createdTime', '<', endTime)
    .orderBy('createdTime', 'asc')
    .select('createdTime', 'userId', 'amount');
async function getDailyBets(startTime, numberOfDays) {
    const queries = (0, lodash_1.range)(0, numberOfDays).map((days) => {
        const begin = startTime + days * time_1.DAY_MS;
        return getBetsQuery(begin, begin + time_1.DAY_MS);
    });
    const betsByDay = await (0, promise_1.mapAsync)(queries, async (q) => {
        return (await q.get()).docs.map((d) => ({
            id: d.id,
            userId: d.get('userId'),
            ts: d.get('createdTime'),
            amount: d.get('amount'),
        }));
    });
    return betsByDay;
}
exports.getDailyBets = getDailyBets;
const getCommentsQuery = (startTime, endTime) => firestore
    .collectionGroup('comments')
    .where('createdTime', '>=', startTime)
    .where('createdTime', '<', endTime)
    .orderBy('createdTime', 'asc')
    .select('createdTime', 'userId');
async function getDailyComments(startTime, numberOfDays) {
    const query = getCommentsQuery(startTime, startTime + time_1.DAY_MS * numberOfDays);
    const comments = (await query.get()).docs;
    const commentsByDay = (0, lodash_1.range)(0, numberOfDays).map(() => []);
    for (const comment of comments) {
        const ts = comment.get('createdTime');
        const userId = comment.get('userId');
        const dayIndex = Math.floor((ts - startTime) / time_1.DAY_MS);
        commentsByDay[dayIndex].push({ id: comment.id, userId, ts });
    }
    return commentsByDay;
}
exports.getDailyComments = getDailyComments;
const getContractsQuery = (startTime, endTime) => firestore
    .collection('contracts')
    .where('createdTime', '>=', startTime)
    .where('createdTime', '<', endTime)
    .orderBy('createdTime', 'asc')
    .select('createdTime', 'creatorId');
async function getDailyContracts(startTime, numberOfDays) {
    const query = getContractsQuery(startTime, startTime + time_1.DAY_MS * numberOfDays);
    const contracts = (await query.get()).docs;
    const contractsByDay = (0, lodash_1.range)(0, numberOfDays).map(() => []);
    for (const contract of contracts) {
        const ts = contract.get('createdTime');
        const userId = contract.get('creatorId');
        const dayIndex = Math.floor((ts - startTime) / time_1.DAY_MS);
        contractsByDay[dayIndex].push({ id: contract.id, userId, ts });
    }
    return contractsByDay;
}
exports.getDailyContracts = getDailyContracts;
const getStripeSalesQuery = (startTime, endTime) => firestore
    .collection('stripe-transactions')
    .where('timestamp', '>=', startTime)
    .where('timestamp', '<', endTime)
    .orderBy('timestamp', 'asc')
    .select('manticDollarQuantity', 'timestamp', 'userId', 'sessionId');
async function getStripeSales(startTime, numberOfDays) {
    const query = getStripeSalesQuery(startTime, startTime + time_1.DAY_MS * numberOfDays);
    const sales = (await query.get()).docs;
    const salesByDay = (0, lodash_1.range)(0, numberOfDays).map(() => []);
    for (const sale of sales) {
        const ts = sale.get('timestamp');
        const amount = sale.get('manticDollarQuantity') / 100; // convert to dollars
        const userId = sale.get('userId');
        const sessionId = sale.get('sessionId');
        const dayIndex = Math.floor((ts - startTime) / time_1.DAY_MS);
        salesByDay[dayIndex].push({ id: sessionId, userId, ts, amount });
    }
    return salesByDay;
}
exports.getStripeSales = getStripeSales;
const getUsersQuery = (startTime, endTime) => firestore
    .collection('users')
    .where('createdTime', '>=', startTime)
    .where('createdTime', '<', endTime)
    .orderBy('createdTime', 'asc')
    .select('createdTime');
async function getDailyNewUsers(startTime, numberOfDays) {
    const query = getUsersQuery(startTime, startTime + time_1.DAY_MS * numberOfDays);
    const users = (await query.get()).docs;
    const usersByDay = (0, lodash_1.range)(0, numberOfDays).map(() => []);
    for (const user of users) {
        const ts = user.get('createdTime');
        const dayIndex = Math.floor((ts - startTime) / time_1.DAY_MS);
        usersByDay[dayIndex].push({ id: user.id, userId: user.id, ts });
    }
    return usersByDay;
}
exports.getDailyNewUsers = getDailyNewUsers;
const updateStatsCore = async () => {
    const today = dayjs().tz('America/Los_Angeles').startOf('day').valueOf();
    const startDate = today - numberOfDays * time_1.DAY_MS;
    (0, utils_1.log)('Fetching data for stats update...');
    const [dailyBets, dailyContracts, dailyComments, dailyNewUsers, dailyStripeSales,] = await Promise.all([
        getDailyBets(startDate.valueOf(), numberOfDays),
        getDailyContracts(startDate.valueOf(), numberOfDays),
        getDailyComments(startDate.valueOf(), numberOfDays),
        getDailyNewUsers(startDate.valueOf(), numberOfDays),
        getStripeSales(startDate.valueOf(), numberOfDays),
    ]);
    (0, utils_1.logMemory)();
    const dailyBetCounts = dailyBets.map((bets) => bets.length);
    const dailyContractCounts = dailyContracts.map((contracts) => contracts.length);
    const dailyCommentCounts = dailyComments.map((comments) => comments.length);
    const dailySales = dailyStripeSales.map((sales) => (0, lodash_1.sum)(sales.map((s) => s.amount)));
    const dailyUserIds = (0, lodash_1.zip)(dailyContracts, dailyBets, dailyComments).map(([contracts, bets, comments]) => {
        const creatorIds = (contracts !== null && contracts !== void 0 ? contracts : []).map((c) => c.userId);
        const betUserIds = (bets !== null && bets !== void 0 ? bets : []).map((bet) => bet.userId);
        const commentUserIds = (comments !== null && comments !== void 0 ? comments : []).map((comment) => comment.userId);
        return (0, lodash_1.uniq)([...creatorIds, ...betUserIds, ...commentUserIds]);
    });
    const avgDailyUserActions = (0, lodash_1.zip)(dailyContracts, dailyBets, dailyComments).map(([contracts, bets, comments]) => {
        const creatorIds = (contracts !== null && contracts !== void 0 ? contracts : []).map((c) => c.userId);
        const betUserIds = (bets !== null && bets !== void 0 ? bets : []).map((bet) => bet.userId);
        const commentUserIds = (comments !== null && comments !== void 0 ? comments : []).map((comment) => comment.userId);
        const allIds = [...creatorIds, ...betUserIds, ...commentUserIds];
        if (allIds.length === 0)
            return 0;
        const userIdCounts = (0, lodash_1.countBy)(allIds, (id) => id);
        return (0, math_1.median)(Object.values(userIdCounts).filter((c) => c > 1));
    });
    (0, utils_1.log)(`Fetched ${(0, lodash_1.sum)(dailyBetCounts)} bets, ${(0, lodash_1.sum)(dailyContractCounts)} contracts, ${(0, lodash_1.sum)(dailyComments)} comments, from ${(0, lodash_1.sum)(dailyNewUsers)} unique users.`);
    const dailyActiveUsers = dailyUserIds.map((userIds) => userIds.length);
    const dailyActiveUsersWeeklyAvg = dailyUserIds.map((_, i) => {
        const start = Math.max(0, i - 6);
        const end = i + 1;
        return (0, math_1.average)(dailyActiveUsers.slice(start, end));
    });
    const weeklyActiveUsers = dailyUserIds.map((_, i) => {
        const start = Math.max(0, i - 6);
        const end = i + 1;
        const uniques = new Set(dailyUserIds.slice(start, end).flat());
        return uniques.size;
    });
    const monthlyActiveUsers = dailyUserIds.map((_, i) => {
        const start = Math.max(0, i - 29);
        const end = i + 1;
        const uniques = new Set(dailyUserIds.slice(start, end).flat());
        return uniques.size;
    });
    const d1 = dailyUserIds.map((userIds, i) => {
        if (i === 0)
            return 0;
        const uniques = new Set(userIds);
        const yesterday = dailyUserIds[i - 1];
        const retainedCount = (0, lodash_1.sumBy)(yesterday, (userId) => uniques.has(userId) ? 1 : 0);
        return retainedCount / uniques.size;
    });
    const d1WeeklyAvg = d1.map((_, i) => {
        const start = Math.max(0, i - 6);
        const end = i + 1;
        return (0, math_1.average)(d1.slice(start, end));
    });
    const dailyNewUserIds = dailyNewUsers.map((users) => users.map((u) => u.id));
    const nd1 = dailyUserIds.map((userIds, i) => {
        if (i === 0)
            return 0;
        const uniques = new Set(userIds);
        const yesterday = dailyNewUserIds[i - 1];
        const retainedCount = (0, lodash_1.sumBy)(yesterday, (userId) => uniques.has(userId) ? 1 : 0);
        return retainedCount / uniques.size;
    });
    const nd1WeeklyAvg = nd1.map((_, i) => {
        const start = Math.max(0, i - 6);
        const end = i + 1;
        return (0, math_1.average)(nd1.slice(start, end));
    });
    const nw1 = dailyNewUserIds.map((_userIds, i) => {
        if (i < 13)
            return 0;
        const twoWeeksAgo = {
            start: Math.max(0, i - 13),
            end: Math.max(0, i - 6),
        };
        const lastWeek = {
            start: Math.max(0, i - 6),
            end: i + 1,
        };
        const newTwoWeeksAgo = new Set(dailyNewUserIds.slice(twoWeeksAgo.start, twoWeeksAgo.end).flat());
        const activeLastWeek = new Set(dailyUserIds.slice(lastWeek.start, lastWeek.end).flat());
        const retainedCount = (0, lodash_1.sumBy)(Array.from(newTwoWeeksAgo), (userId) => activeLastWeek.has(userId) ? 1 : 0);
        return retainedCount / newTwoWeeksAgo.size;
    });
    const weekOnWeekRetention = dailyUserIds.map((_userId, i) => {
        const twoWeeksAgo = {
            start: Math.max(0, i - 13),
            end: Math.max(0, i - 6),
        };
        const lastWeek = {
            start: Math.max(0, i - 6),
            end: i + 1,
        };
        const activeTwoWeeksAgo = new Set(dailyUserIds.slice(twoWeeksAgo.start, twoWeeksAgo.end).flat());
        const activeLastWeek = new Set(dailyUserIds.slice(lastWeek.start, lastWeek.end).flat());
        const retainedCount = (0, lodash_1.sumBy)(Array.from(activeTwoWeeksAgo), (userId) => activeLastWeek.has(userId) ? 1 : 0);
        return retainedCount / activeTwoWeeksAgo.size;
    });
    const monthlyRetention = dailyUserIds.map((_userId, i) => {
        const twoMonthsAgo = {
            start: Math.max(0, i - 59),
            end: Math.max(0, i - 29),
        };
        const lastMonth = {
            start: Math.max(0, i - 29),
            end: i + 1,
        };
        const activeTwoMonthsAgo = new Set(dailyUserIds.slice(twoMonthsAgo.start, twoMonthsAgo.end).flat());
        const activeLastMonth = new Set(dailyUserIds.slice(lastMonth.start, lastMonth.end).flat());
        const retainedCount = (0, lodash_1.sumBy)(Array.from(activeTwoMonthsAgo), (userId) => activeLastMonth.has(userId) ? 1 : 0);
        if (activeTwoMonthsAgo.size === 0)
            return 0;
        return retainedCount / activeTwoMonthsAgo.size;
    });
    const firstBetDict = {};
    for (let i = 0; i < dailyBets.length; i++) {
        const bets = dailyBets[i];
        for (const bet of bets) {
            if (bet.userId in firstBetDict)
                continue;
            firstBetDict[bet.userId] = i;
        }
    }
    const dailyActivationRate = dailyNewUsers.map((newUsers, i) => {
        const activedCount = (0, lodash_1.sumBy)(newUsers, (user) => {
            const firstBet = firstBetDict[user.id];
            return firstBet === i ? 1 : 0;
        });
        return activedCount / newUsers.length;
    });
    const dailyActivationRateWeeklyAvg = dailyActivationRate.map((_, i) => {
        const start = Math.max(0, i - 6);
        const end = i + 1;
        return (0, math_1.average)(dailyActivationRate.slice(start, end));
    });
    const dailySignups = dailyNewUsers.map((users) => users.length);
    // Total mana divided by 100.
    const dailyManaBet = dailyBets.map((bets) => {
        return Math.round((0, lodash_1.sumBy)(bets, (bet) => bet.amount) / 100);
    });
    const weeklyManaBet = dailyManaBet.map((_, i) => {
        const start = Math.max(0, i - 6);
        const end = i + 1;
        const total = (0, lodash_1.sum)(dailyManaBet.slice(start, end));
        if (end - start < 7)
            return (total * 7) / (end - start);
        return total;
    });
    const monthlyManaBet = dailyManaBet.map((_, i) => {
        const start = Math.max(0, i - 29);
        const end = i + 1;
        const total = (0, lodash_1.sum)(dailyManaBet.slice(start, end));
        const range = end - start;
        if (range < 30)
            return (total * 30) / range;
        return total;
    });
    const statsData = {
        startDate: startDate.valueOf(),
        dailyActiveUsers,
        dailyActiveUsersWeeklyAvg,
        avgDailyUserActions,
        dailySales,
        weeklyActiveUsers,
        monthlyActiveUsers,
        d1,
        d1WeeklyAvg,
        nd1,
        nd1WeeklyAvg,
        nw1,
        dailyBetCounts,
        dailyContractCounts,
        dailyCommentCounts,
        dailySignups,
        weekOnWeekRetention,
        dailyActivationRate,
        dailyActivationRateWeeklyAvg,
        monthlyRetention,
        manaBet: {
            daily: dailyManaBet,
            weekly: weeklyManaBet,
            monthly: monthlyManaBet,
        },
    };
    (0, utils_1.log)('Computed stats: ', statsData);
    await firestore.doc('stats/stats').set(statsData);
};
exports.updateStatsCore = updateStatsCore;
exports.updateStats = functions
    .runWith({ memory: '8GB', timeoutSeconds: 540 })
    .pubsub.schedule('every 60 minutes')
    .onRun(exports.updateStatsCore);
//# sourceMappingURL=update-stats.js.map