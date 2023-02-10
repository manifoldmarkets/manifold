"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const format_1 = require("common/util/format");
const promise_1 = require("common/util/promise");
const time_1 = require("common/util/time");
const admin = require("firebase-admin");
const lodash_1 = require("lodash");
const utils_1 = require("../utils");
const script_init_1 = require("./script-init");
(0, script_init_1.initAdmin)();
const firestore = admin.firestore();
async function calculateManaSupply() {
    const users = await (0, utils_1.loadPaginated)(firestore.collection('users'), 500);
    console.log(`Loaded ${users.length} users.`);
    const now = Date.now();
    const portfolioValues = await (0, promise_1.mapAsync)(users, async (user) => {
        const portfolioHistory = await loadPortfolioHistory(user.id, now);
        const { current } = portfolioHistory;
        if (!current)
            return 0;
        return current.investmentValue + current.balance;
    });
    const totalMana = (0, lodash_1.sum)(portfolioValues);
    console.log('Current mana supply (incl house accounts):', (0, format_1.formatLargeNumber)(totalMana));
}
const loadPortfolioHistory = async (userId, now) => {
    const query = firestore
        .collection('users')
        .doc(userId)
        .collection('portfolioHistory')
        .orderBy('timestamp', 'desc')
        .limit(1);
    const portfolioMetrics = await Promise.all([
        (0, utils_1.getValues)(query),
        (0, utils_1.getValues)(query.where('timestamp', '<', now - time_1.DAY_MS)),
        (0, utils_1.getValues)(query.where('timestamp', '<', now - 7 * time_1.DAY_MS)),
        (0, utils_1.getValues)(query.where('timestamp', '<', now - 30 * time_1.DAY_MS)),
    ]);
    const [current, day, week, month] = portfolioMetrics.map((p) => p[0]);
    return {
        current,
        day,
        week,
        month,
    };
};
if (require.main === module) {
    calculateManaSupply().then(() => process.exit());
}
//# sourceMappingURL=calculate-mana-supply.js.map