import { getApiUrl } from 'common/api/utils'
import { ENV, ENV_CONFIG } from 'common/envs/constants'
import { MNX_INSTRUMENTS } from 'common/perps/mnx'
import { HOUR_MS, YEAR_MS } from 'common/util/time'
import { getLocalEnv } from 'shared/init-admin'
import { getPerpLaunchCreatorId } from 'shared/perps/launch-manifest'
import { readMnxSnapshot, requireMnxReady } from 'shared/perps/publish-mnx'
import { log } from 'shared/utils'
import { runScript } from './run-script'

// Default: inspect and print, with no writes. --apply only creates UNLISTED
// DEV markets via the normal authenticated API. No production creation path.
if (require.main === module)
  runScript(async ({ pg }) => {
    const apply = process.argv.includes('--apply')
    if (ENV !== getLocalEnv())
      throw new Error('Firebase and backend environments disagree')
    if (apply && ENV !== 'DEV')
      throw new Error('MNX market creation is DEV-only')
    const existing = await pg.manyOrNone<{ feed_id: string; id: string }>(
      `select data->>'oracleFeedId' as feed_id, id from contracts
     where mechanism = 'perp' and resolution_time is null
       and data->>'oracleFeedId' = any($1)`,
      [MNX_INSTRUMENTS.map((i) => i.feedId)]
    )
    const missing = MNX_INSTRUMENTS.filter((spec) => {
      const matches = existing.filter((c) => c.feed_id === spec.feedId)
      if (matches.length > 1)
        throw new Error(`Duplicate live markets: ${spec.feedId}`)
      if (matches.length)
        log(`Already exists: ${spec.feedId} (${matches[0].id})`)
      return matches.length === 0
    })
    const snapshot = await readMnxSnapshot(pg)
    const bodies = missing.map((spec) => {
      const ready = requireMnxReady(snapshot, spec.feedId)
      return {
        question: spec.question,
        description: `${spec.description}\n\nSource: ${spec.url}\nIf MNX ends this instrument, trading pauses pending administrative settlement; it will not automatically roll into a replacement.`,
        oracleFeedId: spec.feedId,
        visibility: 'unlisted' as const,
        maxLeverage: ready.maxLeverage,
        subsidyLong: 25_000,
        subsidyShort: 25_000,
        maxOraclePriceAgeMs: spec.maxAgeMs,
        fundingSensitivity: 1,
        maxFundingRate: HOUR_MS / YEAR_MS,
      }
    })
    const total = bodies.length * 50_000
    const creatorId = getPerpLaunchCreatorId(ENV)
    const creator = await pg.one<{ balance: number }>(
      `select balance from users where id = $1`,
      [creatorId]
    )
    log(
      JSON.stringify(
        {
          environment: ENV,
          apply,
          creatorId,
          backingRequired: total,
          available: creator.balance,
          markets: bodies,
        },
        null,
        2
      )
    )
    if (!apply || !bodies.length) return
    if (Number(creator.balance) < total)
      throw new Error(`Insufficient backing: need M${total}`)
    const key = process.env.MANIFOLD_API_KEY
    if (!key)
      throw new Error(
        'MANIFOLD_API_KEY for the official DEV creator is required'
      )
    const apiUrl = new URL(getApiUrl('create-perp'))
    if (
      !['localhost', '127.0.0.1', '[::1]', ENV_CONFIG.apiEndpoint].includes(
        apiUrl.host
      ) &&
      !['localhost', '127.0.0.1', '[::1]'].includes(apiUrl.hostname)
    )
      throw new Error(
        'Refusing creation on an API outside the selected DEV environment'
      )
    const headers = {
      Authorization: `Key ${key}`,
      'Content-Type': 'application/json',
    }
    const me = await fetch(getApiUrl('me'), {
      headers,
      signal: AbortSignal.timeout(10_000),
    })
    if (!me.ok || (await me.json()).id !== creatorId)
      throw new Error('API key does not belong to the official creator')
    for (const body of bodies) {
      const response = await fetch(getApiUrl('create-perp'), {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      })
      if (!response.ok)
        throw new Error(
          `Creation failed for ${body.oracleFeedId}: HTTP ${response.status}. Stop and rerun inspection before retrying.`
        )
      const market = await response.json()
      log(`Created unlisted ${body.oracleFeedId}: ${market.id}`)
    }
  })
