import { SecretManagerServiceClient } from '@google-cloud/secret-manager'
import { zip } from 'lodash'

// List of secrets that are available to backend (api, functions, scripts, etc.)
// Edit them at:
// prod - https://console.cloud.google.com/security/secret-manager?project=mantic-markets
// dev - https://console.cloud.google.com/security/secret-manager?project=dev-mantic-markets
export const secrets = [
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
]

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
