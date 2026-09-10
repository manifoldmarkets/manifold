import { MNX_INSTRUMENTS } from 'common/perps/mnx'
import { ENV } from 'common/envs/constants'
import { fetchMnxSnapshot } from 'shared/mnx'
import { getLocalEnv } from 'shared/init-admin'
import { getOracleFeed } from 'shared/oracle-feeds'
import { publishOracleObservation } from 'shared/perps/publish-oracle-observation'
import { log } from 'shared/utils'
import { runScript } from './run-script'

// A fresh process has no cached backoff. Dry-run by default; --apply publishes
// and waits for normal engine application, in the selected DEV or PROD env.
if (require.main === module)
  runScript(async ({ pg }) => {
    if (ENV !== getLocalEnv())
      throw new Error('Firebase and backend environments disagree')
    const snapshot = await fetchMnxSnapshot()
    const apply = process.argv.includes('--apply')
    for (const spec of MNX_INSTRUMENTS) {
      const observation = snapshot.feeds[spec.feedId]
      log(
        JSON.stringify({
          environment: ENV,
          apply,
          feedId: spec.feedId,
          ...observation,
        })
      )
      if (apply)
        await publishOracleObservation(
          pg,
          getOracleFeed(spec.feedId)!,
          observation
        )
    }
  })
