import { escapeRegExp } from 'lodash'
import { DEV_CONFIG } from './dev'
import { EnvConfig, PROD_CONFIG } from './prod'
import { THEOREMONE_CONFIG } from './theoremone'

export const ENV = process.env.NEXT_PUBLIC_FIREBASE_ENV ?? 'PROD'

const CONFIGS: { [env: string]: EnvConfig } = {
  PROD: PROD_CONFIG,
  DEV: DEV_CONFIG,
  THEOREMONE: THEOREMONE_CONFIG,
}

export const ENV_CONFIG = CONFIGS[ENV]

export function isWhitelisted(email?: string) {
  if (!ENV_CONFIG.whitelistEmail) {
    return true
  }
  return email && (email.endsWith(ENV_CONFIG.whitelistEmail) || isAdmin(email))
}

// TODO: Before open sourcing, we should turn these into env vars
export function isAdmin(email?: string) {
  if (!email) {
    return false
  }
  return ENV_CONFIG.adminEmails.includes(email)
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
  'ArbitrageBot',
  'MarketManagerBot',
  'Botlab',
  'JuniorBot',
  'ManifoldDream',
]

export function firestoreConsolePath(contractId: string) {
  return `https://console.firebase.google.com/project/${PROJECT_ID}/firestore/data/~2Fcontracts~2F${contractId}`
}
