"use strict";
var _a, _b, _c, _d, _e;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PAST_BET = exports.PLURAL_BETS = exports.SINGULAR_BET = exports.BETTORS = exports.BETTOR = exports.MANIFOLD_AVATAR_URL = exports.MANIFOLD_USER_NAME = exports.MANIFOLD_USER_USERNAME = void 0;
const constants_1 = require("./envs/constants");
exports.MANIFOLD_USER_USERNAME = 'ManifoldMarkets';
exports.MANIFOLD_USER_NAME = 'ManifoldMarkets';
exports.MANIFOLD_AVATAR_URL = 'https://manifold.markets/logo-bg-white.png';
// TODO: remove. Hardcoding the strings would be better.
// Different views require different language.
exports.BETTOR = (_a = constants_1.ENV_CONFIG.bettor) !== null && _a !== void 0 ? _a : 'trader';
exports.BETTORS = (_b = constants_1.ENV_CONFIG.bettor + 's') !== null && _b !== void 0 ? _b : 'traders';
exports.SINGULAR_BET = (_c = constants_1.ENV_CONFIG.nounBet) !== null && _c !== void 0 ? _c : 'trade'; // prediction (noun)
exports.PLURAL_BETS = (_d = constants_1.ENV_CONFIG.nounBet + 's') !== null && _d !== void 0 ? _d : 'trades'; // predictions (noun)
// export const PRESENT_BET = ENV_CONFIG.presentBet ?? 'trade' // predict (verb)
exports.PAST_BET = (_e = constants_1.ENV_CONFIG.verbPastBet) !== null && _e !== void 0 ? _e : 'traded'; // predicted (verb)
//# sourceMappingURL=user.js.map