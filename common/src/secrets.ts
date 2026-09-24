import { readFileSync } from 'fs'
import { SecretManagerServiceClient } from '@google-cloud/secret-manager'

// List of secrets that are available to backend (api, functions, scripts, etc.)
// Edit them at:
// prod - https://console.cloud.google.com/security/secret-manager?project=mantic-markets
// dev - https://console.cloud.google.com/security/secret-manager?project=dev-mantic-markets
export const secrets = (
  [
    'API_SECRET',
    'DREAM_KEY',
    'MAILGUN_KEY',
    'OPENAI_API_KEY',
    'SCHEDULER_AUTH_PASSWORD',
    'STRIPE_APIKEY',
    'STRIPE_WEBHOOKSECRET',
    'SUPABASE_KEY',
    'SUPABASE_JWT_SECRET',
    'SUPABASE_PASSWORD',
    'TEST_CREATE_USER_KEY',
    'NEWS_API_KEY',
    'REACT_APP_GIPHY_KEY',
    'TWITTER_API_KEY_JSON',
    'DESTINY_API_KEY',
    'FB_ACCESS_TOKEN',
    'GEODB_API_KEY',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_SID',
    'TWILIO_VERIFY_SID',
    // DEPRECATED: GIDX replaced by idenfy for identity verification
    'GIDX_API_KEY',
    'GIDX_MERCHANT_ID',
    'GIDX_PRODUCT_TYPE_ID',
    'GIDX_DEVICE_TYPE_ID',
    'GIDX_ACTIVITY_TYPE_ID',
    'ANTHROPIC_API_KEY',
    'PERPLEXITY_API_KEY',
    'FIRECRAWL_API_KEY',
    'SPORTSDB_KEY',
    'FOOTBALL_DATA_API_KEY',
    'THE_ODDS_API_KEY',
    'VERIFIED_PHONE_NUMBER',
    'GEMINI_API_KEY',
    'OPENROUTER_API_KEY',
    'IDENFY_API_KEY',
    'IDENFY_API_SECRET',
    'IDENFY_CALLBACK_SECRET',
    'DAIMO_WEBHOOK_SECRET',
    'DAIMO_API_KEY',
    'DAIMO_HOT_WALLET_ADDRESS',
    'IP_API_PRO_KEY',
    'PRINTFUL_API_TOKEN',
    'PRINTFUL_WEBHOOK_SECRET',
    // Stripe Product/Coupon IDs for the "20% off 5,000 mana" personalized
    // offer (M5K for $40 via a $50 Price + 20%-off Coupon). The Coupon is
    // restricted to the matching Product (applies_to.products) so the
    // per-offer Promotion Codes can't cross-apply to standard mana tiers.
    // Test-mode IDs in dev project, live-mode IDs in prod project — same
    // secret names. Variants for other offer sizes/discounts would get
    // parallel names (e.g. STRIPE_15_OFF_10K_PRICE_ID).
    'STRIPE_20_OFF_5K_PRICE_ID',
    'STRIPE_20_OFF_5K_COUPON_ID',
    // Some typescript voodoo to keep the string literal types while being not readonly.
  ] as const
).concat()

type SecretId = (typeof secrets)[number]

// Secrets a project may not have yet. A missing one is skipped, so the code
// that reads it sees it unset, instead of stopping the API and scheduler from
// starting. Only list integrations that already cope with a missing key.
const OPTIONAL_SECRETS: ReadonlySet<string> = new Set<SecretId>([
  // The Odds API sports jobs skip themselves without it.
  'THE_ODDS_API_KEY',
])

// gRPC status code for NOT_FOUND.
const GRPC_NOT_FOUND = 5

// Fetches all secrets from google cloud.
// For deployed google cloud service, no credential is needed.
// For local and Vercel deployments: requires credentials json object.
export const getSecrets = async (credentials?: any, ...ids: SecretId[]) => {
  let client: SecretManagerServiceClient
  if (credentials) {
    const projectId = credentials['project_id']
    client = new SecretManagerServiceClient({
      credentials,
      projectId,
    })
  } else {
    client = new SecretManagerServiceClient()
  }
  const projectId = await client.getProjectId()

  const secretIds = ids.length > 0 ? ids : secrets

  const secretValues = await Promise.all(
    secretIds.map(async (secret: string) => {
      const name = `${client.projectPath(
        projectId
      )}/secrets/${secret}/versions/latest`
      try {
        const [response] = await client.accessSecretVersion({ name })
        return response.payload!.data!.toString()
      } catch (e) {
        if (
          OPTIONAL_SECRETS.has(secret) &&
          (e as { code?: number })?.code === GRPC_NOT_FOUND
        ) {
          console.warn(`Optional secret ${secret} not found; leaving it unset.`)
          return undefined
        }
        throw e
      }
    })
  )
  const result: { [secret: string]: string } = {}
  secretIds.forEach((secret, i) => {
    const value = secretValues[i]
    if (value !== undefined) result[secret] = value
  })
  return result
}

// Fetches all secrets and loads them into process.env.
// Useful for running random backend code.
export const loadSecretsToEnv = async (credentials?: any) => {
  const allSecrets = await getSecrets(credentials)
  for (const [key, value] of Object.entries(allSecrets)) {
    if (key && value) {
      process.env[key] = value
    }
  }
}

// Get service account credentials from Vercel environment variable or local file.
export const getServiceAccountCredentials = (env: 'PROD' | 'DEV') => {
  // Vercel environment variable for service credential.
  const value =
    env === 'PROD'
      ? process.env.PROD_FIREBASE_SERVICE_ACCOUNT_KEY
      : process.env.DEV_FIREBASE_SERVICE_ACCOUNT_KEY
  if (value) {
    return JSON.parse(value)
  }

  // Local environment variable for service credential.
  const envVar = `GOOGLE_APPLICATION_CREDENTIALS_${env}`
  const keyPath = process.env[envVar]
  if (keyPath == null) {
    throw new Error(
      `Please set the ${envVar} environment variable to contain the path to your ${env} environment key file.`
    )
  }

  try {
    return JSON.parse(readFileSync(keyPath, { encoding: 'utf8' }))
  } catch {
    throw new Error(`Failed to load service account key from ${keyPath}.`)
  }
}
