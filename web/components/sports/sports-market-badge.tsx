import { BadgeCheckIcon, UserGroupIcon } from '@heroicons/react/solid'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { Tooltip } from 'web/components/widgets/tooltip'

type MarketCreator = { creatorId?: string; creatorUsername: string }

export function isOfficialSportsMarket(market: MarketCreator) {
  // Full contracts use the account ID, never a title's "[official]" suffix.
  // ScheduleGame omits creatorId; the schedule endpoint already restricts
  // game rows to these accounts. The username also guards other callers.
  return market.creatorId !== undefined
    ? MANIFOLD_SPORTS_USER_IDS.includes(market.creatorId)
    : market.creatorUsername === 'ManifoldSports'
}

/** Also the hover text of the league label in front of an official title. */
export const OFFICIAL_SPORTS_MARKET_DESCRIPTION = 'Official Manifold Market'

/** Creator provenance, deliberately independent of resolution method. */
export function SportsMarketBadge({ market }: { market: MarketCreator }) {
  const official = isOfficialSportsMarket(market)
  const description = official
    ? OFFICIAL_SPORTS_MARKET_DESCRIPTION
    : `Created by @${market.creatorUsername}. Check the market rules for how it resolves.`
  if (official) {
    return (
      <Tooltip text={description}>
        <span
          role="img"
          aria-label={description}
          className="text-primary-600 inline-flex shrink-0 align-text-bottom"
        >
          <BadgeCheckIcon className="h-4 w-4" aria-hidden />
        </span>
      </Tooltip>
    )
  }
  return (
    <Tooltip text={description}>
      <span className="bg-canvas-100 text-ink-600 inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-semibold normal-case leading-4 tracking-normal">
        <UserGroupIcon className="h-3.5 w-3.5" aria-hidden />
        Community
        <span className="sr-only"> — {description}</span>
      </span>
    </Tooltip>
  )
}
