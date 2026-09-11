import { getApiUrl } from 'common/api/utils'
import { ENV, ENV_CONFIG } from 'common/envs/constants'
import {
  DEFAULT_PERP_CREATOR_ACCOUNT,
  PERP_CREATOR_ACCOUNT_LABELS,
  PERP_CREATOR_ACCOUNTS,
  PerpCreatorAccount,
} from 'common/perps/creator-accounts'
import { MNX_INSTRUMENTS } from 'common/perps/mnx'
import { getPerpFeedTicker } from 'common/perps/ticker'
import { HOUR_MS, YEAR_MS } from 'common/util/time'
import { getLocalEnv } from 'shared/init-admin'
import { resolvePerpCreatorAccount } from 'shared/perps/creator-accounts'
import {
  getPerpLaunchCreatorId,
  MNX_LAUNCH_MARKETS,
} from 'shared/perps/launch-manifest'
import { fetchMnxSnapshot, requireMnxReady } from 'shared/mnx'
import { log } from 'shared/utils'
import { runScript } from './run-script'

// Default: inspect and print, with no writes. --apply only creates UNLISTED
// markets via the normal authenticated API in the explicitly selected environment.
// --creator=mnx makes the MNX partner account the owner (it pays the backing
// and receives the residual); the API key must still belong to the official
// Manifold creator, which is the only caller create-perp accepts.
if (require.main === module)
  runScript(async ({ pg }) => {
    const apply = process.argv.includes('--apply')
    const creatorAccount = (process.argv
      .find((arg) => arg.startsWith('--creator='))
      ?.slice('--creator='.length) ??
      DEFAULT_PERP_CREATOR_ACCOUNT) as PerpCreatorAccount
    if (!PERP_CREATOR_ACCOUNTS.includes(creatorAccount))
      throw new Error(
        `Unknown --creator; expected one of ${PERP_CREATOR_ACCOUNTS.join(', ')}`
      )
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
        ticker: getPerpFeedTicker(spec.feedId),
        creatorAccount,
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
    const callerId = getPerpLaunchCreatorId(ENV)
    const owner = await resolvePerpCreatorAccount(creatorAccount, ENV, pg)
    if (!owner.user)
      throw new Error(
        `Cannot create as ${PERP_CREATOR_ACCOUNT_LABELS[creatorAccount]}: ${owner.reason}`
      )
    log(
      JSON.stringify(
        {
          environment: ENV,
          apply,
          callerId,
          creatorAccount,
          creatorId: owner.user.id,
          creatorUsername: owner.user.username,
          backingRequired: total,
          available: owner.user.balance,
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
    if (Number(owner.user.balance) < total)
      throw new Error(
        `Insufficient backing: ${
          PERP_CREATOR_ACCOUNT_LABELS[creatorAccount]
        } (@${owner.user.username}) has M${Math.floor(
          owner.user.balance
        )} and needs M${total}`
      )
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
    if (!me.ok || (await me.json()).id !== callerId)
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
