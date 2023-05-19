import { readFileSync } from 'fs'
import { SecretManagerServiceClient } from '@google-cloud/secret-manager'
import { zip } from 'lodash'

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
    'STRIPE_APIKEY',
    'STRIPE_WEBHOOKSECRET',
    'SUPABASE_KEY',
    'SUPABASE_JWT_SECRET',
    'SUPABASE_PASSWORD',
    'TEST_CREATE_USER_KEY',
    'NEWS_API_KEY',
    // Some typescript voodoo to keep the string literal types while being not readonly.
  ] as const
).concat()

type secret_names = typeof secrets[number]

// Get a secret from the environment. Be sure to await loadSecretsToEnv first.
export const getSecret = (secretName: secret_names) => {
  const secret = process.env[secretName]
  if (secret == null) {
    throw new Error(
      'Secret not found: ' +
        secretName +
        '. Is it in the secrets list (secrets.ts)? Did you call loadSecretsToEnv?'
    )
  }
  return secret
}

// Fetches all secrets from google cloud.
// For deployed google cloud service, no credential is needed.
// For local and Vercel deployments: requires credentials json object.
export const loadSecretsToEnv = async (credentials?: any) => {
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

  const fullSecretNames = secrets.map(
    (secret: string) =>
      `${client.projectPath(projectId)}/secrets/${secret}/versions/latest`
  )

  const secretResponses = await Promise.all(
    fullSecretNames.map((name) =>
      client.accessSecretVersion({
        name,
      })
    )
  )
  const secretValues = secretResponses.map(([response]) =>
    response.payload?.data?.toString()
  )

  for (const [key, value] of zip(secrets, secretValues)) {
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
  } catch (e) {
    throw new Error(`Failed to load service account key from ${keyPath}.`)
  }
}
