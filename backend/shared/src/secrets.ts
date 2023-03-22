import { SecretManagerServiceClient } from '@google-cloud/secret-manager'
import { zip } from 'lodash'
import { getServiceAccountCredentials } from './init-admin'

// List of secrets that are available to backend (api, functions, scripts, etc.)
// Edit them at:
// prod - https://console.cloud.google.com/security/secret-manager?project=mantic-markets
// dev - https://console.cloud.google.com/security/secret-manager?project=dev-mantic-markets
export const secrets = [
  'API_SECRET',
  'SUPABASE_KEY',
  'SUPABASE_PASSWORD',
  'MAILGUN_KEY',
  'DREAM_KEY',
  'OPENAI_API_KEY',
]

export const loadSecretsToEnv = async () => {
  const credentials = getServiceAccountCredentials()
  const projectId = credentials['project_id']
  const client = new SecretManagerServiceClient({
    credentials,
    projectId,
  })

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
      console.log(`Loaded secret: ${key}`, value)
    }
  }
}
