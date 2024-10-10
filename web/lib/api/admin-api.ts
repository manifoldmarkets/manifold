import { ENV } from 'common/envs/constants'
import { getSecrets, getServiceAccountCredentials } from 'common/secrets'

let apiSecret = process.env.API_SECRET

export async function initApiAdmin() {
  if (apiSecret == null) {
    console.warn(
      'Loading api key from GCP. (Should happen only locally, never in production!)'
    )
    const creds = getServiceAccountCredentials(ENV)
    const result = await getSecrets(creds, 'API_SECRET')
    apiSecret = result['API_SECRET']
  }
  if (apiSecret == null) {
    throw new Error('API_SECRET not found')
  }
  return apiSecret
}
