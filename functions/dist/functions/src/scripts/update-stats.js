"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const script_init_1 = require("./script-init");
(0, script_init_1.initAdmin)();
const utils_1 = require("../utils");
const update_stats_1 = require("../update-stats");
async function updateStats() {
    (0, utils_1.logMemory)();
    (0, utils_1.log)('Updating stats...');
    await (0, update_stats_1.updateStatsCore)();
}
if (require.main === module) {
    updateStats().then(() => process.exit());
}
//# sourceMappingURL=update-stats.js.map