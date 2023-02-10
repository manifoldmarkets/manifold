"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXTERNAL_REDIRECTS = exports.HOME_BLOCKED_GROUP_SLUGS = exports.DESTINY_GROUP_SLUGS = exports.TEN_YEARS_SECS = exports.APPLE_APP_URL = exports.GOOGLE_PLAY_APP_URL = exports.firestoreConsolePath = exports.HOUSE_BOT_USERNAME = exports.CHECK_USERNAMES = exports.CORE_USERNAMES = exports.BOT_USERNAMES = exports.CORS_ORIGIN_LOCALHOST = exports.CORS_ORIGIN_VERCEL = exports.CORS_ORIGIN_MANIFOLD = exports.AUTH_COOKIE_NAME = exports.IS_PRIVATE_MANIFOLD = exports.PROJECT_ID = exports.FIREBASE_CONFIG = exports.DOMAIN = exports.isManifoldId = exports.isAdmin = exports.isWhitelisted = exports.ENV_CONFIG = exports.CONFIGS = exports.ENV = exports.BACKGROUND_COLOR = void 0;
const lodash_1 = require("lodash");
const dev_1 = require("./dev");
const prod_1 = require("./prod");
const theoremone_1 = require("./theoremone");
exports.BACKGROUND_COLOR = 'bg-gray-50';
exports.ENV = (_a = process.env.NEXT_PUBLIC_FIREBASE_ENV) !== null && _a !== void 0 ? _a : 'PROD';
exports.CONFIGS = {
    PROD: prod_1.PROD_CONFIG,
    DEV: dev_1.DEV_CONFIG,
    THEOREMONE: theoremone_1.THEOREMONE_CONFIG,
};
exports.ENV_CONFIG = exports.CONFIGS[exports.ENV];
function isWhitelisted(email) {
    if (!exports.ENV_CONFIG.whitelistEmail) {
        return true;
    }
    return email && (email.endsWith(exports.ENV_CONFIG.whitelistEmail) || isAdmin(email));
}
exports.isWhitelisted = isWhitelisted;
// TODO: Before open sourcing, we should turn these into env vars
function isAdmin(email) {
    if (!email) {
        return false;
    }
    return exports.ENV_CONFIG.adminEmails.includes(email);
}
exports.isAdmin = isAdmin;
function isManifoldId(userId) {
    return userId === 'IPTOzEqrpkWmEzh6hwvAyY9PqFb2';
}
exports.isManifoldId = isManifoldId;
exports.DOMAIN = exports.ENV_CONFIG.domain;
exports.FIREBASE_CONFIG = exports.ENV_CONFIG.firebaseConfig;
exports.PROJECT_ID = exports.ENV_CONFIG.firebaseConfig.projectId;
exports.IS_PRIVATE_MANIFOLD = exports.ENV_CONFIG.visibility === 'PRIVATE';
exports.AUTH_COOKIE_NAME = `FBUSER_${exports.PROJECT_ID.toUpperCase().replace(/-/g, '_')}`;
// Manifold's domain or any subdomains thereof
exports.CORS_ORIGIN_MANIFOLD = new RegExp('^https?://(?:[a-zA-Z0-9\\-]+\\.)*' + (0, lodash_1.escapeRegExp)(exports.ENV_CONFIG.domain) + '$');
// Vercel deployments, used for testing.
exports.CORS_ORIGIN_VERCEL = new RegExp('^https?://[a-zA-Z0-9\\-]+' + (0, lodash_1.escapeRegExp)('mantic.vercel.app') + '$');
// Any localhost server on any port
exports.CORS_ORIGIN_LOCALHOST = /^http:\/\/localhost:\d+$/;
// TODO: These should maybe be part of the env config?
exports.BOT_USERNAMES = [
    'pos',
    'v',
    'acc',
    'jerk',
    'snap',
    'ArbitrageBot',
    'MarketManagerBot',
    'Botlab',
    'JuniorBot',
    'ManifoldDream',
    'ManifoldBugs',
    'ACXBot',
    'JamesBot',
    'RyanBot',
    'trainbot',
    'runebot',
    'LiquidityBonusBot',
    '538',
    'FairlyRandom',
    'Anatolii',
    'JeremyK',
    'Botmageddon',
    'SmartBot',
    'ShifraGazsi',
    'Bot',
    'Catnee',
];
exports.CORE_USERNAMES = [
    'Austin',
    'JamesGrugett',
    'SG',
    'ian',
    'Sinclair',
    'Alice',
    'DavidChee',
    'mqp',
    'IngaWei',
    'ManifoldMarkets',
];
exports.CHECK_USERNAMES = [
    'EliezerYudkowsky',
    'memestiny',
    'ScottAlexander',
    'Aella',
    'BTE',
    'jack',
    'Yev',
    'ZviMowshowitz',
    'NathanpmYoung',
    'itsTomekK',
    'SneakySly',
    'IsaacKing',
    'MattP',
    'egroj',
    'dreev',
    'MartinRandall',
    'LivInTheLookingGlass',
    'LarsDoucet',
    'Conflux',
    'GavrielK',
    'NcyRocks',
    'MichaelWheatley',
    'dglid',
    'yaboi69',
    'TheSkeward',
    'Duncan',
    'a',
    'NuñoSempere',
    'CarsonGale',
    'Tetraspace',
    'BoltonBailey',
    'MatthewBarnett',
];
exports.HOUSE_BOT_USERNAME = 'acc';
function firestoreConsolePath(contractId) {
    return `https://console.firebase.google.com/project/${exports.PROJECT_ID}/firestore/data/~2Fcontracts~2F${contractId}`;
}
exports.firestoreConsolePath = firestoreConsolePath;
exports.GOOGLE_PLAY_APP_URL = 'https://play.google.com/store/apps/details?id=com.markets.manifold';
exports.APPLE_APP_URL = 'https://apps.apple.com/us/app/manifold-markets/id6444136749';
exports.TEN_YEARS_SECS = 60 * 60 * 24 * 365 * 10;
exports.DESTINY_GROUP_SLUGS = [
    'destinygg',
    'destinygg-stocks',
    'eto',
    'mumbowl-stonks',
];
exports.HOME_BLOCKED_GROUP_SLUGS = [
    'fun',
    'selfresolving',
    'experimental',
    'trading-bots',
    'gambling',
    'free-money',
    'whale-watching',
    'spam',
    'test',
    'private-markets',
    'proofniks',
];
exports.EXTERNAL_REDIRECTS = ['/umami'];
//# sourceMappingURL=constants.js.map