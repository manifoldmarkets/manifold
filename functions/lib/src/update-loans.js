"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateLoansCore = exports.updateloans = exports.scheduleUpdateLoans = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const lodash_1 = require("lodash");
const utils_1 = require("./utils");
const loans_1 = require("../../common/loans");
const create_notification_1 = require("./create-notification");
const array_1 = require("../../common/util/array");
const api_1 = require("./api");
const promise_1 = require("../../common/util/promise");
const firestore = admin.firestore();
exports.scheduleUpdateLoans = functions.pubsub
    // Run every day at midnight.
    .schedule('0 0 * * *')
    .timeZone('America/Los_Angeles')
    .onRun(async () => {
    try {
        console.log(await (0, utils_1.invokeFunction)('updateloans'));
    }
    catch (e) {
        console.error(e);
    }
});
exports.updateloans = (0, api_1.newEndpointNoAuth)({ timeoutSeconds: 2000, memory: '8GiB', minInstances: 0 }, async (_req) => {
    await updateLoansCore();
    return { success: true };
});
async function updateLoansCore() {
    (0, utils_1.log)('Updating loans...');
    const [users, contracts] = await Promise.all([
        (0, utils_1.loadPaginated)(firestore.collection('users')),
        (0, utils_1.loadPaginated)(firestore
            .collection('contracts')
            .where('isResolved', '==', false)),
    ]);
    (0, utils_1.log)(`Loaded ${users.length} users, ${contracts.length} contracts.`);
    const contractBets = await (0, promise_1.mapAsync)(contracts, (contract) => (0, utils_1.loadPaginated)(firestore
        .collection('contracts')
        .doc(contract.id)
        .collection('bets')));
    const bets = (0, lodash_1.sortBy)(contractBets.flat(), (b) => b.createdTime);
    (0, utils_1.log)(`Loaded ${bets.length} bets.`);
    const userPortfolios = (0, array_1.filterDefined)(await Promise.all(users.map(async (user) => {
        const portfolio = await (0, utils_1.getValues)(firestore
            .collection(`users/${user.id}/portfolioHistory`)
            .orderBy('timestamp', 'desc')
            .limit(1));
        return portfolio[0];
    })));
    (0, utils_1.log)(`Loaded ${userPortfolios.length} portfolios`);
    const portfolioByUser = (0, lodash_1.keyBy)(userPortfolios, (portfolio) => portfolio.userId);
    const contractsById = Object.fromEntries(contracts.map((contract) => [contract.id, contract]));
    const betsByUser = (0, lodash_1.groupBy)(bets, (bet) => bet.userId);
    const eligibleUsers = users.filter((u) => (0, loans_1.isUserEligibleForLoan)(portfolioByUser[u.id]));
    const userUpdates = eligibleUsers.map((user) => {
        var _a;
        const userContractBets = (0, lodash_1.groupBy)((_a = betsByUser[user.id]) !== null && _a !== void 0 ? _a : [], (b) => b.contractId);
        const result = (0, loans_1.getUserLoanUpdates)(userContractBets, contractsById);
        return { user, result };
    });
    const today = new Date().toDateString().replace(' ', '-');
    const key = `loan-notifications-${today}`;
    await (0, promise_1.mapAsync)(userUpdates, async ({ user, result }) => {
        const { updates, payout } = result;
        const betUpdates = updates.map((update) => ({
            doc: firestore
                .collection('contracts')
                .doc(update.contractId)
                .collection('bets')
                .doc(update.betId),
            fields: {
                loanAmount: update.loanTotal,
            },
        }));
        await (0, utils_1.writeAsync)(firestore, betUpdates);
        await (0, utils_1.payUser)(user.id, payout);
        if (payout >= 1) {
            // Don't send a notification if the payout is < Ṁ1,
            // because a Ṁ0 loan is confusing.
            await (0, create_notification_1.createLoanIncomeNotification)(user, key, payout);
        }
    });
    (0, utils_1.log)(`${userUpdates.length} user loans paid out!`);
}
exports.updateLoansCore = updateLoansCore;
//# sourceMappingURL=update-loans.js.map