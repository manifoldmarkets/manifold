import { bulkUpdateData, getIds } from 'shared/supabase/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'

export async function updateGroupMetricsCore() {
  const pg = createSupabaseDirectClient()
  log('Loading group IDs...')
  const groupIds = await getIds(pg, 'groups')
  log(`Loaded ${groupIds.length} group IDs.`)

  log('Updating leaderboards...')

  const updates = groupIds.map((groupId) => {
    return {
      id: groupId,
    }
  })
  await bulkUpdateData(pg, 'groups', updates)
}
