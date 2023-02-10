"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNewLiquidityProvision = void 0;
const calculate_cpmm_1 = require("./calculate-cpmm");
const getNewLiquidityProvision = (userId, amount, contract, newLiquidityProvisionId) => {
    const { pool, p, totalLiquidity, subsidyPool } = contract;
    const liquidity = (0, calculate_cpmm_1.getCpmmLiquidity)(pool, p);
    const newLiquidityProvision = {
        id: newLiquidityProvisionId,
        userId: userId,
        contractId: contract.id,
        amount,
        pool,
        liquidity,
        createdTime: Date.now(),
    };
    const newTotalLiquidity = (totalLiquidity !== null && totalLiquidity !== void 0 ? totalLiquidity : 0) + amount;
    const newSubsidyPool = (subsidyPool !== null && subsidyPool !== void 0 ? subsidyPool : 0) + amount;
    return { newLiquidityProvision, newTotalLiquidity, newSubsidyPool };
};
exports.getNewLiquidityProvision = getNewLiquidityProvision;
//# sourceMappingURL=add-liquidity.js.map