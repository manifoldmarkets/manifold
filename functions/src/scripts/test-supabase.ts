import { initAdmin } from '../scripts/script-init'
initAdmin()

import { DAY_MS } from 'common/util/time'
import { createSupabaseClient } from 'functions/src/supabase/init'
const db = createSupabaseClient()

const main = async () => {
  const now = Date.now()
  const dayAgo = now - 1.5 * DAY_MS
  const contractId = 'yzDIwPeY3ZaZZjmynbjP'

  const response = await db
    .from('user_reactions')
    .select('*', { count: 'exact', head: true })
    .eq('data->>contentId', contractId)
    .gte('data->>createdTime', dayAgo)

  console.log('response', response, response.count)
}

if (require.main === module) main().then(() => process.exit())
