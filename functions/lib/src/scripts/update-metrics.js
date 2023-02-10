"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const script_init_1 = require("./script-init");
(0, script_init_1.initAdmin)();
const utils_1 = require("../utils");
const update_user_metrics_1 = require("../update-user-metrics");
const update_contract_metrics_1 = require("../update-contract-metrics");
const update_group_metrics_1 = require("../update-group-metrics");
async function updateMetrics() {
    (0, utils_1.log)('Updating user metrics...');
    await (0, update_user_metrics_1.updateUserMetrics)();
    (0, utils_1.log)('Updating contract metrics...');
    await (0, update_contract_metrics_1.updateContractMetrics)();
    (0, utils_1.log)('Updating group metrics...');
    await (0, update_group_metrics_1.updateGroupMetrics)();
}
if (require.main === module) {
    updateMetrics().then(() => process.exit());
}
//# sourceMappingURL=update-metrics.js.map