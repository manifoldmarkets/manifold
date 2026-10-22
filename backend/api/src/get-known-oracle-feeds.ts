import { sortBy, uniq } from 'lodash'

import { ENV } from 'common/envs/constants'
import {
  PERP_CREATOR_ACCOUNT_LABELS,
  PERP_CREATOR_ACCOUNTS,
  isPerpCreatorAccountAllowed,
} from 'common/perps/creator-accounts'
import { getPerpFeedTicker } from 'common/perps/ticker'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { getOracleFeed, ORACLE_FEEDS } from 'shared/oracle-feeds'
import {
  getPerpCreatorAccountMismatch,
  resolvePerpCreatorAccount,
} from 'shared/perps/creator-accounts'
import {
  ALL_PERP_LAUNCH_MARKETS,
  getPerpLaunchCreatorId,
} from 'shared/perps/launch-manifest'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from './helpers/endpoint'

export const getKnownOracleFeeds: APIHandler<'get-known-oracle-feeds'> = async (
  _body,
  auth
) => {
  throwErrorIfNotAdmin(auth.uid)
  const pg = createSupabaseDirectClient()
  const rows = await pg.manyOrNone<{ feed_id: string }>(
    `select distinct feed_id from oracle_prices order by feed_id asc`
  )
  // Resolve each selectable owner once: the form greys out an account that
  // does not exist here (DEV may have no partner account) with the reason,
  // instead of letting create-perp reject the submission.
  const creatorAccounts = await Promise.all(
    PERP_CREATOR_ACCOUNTS.map((account) =>
      resolvePerpCreatorAccount(account, ENV, pg)
    )
  )
  const callerAuthorized = auth.uid === getPerpLaunchCreatorId(ENV)
  // Include the registry independently of stored history: a disabled feed must
  // remain blocked in the form even before its first point is written. Also
  // retain price-only ids so the form can explain why they cannot back a
  // market instead of silently hiding them.
  const feedIds = sortBy(
    uniq([
      ...ORACLE_FEEDS.map((feed) => feed.id),
      ...rows.map((r) => r.feed_id),
    ])
  )
  return feedIds.map((id) => {
    const feed = getOracleFeed(id)
    const launch = ALL_PERP_LAUNCH_MARKETS.find(
      (market) => market.feedId === id
    )
    return {
      id,
      supportsApiTakerFee: true,
      updatePeriodMs: feed?.updatePeriodMs ?? null,
      marketCreationEnabled: feed?.marketCreationEnabled ?? false,
      description: feed?.description ?? null,
      ticker: getPerpFeedTicker(id) ?? null,
      launchLatencyRisk: launch?.latencyArbitrageRisk ?? null,
      launchRecommendation: launch
        ? {
            question: launch.question,
            maxLeverage: launch.recommended.maxLeverage,
            annualMaxFundingRate: launch.recommended.annualMaxFundingRate,
            fundingSensitivity: launch.recommended.fundingSensitivity,
            maxOraclePriceAgeMs: launch.recommended.maxOraclePriceAgeMs,
            subsidyLong: launch.recommended.subsidyLong,
            subsidyShort: launch.recommended.subsidyShort,
            requiredTopicNames: launch.requiredTopics.map(
              (topic) => topic.name
            ),
            creatorAuthorized: callerAuthorized,
          }
        : null,
      callerAuthorized,
      creatorAccounts: creatorAccounts.map((resolved) => ({
        account: resolved.account,
        label: PERP_CREATOR_ACCOUNT_LABELS[resolved.account],
        allowed: isPerpCreatorAccountAllowed(resolved.account, id),
        username: resolved.user?.username ?? null,
        unavailableReason: resolved.user
          ? getPerpCreatorAccountMismatch(resolved)
          : resolved.reason,
      })),
    }
  })
}
