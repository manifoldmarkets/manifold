"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testscheduledfunction = void 0;
const api_1 = require("./api");
const utils_1 = require("./utils");
const mana_signup_bonus_1 = require("./mana-signup-bonus");
// Function for testing scheduled functions locally
exports.testscheduledfunction = (0, api_1.newEndpoint)({ method: 'GET', memory: '4GiB' }, async (_req) => {
    if ((0, utils_1.isProd)())
        throw new api_1.APIError(400, 'This function is only available in dev mode');
    (0, mana_signup_bonus_1.sendOneWeekManaBonuses)();
    return { success: true };
});
//# sourceMappingURL=test-scheduled-function.js.map