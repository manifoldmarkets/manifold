"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noFees = exports.DPM_FEES = exports.DPM_CREATOR_FEE = exports.DPM_PLATFORM_FEE = exports.LIQUIDITY_FEE = exports.CREATOR_FEE = exports.PLATFORM_FEE = exports.FLAT_TRADE_FEE = void 0;
exports.FLAT_TRADE_FEE = 0.1; // Ṁ0.1
exports.PLATFORM_FEE = 0;
exports.CREATOR_FEE = 0;
exports.LIQUIDITY_FEE = 0;
exports.DPM_PLATFORM_FEE = 0.0;
exports.DPM_CREATOR_FEE = 0.0;
exports.DPM_FEES = exports.DPM_PLATFORM_FEE + exports.DPM_CREATOR_FEE;
exports.noFees = {
    creatorFee: 0,
    platformFee: 0,
    liquidityFee: 0,
};
//# sourceMappingURL=fees.js.map