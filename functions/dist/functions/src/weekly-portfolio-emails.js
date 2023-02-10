"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPortfolioUpdateEmailsToAllUsers = exports.weeklyPortfolioUpdateEmails = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const utils_1 = require("./utils");
const array_1 = require("../../common/util/array");
const time_1 = require("../../common/util/time");
const lodash_1 = require("lodash");
const emails_1 = require("./emails");
const utils_2 = require("./utils");
const USERS_TO_EMAIL = 600;
const WEEKLY_MOVERS_TO_SEND = 6;
// This should(?) work until we have ~70k users (500 * 120)
exports.weeklyPortfolioUpdateEmails = functions
    .runWith({ secrets: ['MAILGUN_KEY'], memory: '4GB', timeoutSeconds: 540 })
    // every minute on Friday for two hours at 12pm PT (UTC -07:00)
    .pubsub.schedule('* 19-20 * * 5')
    .timeZone('Etc/UTC')
    .onRun(async () => {
    await sendPortfolioUpdateEmailsToAllUsers();
});
const firestore = admin.firestore();
async function sendPortfolioUpdateEmailsToAllUsers() {
    const privateUsers = (0, utils_1.isProd)()
        ? // ian & stephen's ids
            // filterDefined([
            // await getPrivateUser('AJwLWoo3xue32XIiAVrL5SyR1WB2'),
            // await getPrivateUser('tlmGNz9kjXc2EteizMORes4qvWl2'),
            // ])
            await (0, utils_1.getAllPrivateUsers)()
        : (0, array_1.filterDefined)([await (0, utils_1.getPrivateUser)('6hHpzvRG0pMq8PNJs7RZj2qlZGn2')]);
    // get all users that haven't unsubscribed from weekly emails
    const privateUsersToSendEmailsTo = privateUsers
        .filter((user) => {
        return (0, utils_1.isProd)()
            ? user.notificationPreferences.profit_loss_updates.includes('email') &&
                !user.notificationPreferences.opt_out_all.includes('email') &&
                !user.weeklyPortfolioUpdateEmailSent &&
                user.email
            : user.notificationPreferences.profit_loss_updates.includes('email');
    })
        // Send emails in batches
        .slice(0, USERS_TO_EMAIL);
    if (privateUsersToSendEmailsTo.length === 0) {
        (0, utils_1.log)('No users to send trending markets emails to');
        return;
    }
    (0, utils_1.log)('Sending weekly portfolio emails to', privateUsersToSendEmailsTo.length, 'users');
    await Promise.all(privateUsersToSendEmailsTo.map(async (privateUser) => {
        await firestore.collection('private-users').doc(privateUser.id).update({
            weeklyPortfolioUpdateEmailSent: true,
        });
    }));
    // Get all bets made by each user
    const usersToBetsInLastWeek = {};
    await Promise.all(privateUsersToSendEmailsTo.map(async (user) => {
        usersToBetsInLastWeek[user.id] = await (0, utils_1.getValues)(firestore
            .collectionGroup('bets')
            .where('userId', '==', user.id)
            .where('createdTime', '>=', Date.now() - 7 * time_1.DAY_MS));
    }));
    // Get all contracts created by each user
    const usersToContractsCreated = {};
    await Promise.all(privateUsersToSendEmailsTo.map(async (user) => {
        usersToContractsCreated[user.id] = await (0, utils_1.getValues)(firestore
            .collection('contracts')
            .where('creatorId', '==', user.id)
            .where('createdTime', '>', Date.now() - 7 * time_1.DAY_MS));
    }));
    // Get all txns the users received over the past week
    const usersToTxnsReceived = {};
    await Promise.all(privateUsersToSendEmailsTo.map(async (user) => {
        usersToTxnsReceived[user.id] = await (0, utils_1.getValues)(firestore
            .collection(`txns`)
            .where('toId', '==', user.id)
            .where('createdTime', '>', Date.now() - 7 * time_1.DAY_MS));
    }));
    // Get all likes the users received over the past week
    const usersToLikesReceived = {};
    await Promise.all(privateUsersToSendEmailsTo.map(async (user) => {
        usersToLikesReceived[user.id] = await (0, utils_1.getValues)(firestore
            .collectionGroup(`reactions`)
            .where('contentOwnerId', '==', user.id)
            .where('type', '==', 'like')
            .where('createdTime', '>', Date.now() - 7 * time_1.DAY_MS));
    }));
    // Get all contract metrics for each user
    const usersToContractMetrics = {};
    await Promise.all(privateUsersToSendEmailsTo.map(async (user) => {
        const topProfits = await (0, utils_1.getValues)(firestore
            .collection(`users/${user.id}/contract-metrics`)
            .orderBy('from.week.profit', 'desc')
            .limit(Math.round(WEEKLY_MOVERS_TO_SEND / 2)));
        const topLosses = await (0, utils_1.getValues)(firestore
            .collection(`users/${user.id}/contract-metrics`)
            .orderBy('from.week.profit', 'asc')
            .limit(Math.round(WEEKLY_MOVERS_TO_SEND / 2)));
        usersToContractMetrics[user.id] = (0, lodash_1.uniqBy)([...topProfits, ...topLosses], (cm) => cm.contractId);
    }));
    // Get a flat map of all the contracts that users have metrics for
    const allWeeklyMoversContracts = (0, array_1.filterDefined)(await Promise.all((0, lodash_1.uniq)(Object.values(usersToContractMetrics).flatMap((cms) => cms.map((cm) => cm.contractId))).map((contractId) => (0, utils_1.getValue)(firestore.collection('contracts').doc(contractId)))));
    let sent = 0;
    await Promise.all(privateUsersToSendEmailsTo.map(async (privateUser) => {
        var _a, _b;
        const user = await (0, utils_1.getUser)(privateUser.id);
        // Don't send to a user unless they're over 5 days old
        if (!user || user.createdTime > Date.now() - 5 * time_1.DAY_MS)
            return;
        // Compute fun auxiliary stats
        const totalContractsUserBetOnInLastWeek = (0, lodash_1.uniq)(usersToBetsInLastWeek[privateUser.id].map((bet) => bet.contractId)).length;
        const greenBg = 'rgba(0,160,0,0.2)';
        const redBg = 'rgba(160,0,0,0.2)';
        const clearBg = 'rgba(255,255,255,0)';
        const roundedProfit = Math.round(user.profitCached.weekly) === 0
            ? 0
            : Math.floor(user.profitCached.weekly);
        const performanceData = {
            profit: (0, emails_1.emailMoneyFormat)(user.profitCached.weekly),
            profit_style: `background-color: ${roundedProfit > 0 ? greenBg : roundedProfit === 0 ? clearBg : redBg}`,
            markets_created: usersToContractsCreated[privateUser.id].length.toString(),
            likes_received: usersToLikesReceived[privateUser.id].length.toString(),
            unique_bettors: usersToTxnsReceived[privateUser.id]
                .filter((txn) => txn.category === 'UNIQUE_BETTOR_BONUS')
                .length.toString(),
            markets_traded: totalContractsUserBetOnInLastWeek.toString(),
            prediction_streak: ((_b = (_a = user.currentBettingStreak) === null || _a === void 0 ? void 0 : _a.toString()) !== null && _b !== void 0 ? _b : '0') + ' days',
            // More options: bonuses, tips given,
        };
        const weeklyMoverContracts = (0, array_1.filterDefined)(usersToContractMetrics[user.id]
            .map((cm) => cm.contractId)
            .map((contractId) => allWeeklyMoversContracts.find((c) => c.id === contractId)));
        // Compute weekly movers stats
        const investmentValueDifferences = (0, lodash_1.sortBy)((0, array_1.filterDefined)(weeklyMoverContracts.map((contract) => {
            const cpmmContract = contract;
            const marketProbAWeekAgo = cpmmContract.prob - cpmmContract.probChanges.week;
            const cm = usersToContractMetrics[user.id].filter((cm) => cm.contractId === contract.id)[0];
            if (!cm || !cm.from)
                return undefined;
            const fromWeek = cm.from.week;
            const profit = fromWeek.profit;
            const currentValue = cm.payout;
            return {
                currentValue,
                pastValue: fromWeek.prevValue,
                profit,
                contractSlug: contract.slug,
                marketProbAWeekAgo,
                questionTitle: contract.question,
                questionUrl: (0, utils_2.contractUrl)(contract),
                questionProb: cpmmContract.resolution
                    ? cpmmContract.resolution
                    : Math.round(cpmmContract.prob * 100) + '%',
                profitStyle: `color: ${profit > 0 ? 'rgba(0,160,0,1)' : '#a80000'};`,
            };
        })), (differences) => Math.abs(differences.profit)).reverse();
        // Don't show markets with abs profit < 1
        const [winningInvestments, losingInvestments] = (0, lodash_1.partition)(investmentValueDifferences.filter((diff) => Math.abs(diff.profit) > 1), (investmentsData) => {
            return investmentsData.profit > 0;
        });
        // Pick 3 winning investments and 3 losing investments
        const topInvestments = winningInvestments.slice(0, 3);
        const worstInvestments = losingInvestments.slice(0, 3);
        // If no bets in the last week ANd no market movers AND no markets created, don't send email
        if (totalContractsUserBetOnInLastWeek === 0 &&
            topInvestments.length === 0 &&
            worstInvestments.length === 0 &&
            usersToContractsCreated[privateUser.id].length === 0) {
            return;
        }
        await (0, emails_1.sendWeeklyPortfolioUpdateEmail)(user, privateUser, topInvestments.concat(worstInvestments), performanceData, WEEKLY_MOVERS_TO_SEND);
        sent++;
        (0, utils_1.log)(`emails sent: ${sent}/${USERS_TO_EMAIL}`);
    }));
}
exports.sendPortfolioUpdateEmailsToAllUsers = sendPortfolioUpdateEmailsToAllUsers;
//# sourceMappingURL=weekly-portfolio-emails.js.map