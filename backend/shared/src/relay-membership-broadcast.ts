import { getApiUrl, pathWithPrefix } from 'common/api/utils'
import { CONFIGS } from 'common/envs/constants'
import { LOCAL_DEV, LOCAL_ONLY, log } from 'shared/utils'

// Only the API writer has browser sockets. Send the user ID so the writer
// can read the current membership and balance when the request arrives.
export async function relayMembershipBroadcast(
  userId: string,
  scriptEnv?: 'PROD' | 'DEV'
): Promise<void> {
  // runScript can target remote Firebase/Supabase from a developer machine.
  if (LOCAL_ONLY || (LOCAL_DEV && !scriptEnv)) return
  const apiSecret = process.env.API_SECRET
  if (!apiSecret) {
    log.error('API_SECRET missing, skipping membership broadcast', { userId })
    return
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 2_000)
  try {
    const path = 'internal-membership-broadcast'
    const url = scriptEnv
      ? `https://${CONFIGS[scriptEnv].apiEndpoint}/${pathWithPrefix(path)}`
      : getApiUrl(path)
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiSecret, userId }),
      signal: controller.signal,
    })
    await response.arrayBuffer()
    if (!response.ok)
      log.error('Membership broadcast failed', {
        userId,
        status: response.status,
      })
  } catch (error) {
    log.error('Membership broadcast failed', { userId, error })
  } finally {
    clearTimeout(timeout)
  }
}
