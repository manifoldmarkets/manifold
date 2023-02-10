"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatOutcomeLabel = exports.toCamelCase = exports.shortFormatNumber = exports.formatLargeNumber = exports.formatPercentNumber = exports.formatPercent = exports.manaToUSD = exports.formatWithCommas = exports.formatMoneyWithDecimals = exports.getMoneyNumber = exports.formatMoneyNumber = exports.formatMoney = void 0;
const constants_1 = require("../envs/constants");
const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
});
function formatMoney(amount) {
    const newAmount = getMoneyNumber(amount);
    return formatter.format(newAmount).replace('$', constants_1.ENV_CONFIG.moneyMoniker);
}
exports.formatMoney = formatMoney;
function formatMoneyNumber(amount) {
    const newAmount = getMoneyNumber(amount);
    return formatter.format(newAmount).replace('$', '');
}
exports.formatMoneyNumber = formatMoneyNumber;
function getMoneyNumber(amount) {
    // Handle 499.9999999999999 case
    const plusEpsilon = (amount > 0 ? Math.floor : Math.ceil)(amount + 0.00000000001 * Math.sign(amount));
    return Math.round(plusEpsilon) === 0 ? 0 : plusEpsilon;
}
exports.getMoneyNumber = getMoneyNumber;
function formatMoneyWithDecimals(amount) {
    return constants_1.ENV_CONFIG.moneyMoniker + amount.toFixed(2);
}
exports.formatMoneyWithDecimals = formatMoneyWithDecimals;
function formatWithCommas(amount) {
    return formatter.format(Math.floor(amount)).replace('$', '');
}
exports.formatWithCommas = formatWithCommas;
function manaToUSD(mana) {
    return (mana / 100).toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
    });
}
exports.manaToUSD = manaToUSD;
function getPercentDecimalPlaces(zeroToOne) {
    return zeroToOne < 0.02 || zeroToOne > 0.98 ? 1 : 0;
}
function formatPercent(zeroToOne, shortFormat = false) {
    // Show 1 decimal place if <2% or >98%, giving more resolution on the tails
    const decimalPlaces = shortFormat ? 0 : getPercentDecimalPlaces(zeroToOne);
    const percent = shortFormat ? Math.min(zeroToOne * 100, 99) : zeroToOne * 100;
    return percent.toFixed(decimalPlaces) + '%';
}
exports.formatPercent = formatPercent;
function formatPercentNumber(zeroToOne) {
    // Show 1 decimal place if <2% or >98%, giving more resolution on the tails
    const decimalPlaces = getPercentDecimalPlaces(zeroToOne);
    return Number((zeroToOne * 100).toFixed(decimalPlaces));
}
exports.formatPercentNumber = formatPercentNumber;
const showPrecision = (x, sigfigs) => 
// convert back to number for weird formatting reason
`${Number(x.toPrecision(sigfigs))}`;
// Eg 1234567.89 => 1.23M; 5678 => 5.68K
function formatLargeNumber(num, sigfigs = 2) {
    var _a;
    const absNum = Math.abs(num);
    if (absNum < 1)
        return showPrecision(num, sigfigs);
    if (absNum < 100)
        return showPrecision(num, 2);
    if (absNum < 1000)
        return showPrecision(num, 3);
    if (absNum < 10000)
        return showPrecision(num, 4);
    const suffix = ['', 'K', 'M', 'B', 'T', 'Q'];
    const i = Math.floor(Math.log10(absNum) / 3);
    const numStr = showPrecision(num / Math.pow(10, 3 * i), sigfigs);
    return `${numStr}${(_a = suffix[i]) !== null && _a !== void 0 ? _a : ''}`;
}
exports.formatLargeNumber = formatLargeNumber;
function shortFormatNumber(num) {
    var _a;
    if (num < 1000)
        return showPrecision(num, 3);
    const suffix = ['', 'K', 'M', 'B', 'T', 'Q'];
    const i = Math.floor(Math.log10(num) / 3);
    const numStr = showPrecision(num / Math.pow(10, 3 * i), 2);
    return `${numStr}${(_a = suffix[i]) !== null && _a !== void 0 ? _a : ''}`;
}
exports.shortFormatNumber = shortFormatNumber;
function toCamelCase(words) {
    var _a;
    const camelCase = words
        .split(' ')
        .map((word) => word.trim())
        .filter((word) => word)
        .map((word, index) => index === 0 ? word : word[0].toLocaleUpperCase() + word.substring(1))
        .join('');
    // Remove non-alpha-numeric-underscore chars.
    const regex = /(?:^|\s)(?:[a-z0-9_]+)/gi;
    return (_a = (camelCase.match(regex) || [])[0]) !== null && _a !== void 0 ? _a : '';
}
exports.toCamelCase = toCamelCase;
const formatOutcomeLabel = (contract, outcomeLabel) => {
    if (contract.outcomeType === 'BINARY') {
        return outcomeLabel;
    }
    return outcomeLabel === 'YES' ? 'HIGHER' : 'LOWER';
};
exports.formatOutcomeLabel = formatOutcomeLabel;
//# sourceMappingURL=format.js.map