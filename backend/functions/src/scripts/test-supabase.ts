import { initAdmin } from './script-init'
initAdmin()

import { DAY_MS } from 'common/util/time'
import { createSupabaseClient } from 'shared/supabase/init'
import { getRecentContractLikes } from 'shared/supabase/likes'

const main = async () => {
  const db = createSupabaseClient()
  const now = Date.now()
  const weekAgo = now - 7 * DAY_MS

  console.log(await getRecentContractLikes(db, weekAgo))

  // const contractId = 'yzDIwPeY3ZaZZjmynbjP'
  // const response = await db
  //   .from('user_reactions')
  //   .select('*', { count: 'exact', head: true })
  //   .eq('data->>contentId', contractId)
  //   .gte('data->>createdTime', dayAgo)

  // const dayAgoLikes = await db.rpc('recently_liked_contract_counts' as any, { since: weekAgo })
}

if (require.main === module) main().then(() => process.exit())
