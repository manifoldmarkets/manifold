"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateContractMetricsForUsers = void 0;
const admin = require("firebase-admin");
const lodash_1 = require("lodash");
const calculate_metrics_1 = require("../../../common/calculate-metrics");
const firestore = admin.firestore();
async function updateContractMetricsForUsers(contract, allContractBets) {
    const batch = firestore.batch();
    const betsByUser = (0, lodash_1.groupBy)(allContractBets, 'userId');
    Object.entries(betsByUser).forEach(async ([userId, bets]) => {
        const metrics = (0, calculate_metrics_1.calculateUserMetrics)(contract, bets);
        batch.update(firestore.collection(`users/${userId}/contract-metrics`).doc(contract.id), metrics);
    });
    await batch.commit();
}
exports.updateContractMetricsForUsers = updateContractMetricsForUsers;
//# sourceMappingURL=user-contract-metrics.js.map