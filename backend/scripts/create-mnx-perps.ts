import { getApiUrl } from 'common/api/utils'
import { ENV, ENV_CONFIG } from 'common/envs/constants'
import { MNX_INSTRUMENTS } from 'common/perps/mnx'
import { HOUR_MS, YEAR_MS } from 'common/util/time'
import { getLocalEnv } from 'shared/init-admin'
import {
  getPerpLaunchCreatorId,
  MNX_LAUNCH_MARKETS,
} from 'shared/perps/launch-manifest'
import { fetchMnxSnapshot, requireMnxReady } from 'shared/mnx'
import { log } from 'shared/utils'
import { runScript } from './run-script'

// Default: inspect and print, with no writes. --apply only creates UNLISTED
// markets via the normal authenticated API in the explicitly selected environment.
if (require.main === module)
  runScript(async ({ pg }) => {
    const apply = process.argv.includes('--apply')
    if (
      !['DEV', 'PROD'].includes(process.env.NEXT_PUBLIC_FIREBASE_ENV ?? '') ||
      ENV !== getLocalEnv()
    )
      throw new Error(
        'Set NEXT_PUBLIC_FIREBASE_ENV explicitly to DEV or PROD and select the matching Firebase project'
      )
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
    const snapshot = await fetchMnxSnapshot()
    const unavailable: string[] = []
    const bodies = missing.flatMap((spec) => {
      let ready
      try {
        ready = requireMnxReady(snapshot, spec.feedId)
      } catch (error) {
        unavailable.push(spec.feedId)
        log.warn(
          `${spec.feedId}: not ready — ${
            error instanceof Error ? error.message : String(error)
          }`
        )
        return []
      }
      const recommended = MNX_LAUNCH_MARKETS.find(
        (m) => m.feedId === spec.feedId
      )!.recommended
      return {
        question: spec.question,
        description: `${spec.description}\n\nSource: ${spec.url}\nIf MNX ends this instrument, trading pauses pending administrative settlement; it will not automatically roll into a replacement.`,
        oracleFeedId: spec.feedId,
        visibility: 'unlisted' as const,
        maxLeverage: Math.min(recommended.maxLeverage, ready.maxLeverage!),
        subsidyLong: recommended.subsidyLong,
        subsidyShort: recommended.subsidyShort,
        maxOraclePriceAgeMs: recommended.maxOraclePriceAgeMs,
        fundingSensitivity: recommended.fundingSensitivity,
        maxFundingRate:
          (recommended.annualMaxFundingRate *
            Math.max(HOUR_MS, spec.updatePeriodMs)) /
          YEAR_MS,
      }
    })
    const total = bodies.reduce(
      (sum, body) => sum + body.subsidyLong + body.subsidyShort,
      0
    )
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
          unavailable,
        },
        null,
        2
      )
    )
    if (unavailable.length) {
      if (apply)
        throw new Error(
          'Creation aborted before any writes: some instruments are not ready'
        )
      process.exitCode = 1
    }
    if (!apply || !bodies.length) return
    if (Number(creator.balance) < total)
      throw new Error(`Insufficient backing: need M${total}`)
    const key = process.env.MANIFOLD_API_KEY
    if (!key)
      throw new Error('MANIFOLD_API_KEY for the official creator is required')
    const apiUrl = new URL(getApiUrl('create-perp'))
    if (
      apiUrl.host !== ENV_CONFIG.apiEndpoint &&
      !['localhost', '127.0.0.1', '[::1]'].includes(apiUrl.hostname)
    )
      throw new Error(
        'Refusing creation on an API outside the selected environment'
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
