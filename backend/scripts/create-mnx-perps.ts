import { getApiUrl } from 'common/api/utils'
import { ENV, ENV_CONFIG } from 'common/envs/constants'
import {
  DEFAULT_PERP_CREATOR_ACCOUNT,
  PERP_CREATOR_ACCOUNT_LABELS,
  PERP_CREATOR_ACCOUNTS,
  PerpCreatorAccount,
} from 'common/perps/creator-accounts'
import { getPerpEffectiveTakerFeeBps } from 'common/perps/fees'
import {
  MNX_DEFAULT_FEES,
  MNX_INSTRUMENTS,
  MNX_LIVE_INSTRUMENTS,
} from 'common/perps/mnx'
import { getPerpFeedTicker } from 'common/perps/ticker'
import { HOUR_MS, YEAR_MS } from 'common/util/time'
import { getLocalEnv } from 'shared/init-admin'
import {
  getPerpCreatorAccountMismatch,
  resolvePerpCreatorAccount,
} from 'shared/perps/creator-accounts'
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
//
// Delisted (retired) instruments are never created. To launch one new listing
// with settings other than the manifest's day-one recommendation, name it:
//   --feed=<feedId>[,<feedId>]   only these live MNX feeds
//   --subsidy-per-side=<M$>      backing per side (whole mana)
//   --max-leverage=<n>           market leverage cap (2-100)
//   --topics=<slug>[,<slug>]     extra topics; the launch topic is always added
// The overrides require --feed, so they cannot fan out over every missing feed.
const argValue = (name: string) =>
  process.argv
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.slice(name.length + 3)
const listArg = (name: string) =>
  argValue(name)
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
const wholeArg = (name: string, min: number, max: number) => {
  const raw = argValue(name)
  if (raw == null) return undefined
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error(`--${name} must be a whole number from ${min} to ${max}`)
  return value
}

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
    const requestedFeeds = listArg('feed')
    const subsidyPerSide = wholeArg('subsidy-per-side', 1, 10_000_000)
    const maxLeverageOverride = wholeArg('max-leverage', 2, 100)
    const topicSlugs = listArg('topics') ?? []
    if (
      !requestedFeeds?.length &&
      (subsidyPerSide != null ||
        maxLeverageOverride != null ||
        topicSlugs.length)
    )
      throw new Error(
        '--subsidy-per-side, --max-leverage and --topics require --feed'
      )
    for (const feedId of requestedFeeds ?? []) {
      const spec = MNX_INSTRUMENTS.find((i) => i.feedId === feedId)
      if (!spec) throw new Error(`Unknown MNX feed: ${feedId}`)
      if (spec.retired)
        throw new Error(`${feedId} is retired: ${spec.retired.reason}`)
    }
    const candidates = MNX_LIVE_INSTRUMENTS.filter(
      (spec) => !requestedFeeds || requestedFeeds.includes(spec.feedId)
    )
    const topics = topicSlugs.length
      ? await pg.manyOrNone<{ id: string; slug: string }>(
          `select id, slug from groups where slug = any($1)`,
          [topicSlugs]
        )
      : []
    const unknownTopics = topicSlugs.filter(
      (slug) => !topics.some((t) => t.slug === slug)
    )
    if (unknownTopics.length)
      throw new Error(`Unknown topic slugs: ${unknownTopics.join(', ')}`)
    const existing = await pg.manyOrNone<{ feed_id: string; id: string }>(
      `select data->>'oracleFeedId' as feed_id, id from contracts
     where mechanism = 'perp' and resolution_time is null
       and data->>'oracleFeedId' = any($1)`,
      [candidates.map((i) => i.feedId)]
    )
    const missing = candidates.filter((spec) => {
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
        description: spec.description,
        oracleFeedId: spec.feedId,
        ticker: getPerpFeedTicker(spec.feedId),
        creatorAccount,
        visibility: 'unlisted' as const,
        ...(topics.length ? { groupIds: topics.map((t) => t.id) } : {}),
        ...MNX_DEFAULT_FEES,
        // MNX's margin sets only the default; it never caps this market.
        maxLeverage:
          maxLeverageOverride ??
          Math.min(recommended.maxLeverage, ready.maxLeverage!),
        subsidyLong: subsidyPerSide ?? recommended.subsidyLong,
        subsidyShort: subsidyPerSide ?? recommended.subsidyShort,
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
    const ownerLabel = PERP_CREATOR_ACCOUNT_LABELS[creatorAccount]
    const owner = await resolvePerpCreatorAccount(creatorAccount, ENV, pg)
    const ownerProblem = owner.user
      ? getPerpCreatorAccountMismatch(owner)
      : owner.reason
    if (!owner.user || ownerProblem)
      throw new Error(`Cannot create as ${ownerLabel}: ${ownerProblem}`)
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
    // An API that predates the creator selector strips the unknown field and
    // creates every market under the caller with a 200, so a successful
    // response proves nothing. Require the API to advertise the option for
    // each feed, agree on who the account is, and then check every created
    // market's creator before moving to the next.
    const feedsResponse = await fetch(getApiUrl('get-known-oracle-feeds'), {
      headers,
      signal: AbortSignal.timeout(10_000),
    })
    if (!feedsResponse.ok)
      throw new Error(
        `get-known-oracle-feeds failed: HTTP ${feedsResponse.status}`
      )
    const knownFeeds: {
      id: string
      callerAuthorized?: boolean
      supportsApiTakerFee?: boolean
      creatorAccounts?: {
        account: string
        allowed: boolean
        username: string | null
        unavailableReason: string | null
      }[]
    }[] = await feedsResponse.json()
    for (const body of bodies) {
      const feed = knownFeeds.find((f) => f.id === body.oracleFeedId)
      const option = feed?.creatorAccounts?.find(
        (a) => a.account === creatorAccount
      )
      if (!feed?.creatorAccounts || !option)
        throw new Error(
          `The API at ${apiUrl.host} predates the creator account selector (no creator accounts reported for ${body.oracleFeedId}); deploy it before creating with --creator`
        )
      if (feed.supportsApiTakerFee !== true)
        throw new Error(
          'The API does not support explicit API-channel creation fees. Deploy the current backend before creating MNX markets.'
        )
      if (feed.callerAuthorized === false)
        throw new Error(
          'The API does not accept this key as the official creator'
        )
      if (!option.allowed || option.unavailableReason)
        throw new Error(
          `${ownerLabel} cannot own ${body.oracleFeedId} on the API: ${
            option.unavailableReason ?? 'not allowed on this feed'
          }`
        )
      if (option.username !== owner.user.username)
        throw new Error(
          `The API resolves ${ownerLabel} to @${option.username} but this script to @${owner.user.username}; reconcile MNX_CREATOR_IDS before creating`
        )
    }
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
      if (market.creatorId !== owner.user.id)
        throw new Error(
          `${market.id} was created under creator ${market.creatorId}, not ${ownerLabel} (${owner.user.id}). Stop and audit before retrying.`
        )
      // The API publishes the API-channel rate it will actually charge,
      // max(web, api), not the configured value.
      if (
        market.takerFeeBps !== body.takerFeeBps ||
        market.takerFeeApiBps !== getPerpEffectiveTakerFeeBps(body, true) ||
        market.takerFeeImpact !== body.takerFeeImpact
      )
        throw new Error(
          `${market.id} was created with different fees than requested. Deploy the current backend and correct this market in /admin/mnx before continuing.`
        )
    }
  })
