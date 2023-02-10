"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const script_init_1 = require("./script-init");
(0, script_init_1.initAdmin)();
const drizzle_liquidity_1 = require("../drizzle-liquidity");
if (require.main === module) {
    (0, drizzle_liquidity_1.drizzleLiquidity)().then(() => process.exit());
}
//# sourceMappingURL=drizzle.js.map