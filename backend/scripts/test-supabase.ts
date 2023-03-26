import { runScript } from 'run-script'
import { DAY_MS } from 'common/util/time'
import { getRecentContractLikes } from 'shared/supabase/likes'

if (require.main === module) {
  runScript(async ({ db }) => {
    const weekAgo = Date.now() - 7 * DAY_MS
    console.log(await getRecentContractLikes(db, weekAgo))
  })
}
