import * as functions from 'firebase-functions'
import { getCloudRunServiceUrl } from 'common/api'
import { invokeFunction } from 'shared/utils'
import { onRequest } from 'firebase-functions/v2/https'

export const repackSupabaseScheduled = functions.pubsub
  // 2am on monday
  .schedule('0 2 * * 1')
  .timeZone('America/Los_Angeles')
  .onRun(async () => {
    try {
      console.log(await invokeFunction('repacksupabase'))
    } catch (e) {
      console.error(e)
    }
  })

export const repacksupabase = onRequest(
  { timeoutSeconds: 3600, memory: '128MiB' },
  async (_req, res) => {
    console.log('Running repackSupabase...')
    await runRepackSupabase()
    res.status(200).json({ success: true })
  }
)

export async function runRepackSupabase() {
  return fetch(getCloudRunServiceUrl('supabase-replicator') + '/repack', {
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
}
