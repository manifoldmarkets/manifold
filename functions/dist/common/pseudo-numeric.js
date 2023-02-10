"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPseudoProbability = exports.getFormattedMappedValue = exports.getMappedValue = exports.formatNumericProbability = void 0;
const format_1 = require("./util/format");
function formatNumericProbability(p, contract) {
    const value = (0, exports.getMappedValue)(contract, p);
    return (0, format_1.formatLargeNumber)(value);
}
exports.formatNumericProbability = formatNumericProbability;
const getMappedValue = (contract, p) => {
    if (contract.outcomeType !== 'PSEUDO_NUMERIC')
        return p;
    const { min, max, isLogScale } = contract;
    if (isLogScale) {
        const logValue = p * Math.log10(max - min + 1);
        return 10 ** logValue + min - 1;
    }
    return p * (max - min) + min;
};
exports.getMappedValue = getMappedValue;
const getFormattedMappedValue = (contract, p) => {
    if (contract.outcomeType !== 'PSEUDO_NUMERIC')
        return (0, format_1.formatPercent)(p);
    const value = (0, exports.getMappedValue)(contract, p);
    return (0, format_1.formatLargeNumber)(value);
};
exports.getFormattedMappedValue = getFormattedMappedValue;
const getPseudoProbability = (value, min, max, isLogScale = false) => {
    if (value < min)
        return 0;
    if (value > max)
        return 1;
    if (isLogScale) {
        return Math.log10(value - min + 1) / Math.log10(max - min + 1);
    }
    return (value - min) / (max - min);
};
exports.getPseudoProbability = getPseudoProbability;
//# sourceMappingURL=pseudo-numeric.js.map