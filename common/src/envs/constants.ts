import { escapeRegExp } from 'lodash'
import { DEV_CONFIG } from './dev'
import { EnvConfig, PROD_CONFIG } from './prod'

// Valid in web client & Vercel deployments only.
export const ENV = (process.env.NEXT_PUBLIC_FIREBASE_ENV ?? 'PROD') as
  | 'PROD'
  | 'DEV'

export const CONFIGS: { [env: string]: EnvConfig } = {
  PROD: PROD_CONFIG,
  DEV: DEV_CONFIG,
}

export const ENV_CONFIG = CONFIGS[ENV]

// Note: Checking for admin or trustworthy permissions is kind of a code mess
// atm; should pull this into an enum inside the user object?
export function isAdmin(email?: string) {
  if (!email) {
    return false
  }
  return ENV_CONFIG.adminEmails.includes(email)
}

export function isTrustworthy(username?: string) {
  if (!username) {
    return false
  }
  return CHECK_USERNAMES.includes(username)
}

export function isManifoldId(userId: string) {
  return userId === 'IPTOzEqrpkWmEzh6hwvAyY9PqFb2'
}

export const DOMAIN = ENV_CONFIG.domain
export const FIREBASE_CONFIG = ENV_CONFIG.firebaseConfig
export const PROJECT_ID = ENV_CONFIG.firebaseConfig.projectId
export const IS_PRIVATE_MANIFOLD = ENV_CONFIG.visibility === 'PRIVATE'

export const AUTH_COOKIE_NAME = `FBUSER_${PROJECT_ID.toUpperCase().replace(
  /-/g,
  '_'
)}`

// Manifold's domain or any subdomains thereof
export const CORS_ORIGIN_MANIFOLD = new RegExp(
  '^https?://(?:[a-zA-Z0-9\\-]+\\.)*' + escapeRegExp(ENV_CONFIG.domain) + '$'
)
// Vercel deployments, used for testing.
export const CORS_ORIGIN_VERCEL = new RegExp(
  '^https?://[a-zA-Z0-9\\-]+' + escapeRegExp('mantic.vercel.app') + '$'
)
// Any localhost server on any port
export const CORS_ORIGIN_LOCALHOST = /^http:\/\/localhost:\d+$/

// TODO: These should maybe be part of the env config?
export const BOT_USERNAMES = [
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
  'Mason',
  'VersusBot',
  'GPT4',
  'EntropyBot',
  'veat',
  'ms_test',
  'arb',
  'Turbot',
  'MiraBot',
  'MetaculusBot',
  'KevinBurke',
  'Botflux',
]

export const CORE_USERNAMES = [
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
]

export const CHECK_USERNAMES = [
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
  'Duncn',
  'a',
  'NuñoSempere',
  'CarsonGale',
  'Tetraspace',
  'BoltonBailey',
  'MatthewBarnett',
  'JacyAnthis',
  'Gabrielle',
  'CGPGrey',
  'KatjaGrace',
  'AndrewG',
  'MarcusAbramovitch',
]

export const HOUSE_BOT_USERNAME = 'acc'

export function firestoreConsolePath(contractId: string) {
  return `https://console.firebase.google.com/project/${PROJECT_ID}/firestore/data/~2Fcontracts~2F${contractId}`
}

export const GOOGLE_PLAY_APP_URL =
  'https://play.google.com/store/apps/details?id=com.markets.manifold'
export const APPLE_APP_URL =
  'https://apps.apple.com/us/app/manifold-markets/id6444136749'

export const TEN_YEARS_SECS = 60 * 60 * 24 * 365 * 10

export const DESTINY_GROUP_SLUGS = [
  'destinygg',
  'destinygg-stocks',
  'eto',
  'mumbowl-stonks',
]

export const HOME_BLOCKED_GROUP_SLUGS = [
  'fun',
  'selfresolving',
  'experimental',
  'trading-bots',
  'gambling',
  'free-money',
  'whale-watching',
  'spam',
  'test',
]

export const EXTERNAL_REDIRECTS = ['/umami']

export const DISCORD_INVITE_LINK = 'https://discord.com/invite/eHQBNBqXuh'
export const DISCORD_BOT_INVITE_LINK =
  'https://discord.com/api/oauth2/authorize?client_id=1074829857537663098&permissions=328565385280&scope=bot%20applications.commands'

export const YES_GRAPH_COLOR = '#11b981'

export const BACKGROUND_COLOR = 'bg-canvas-50'

export const RESERVED_PATHS = [
  '_next',
  'about',
  'ad',
  'add-funds',
  'ads',
  'analytics',
  'api',
  'calibration',
  'card',
  'cards',
  'career',
  'careers',
  'charity',
  'common',
  'contact',
  'contacts',
  'cowp',
  'create',
  'date-docs',
  'discord',
  'discord-bot',
  'dream',
  'embed',
  'facebook',
  'find',
  'github',
  'google',
  'group',
  'groups',
  'help',
  'home',
  'jobs',
  'latestposts',
  'leaderboard',
  'leaderboards',
  'league',
  'leagues',
  'link',
  'linkAccount',
  'links',
  'live',
  'login',
  'lootbox',
  'mana-auction',
  'markets',
  'mtg',
  'notifications',
  'privacy',
  'profile',
  'public',
  'q-and-a',
  'referral',
  'referrals',
  'send',
  'server-sitemap',
  'sign-in',
  'sign-in-waiting',
  'sitemap',
  'slack',
  'static',
  'stats',
  'styles',
  'swipe',
  'team',
  'terms',
  'tournament',
  'tournaments',
  'twitch',
  'twitter',
  'umami',
  'user',
  'users',
  'versus',
  'web',
  'welcome',
]
