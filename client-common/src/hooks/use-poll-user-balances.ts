import { run } from 'common/supabase/utils'
import { useLiveUpdates } from './use-persistent-supabase-polling'
import { db } from 'common/supabase/db'

export const usePollUserBalances = (userIds: string[]) => {
  return useLiveUpdates(async () => {
    if (!userIds.length) return []
    const { data } = await run(
      db.from('users').select('id, balance').in('id', userIds)
    )
    return data
  })
}
