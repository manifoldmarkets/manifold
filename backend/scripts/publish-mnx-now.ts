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
    if (
      !['DEV', 'PROD'].includes(process.env.NEXT_PUBLIC_FIREBASE_ENV ?? '') ||
      ENV !== getLocalEnv()
    )
      throw new Error(
        'Set NEXT_PUBLIC_FIREBASE_ENV explicitly to DEV or PROD and select the matching Firebase project'
      )
    const snapshot = await fetchMnxSnapshot()
    const apply = process.argv.includes('--apply')
    const requested = process.argv
      .find((arg) => arg.startsWith('--feed='))
      ?.slice(7)
    const specs = MNX_INSTRUMENTS.filter(
      (spec) => !requested || spec.feedId === requested
    )
    if (!specs.length) throw new Error('Unknown MNX feed')
    let unavailable = 0
    for (const spec of specs) {
      const observation = snapshot.feeds[spec.feedId]
      log(
        JSON.stringify({
          environment: ENV,
          apply,
          feedId: spec.feedId,
          ...observation,
        })
      )
      if (observation.health.status !== 'available') unavailable++
      if (apply) {
        const published = await publishOracleObservation(
          pg,
          getOracleFeed(spec.feedId)!,
          observation
        )
        if (!published) process.exitCode = 1
      }
    }
    if (unavailable) process.exitCode = 1
  })
