"use strict";
var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_TRADERS_FOR_BONUS = exports.UNIQUE_BETTOR_LIQUIDITY = exports.FREE_MARKETS_PER_USER_MAX = exports.BETTING_STREAK_RESET_HOUR = exports.BETTING_STREAK_BONUS_MAX = exports.BETTING_STREAK_BONUS_AMOUNT = exports.UNIQUE_BETTOR_BONUS_AMOUNT = exports.REFERRAL_AMOUNT = exports.SUS_STARTING_BALANCE = exports.STARTING_BONUS = exports.STARTING_BALANCE = exports.ANTES = exports.FIXED_ANTE = void 0;
const constants_1 = require("./envs/constants");
const econ = constants_1.ENV_CONFIG.economy;
exports.FIXED_ANTE = (_a = econ === null || econ === void 0 ? void 0 : econ.FIXED_ANTE) !== null && _a !== void 0 ? _a : 50;
exports.ANTES = {
    BINARY: exports.FIXED_ANTE,
    MULTIPLE_CHOICE: exports.FIXED_ANTE * 2,
    FREE_RESPONSE: exports.FIXED_ANTE * 2,
    PSEUDO_NUMERIC: exports.FIXED_ANTE * 5,
    NUMERIC: exports.FIXED_ANTE * 5,
    CERT: exports.FIXED_ANTE * 10,
    QUADRATIC_FUNDING: exports.FIXED_ANTE * 10,
};
exports.STARTING_BALANCE = (_b = econ === null || econ === void 0 ? void 0 : econ.STARTING_BALANCE) !== null && _b !== void 0 ? _b : 500;
exports.STARTING_BONUS = (_c = econ === null || econ === void 0 ? void 0 : econ.STARTING_BONUS) !== null && _c !== void 0 ? _c : 500;
// for sus users, i.e. multiple sign ups for same person
exports.SUS_STARTING_BALANCE = (_d = econ === null || econ === void 0 ? void 0 : econ.SUS_STARTING_BALANCE) !== null && _d !== void 0 ? _d : 10;
exports.REFERRAL_AMOUNT = (_e = econ === null || econ === void 0 ? void 0 : econ.REFERRAL_AMOUNT) !== null && _e !== void 0 ? _e : 250;
exports.UNIQUE_BETTOR_BONUS_AMOUNT = (_f = econ === null || econ === void 0 ? void 0 : econ.UNIQUE_BETTOR_BONUS_AMOUNT) !== null && _f !== void 0 ? _f : 10;
exports.BETTING_STREAK_BONUS_AMOUNT = (_g = econ === null || econ === void 0 ? void 0 : econ.BETTING_STREAK_BONUS_AMOUNT) !== null && _g !== void 0 ? _g : 10;
exports.BETTING_STREAK_BONUS_MAX = (_h = econ === null || econ === void 0 ? void 0 : econ.BETTING_STREAK_BONUS_MAX) !== null && _h !== void 0 ? _h : 50;
exports.BETTING_STREAK_RESET_HOUR = (_j = econ === null || econ === void 0 ? void 0 : econ.BETTING_STREAK_RESET_HOUR) !== null && _j !== void 0 ? _j : 7;
exports.FREE_MARKETS_PER_USER_MAX = (_k = econ === null || econ === void 0 ? void 0 : econ.FREE_MARKETS_PER_USER_MAX) !== null && _k !== void 0 ? _k : 5;
exports.UNIQUE_BETTOR_LIQUIDITY = 20;
exports.MAX_TRADERS_FOR_BONUS = 100;
//# sourceMappingURL=economy.js.map