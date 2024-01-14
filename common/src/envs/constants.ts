import { escapeRegExp } from 'lodash'
import { DEV_CONFIG } from './dev'
import { EnvConfig, PROD_CONFIG } from './prod'

export const ELECTION_ENABLED = false

// Valid in web client & Vercel deployments only.
export const ENV = (process.env.NEXT_PUBLIC_FIREBASE_ENV ?? 'PROD') as
  | 'PROD'
  | 'DEV'

export const CONFIGS: { [env: string]: EnvConfig } = {
  PROD: PROD_CONFIG,
  DEV: DEV_CONFIG,
}

export const DASHBOARD_ENABLED = ENV === 'DEV'

export const ENV_CONFIG = CONFIGS[ENV]

export function isAdminId(id: string) {
  return ENV_CONFIG.adminIds.includes(id)
}

export function isModId(id: string) {
  return MOD_IDS.includes(id)
}
export const DOMAIN = ENV_CONFIG.domain
export const LOVE_DOMAIN = ENV_CONFIG.loveDomain
export const LOVE_DOMAIN_ALTERNATE = ENV_CONFIG.loveDomainAlternate
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
// Manifold love domain or any subdomains thereof
export const CORS_ORIGIN_MANIFOLD_LOVE = new RegExp(
  '^https?://(?:[a-zA-Z0-9\\-]+\\.)*' +
    escapeRegExp(ENV_CONFIG.loveDomain) +
    '$'
)
// Manifold love domain or any subdomains thereof
export const CORS_ORIGIN_MANIFOLD_LOVE_ALTERNATE = new RegExp(
  '^https?://(?:[a-zA-Z0-9\\-]+\\.)*' +
    escapeRegExp(ENV_CONFIG.loveDomainAlternate) +
    '$'
)

export const CORS_ORIGIN_CHARITY = new RegExp(
  '^https?://(?:[a-zA-Z0-9\\-]+\\.)*' + escapeRegExp('manifund.org') + '$'
)

// Vercel deployments, used for testing.
export const CORS_ORIGIN_VERCEL = new RegExp(
  '^https?://[a-zA-Z0-9\\-]+' + escapeRegExp('mantic.vercel.app') + '$'
)
// Any localhost server on any port
export const CORS_ORIGIN_LOCALHOST = /^http:\/\/localhost:\d+$/

// TODO: These should maybe be part of the env config?
export const BOT_USERNAMES = [
  'subooferbot',
  'TenShino',
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
  'NiciusBot',
  'Bot',
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
  'burkebot',
  'Botflux',
  '7',
  'hyperkaehler',
  'NcyBot',
  'ithaca',
  'GigaGaussian',
  'BottieMcBotface',
  'Seldon',
  'OnePercentBot',
  'arrbit',
  'ManaMaximizer',
  'rita',
  'uhh',
  'ArkPoint',
  'EliBot',
  'manifestussy',
  'mirrorbot',
  'JakeBot',
  'loopsbot',
  'breezybot',
  'echo',
  'Sayaka',
  'cc7',
  'Yuna',
  'ManifoldLove',
  'chooterb0t',
  'bonkbot',
  'NermitBundaloy',
  'FirstBot',
  'bawt',
  'FireTheCEO',
  'JointBot',
]

export const MOD_IDS = [
  '9hWkzPveXIelUk4XOrm5WroriST2', // a
  'H6b5PWELWfRV6HhyHAlCGq7yJJu2', // AndrewG
  'uyzAXSRdCCUWs4KstCLq2GfzAip2', // BoltonBailey
  '4aW01GHrlgafwAPLI1St7MPnOni1', // CarsonGale
  'EJQOCF3MfLTFYbhiKncrNefQDBz1', // chrisjbillington
  'MV9fTVHetcfp3h6CVYzpypIsbyN2', // CodeandSolder
  'HTbxWFlzWGeHUTiwZvvF0qm8W433', // Conflux
  '9dAaZrNSx5OT0su6rpusDoG9WPN2', // dglid
  '5XMvQhA3YgcTzyoJRiNqGWyuB9k2', // dreev
  'LJ7CB9fuYzZ5j8HieQxubQhRYYu2', // Duncn
  '946iB1LqFIR06G7d8q89um57PHh2', // egroj
  'hqdXgp0jK2YMMhPs067eFK4afEH3', // Eliza
  'kbHiTAGBahXdX9Z4sW29JpNrB0l2', // Ernie
  'W4yEF6idSMcNWEVUquowziSCZFI3', // EvanDaniel
  'zgCIqq8AmRUYVu6AdQ9vVEJN8On1', // firstuserhere
  '2VhlvfTaRqZbFn2jqxk2Am9jgsE2', // Gabrielle
  'cA1JupYR5AR8btHUs2xvkui7jA93', // Gen
  'y1hb6k7txdZPV5mgyxPFApZ7nQl2', // IsaacKing
  'TUk0ELR0SNV74OfRAOD48ciiS0W2', // itsTomekK
  'YGZdZUSFQyM8j2YzPaBqki8NBz23', // jack
  'cgrBqe2O3AU4Dnng7Nc9wuJHLKb2', // jskf
  'XeQf3ygmrGM1MxdsE3JSlmq8vL42', // Jacy
  'eSqS9cD5mzYcP2o7FrST8aC5IWn2', // JosephNoonan
  'JlVpsgzLsbOUT4pajswVMr0ZzmM2', // Joshua
  '7HhTMy4xECaVKvl5MmEAfVUkRCS2', // KevinBurke
  'fP5OQUWYt4MW17A2giGjMGsw1uu2', // LarsDoucet
  'k13AzY3mu8XTju3xRZV3P8qBjEC2', // LivInTheLookingGlass
  'lQdCwuc1OrZLUqgA4EwjPSSwG5Z2', // memestiny
  'b3WDWY8TdrhQKKNuJkNuvQKwHWE3', // MarcusAbramovitch
  'sA7V30Ic73XZtniboy2eKr6ekkn1', // MartinRandall
  'nEc7EizWpQSGO5y5A7H13TaE6Aw2', // MattP
  'AHf5jynaHbNiNiwoYx1UfhRMq3Q2', // MatthewBarnett
  'jO7sUhIDTQbAJ3w86akzncTlpRG2', // MichaelWheatley
  'lkkqZxiWCpOgtJ9ztJcAKz4d9y33', // NathanpmYoung
  'fSrex43BDjeneNZ4ZLfxllSb8b42', // NcyRocks
  '2DUMvA9R6nNXjQfyidwhKJitKBr2', // NoaNabeshima
  'mowZ7T5LBUQuy5CWgctdHMkLo8J3', // NuñoSempere
  'EzsnDabZsZTcpcD1UmChzRUn9Bk1', // PeterWildeford
  'FSqqnRObrqf0GX63gp5Hk4lUvqn1', // ScottLawrence
  'OEbsAczmbBc4Sl1bacYZNPJLLLc2', // SirCryptomind
  'YOILpFNyg0gGj79zBIBUpJigHQ83', // SneakySly
  'hUM4SO8a8qhfqT1gEZ7ElTCGSEz2', // Stralor
  'K0l9JnD5DcPqyfloiKWIHbK8klD3', // Tetraspace
  'VfvvoZdf0nZ6zM63ogTgeuPWSSo1', // TheSkeward
  'tO4DwIsujySUwtSnrr2hnU1WJtJ3', // WieDan
  'ps3zKQSRuzLJVMzDQMAOlCDFRgG2', // yaboi69
]

export const MVP = ['Eliza']
export const BTE_USER_ID = '4JuXgDx47xPagH5mcLDqLzUSN5g2'

export const VERIFIED_USERNAMES = [
  'EliezerYudkowsky',
  'ScottAlexander',
  'Aella',
  'ZviMowshowitz',
  'GavrielK',
  'CGPGrey',
  'LexFridman',
  'patio11',
  'RichardHanania',
  'Qualy',
  'Roko',
  'JonathanBlow',
  'DwarkeshPatel',
  'ByrneHobart',
  'RobertWiblin',
  'KelseyPiper',
  'SpencerGreenberg',
  'PaulChristiano',
  'BuckShlegeris',
  'Natalia',
  'zero',
  'OzzieGooen',
  'OliverHabryka',
  'Alicorn',
  'RazibKhan',
  'JamesMedlock',
  'Writer',
  'GeorgeHotz',
  'ShayneCoplan',
  'SanghyeonSeo',
  'KatjaGrace',
  'EmmettShear',
  'CateHall',
  'RobertSKMiles',
  'TarekMansour',
  'DylanMatthews',
  'RobinHanson',
  'KevinRoose18ac',
  'KnowNothing',
  'SantaPawsSSB',
  'AndersSandberg',
  'JosephWeisenthal',
  'BTE',
  'LawrenceLessig',
  'NatFriedman',
  'patrissimo',
  'postjawline',
  'MatthewYglesias',
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

export const BLOCKED_BY_DEFAULT_GROUP_SLUGS = ['nsfw']

export const DESTINY_GROUP_SLUGS = [
  'destinygg',
  'destinygg-stocks',
  'eto',
  'mumbowl-stonks',
]
export const PROD_MANIFOLD_LOVE_GROUP_SLUG = 'manifoldlove-relationships'
export const GROUP_SLUGS_TO_IGNORE_IN_MARKETS_EMAIL = [
  'manifold-features',
  'manifold-6748e065087e',
  'destinygg',
  'manifold-features-25bad7c7792e',
  'bugs',
  'manifold-leagues',
  'nonpredictive',
  'unsubsidized',
  PROD_MANIFOLD_LOVE_GROUP_SLUG,
]

export const DEEMPHASIZED_GROUP_SLUGS = [
  'fun',
  'selfresolving',
  'experimental',
  'trading-bots',
  'gambling',
  'free-money',
  'whale-watching',
  'spam',
  'test',
  'no-resolution',
  'eto',
  'friend-stocks',
  'austin-less-wrong-2023-predictions',
  'fantasy-football-stock-exchange',
  'ancient-markets',
  'jokes',
  'olivia',
  'planecrash',
  'glowfic',
  'all-stonks',
  'destinygg',
  'the-market',
  'nonpredictive-profits',
  'nonpredictive',
  'personal-goals',
  'personal',
  'rationalussy',
  'uk',
  'uk-politics',
  'crystal-ballin',
  ...GROUP_SLUGS_TO_IGNORE_IN_MARKETS_EMAIL,
  ...DESTINY_GROUP_SLUGS,
  ...BLOCKED_BY_DEFAULT_GROUP_SLUGS,
]

export const GROUP_SLUGS_TO_IGNORE_FOR_NEWS = DEEMPHASIZED_GROUP_SLUGS.filter(
  (slug) => ['uk', 'uk-politics'].includes(slug)
)

export const LIKELY_DUPLICATIVE_GROUP_SLUGS_ON_TOPICS_LIST = [
  // politics, 2024-presidential-election, magaland, donald-trump
  'us-politics',
  'republican-party',
  '2024-republican-primaries',
  'presidential-politics',
  // lk-99
  'superconductivity',
  // ai
  'openai',
  'technical-ai-timelines',
  // crypto-speculation
  'crypto-prices',
  // musk-mania
  'elon-musk',
  // ignore all manifold groups
  'manifold-user-retention',
  'manifold-6748e065087e',
  'manifold-leagues',
  'manifold-features-25bad7c7792e',
  'manifold-users',
  // generally not helpful for browsing
  'new-years-resolutions-2024',
]

export const GROUP_SLUGS_TO_HIDE_FROM_WELCOME_FLOW = [
  'new-years-resolutions-2024',
  'metamarkets',
  'magaland',
  'metaforecasting',
  'nonpredictive-profits',
  'nonpredictive',
  '-sircryptomind-crypto-stock',
  'selfresolving',
  'fun',
  'unranked',
  'bugs',
  'rationalussy',
  'personal',
  'world-default',
  'shortterm-markets',
  'global-macro',
  'video-games',
  'politics-default', // should follow US Politics instead
  '2024-us-presidential-election', // same
  'elon-musk', // listed as Elon Musk
  'elon-musk-14d9d9498c7e',
  'crypto-prices', // same as crypto,
  'technical-ai-timelines', // same as ai
  'presidential-politics', // same as politics
  'unsubsidized',
  PROD_MANIFOLD_LOVE_GROUP_SLUG,
]

export const EXTERNAL_REDIRECTS = ['/umami']

export const DISCORD_INVITE_LINK = 'https://discord.com/invite/eHQBNBqXuh'
export const DISCORD_BOT_INVITE_LINK =
  'https://discord.com/api/oauth2/authorize?client_id=1074829857537663098&permissions=328565385280&scope=bot%20applications.commands'

export const YES_GRAPH_COLOR = '#11b981'

export const RESERVED_PATHS = [
  '_next',
  'about',
  'ad',
  'add-funds',
  'ads',
  'analytics',
  'api',
  'browse',
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
  'dashboard',
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
  'manifest',
  'markets',
  'messages',
  'mtg',
  'news',
  'notifications',
  'og-test',
  'payments',
  'portfolio',
  'privacy',
  'profile',
  'public',
  'questions',
  'referral',
  'referrals',
  'send',
  'server-sitemap',
  'sign-in',
  'sign-in-waiting',
  'sitemap',
  'slack',
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
