import { BadgeCheckIcon, UserGroupIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
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

/** Creator provenance, deliberately independent of resolution method. */
export function SportsMarketBadge({ market }: { market: MarketCreator }) {
  const official = isOfficialSportsMarket(market)
  const description = official
    ? 'Created by Manifold Sports. Check the market rules for how it resolves.'
    : `Created by @${market.creatorUsername}. Check the market rules for how it resolves.`
  const Icon = official ? BadgeCheckIcon : UserGroupIcon
  return (
    <Tooltip text={description}>
      <span
        className={clsx(
          'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-semibold normal-case leading-4 tracking-normal',
          official
            ? 'bg-primary-100 text-primary-700'
            : 'bg-canvas-100 text-ink-600'
        )}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {official ? 'Official' : 'Community'}
        <span className="sr-only"> — {description}</span>
      </span>
    </Tooltip>
  )
}
