import clsx from 'clsx'
import Link from 'next/link'
import { Contract, isSportsContract, SportsContract } from 'common/contract'
import { parseOddsEventId } from 'common/odds-markets'
import { WORLD_CUP_2026 } from 'common/sports'
import { getSportsLeagueLabel } from 'common/sports-league-label'
import { sportForMarket } from 'common/sports-schedule'

import { PerpMarketBadge } from '../perps/perp-market-badge'
import { sportPath } from '../sports/sport-rail'
import { OFFICIAL_SPORTS_MARKET_DESCRIPTION } from '../sports/sports-market-badge'
import { Tooltip } from '../widgets/tooltip'

// What goes in front of a market's title: a perp's ticker, or an official
// game market's league ("NFL", "EPL"). Renders nothing for any other market,
// so a call site can hand over whatever contract it holds.
export function MarketTitleLabel(props: {
  contract: Contract
  className?: string
  /** Link a league to its /sports page. Only where no outer link wraps the label. */
  linkToSport?: boolean
}) {
  const { contract, className, linkToSport } = props
  if (contract.mechanism === 'perp')
    return <PerpMarketBadge contract={contract} className={className} />
  const league = getSportsLeagueLabel(contract)
  if (!league) return null
  return (
    <SportsLeagueLabel
      league={league}
      href={
        linkToSport && isSportsContract(contract)
          ? sportsLeagueHref(contract)
          : undefined
      }
      className={className}
    />
  )
}

// The sport's page, or the World Cup's own page for the football-data markets.
function sportsLeagueHref(contract: SportsContract) {
  const { sportsEventId, sportsLeague } = contract
  const odds = parseOddsEventId(sportsEventId)
  if (!odds && sportsLeague === WORLD_CUP_2026.sportsLeague)
    return WORLD_CUP_2026.dashboardPath
  const sport = sportForMarket({ sportsLeague: odds?.sportKey ?? sportsLeague })
  return sport === 'other' ? '/sports' : sportPath(sport)
}

// The perp ticker's look in saddle brown: bold monospace at the size of the
// text it sits in, reading as the first word of the title. Not scarlet, which
// is the NO colour; the dark-mode tan keeps it readable on the dark canvas.
export const SPORTS_LEAGUE_LABEL_CLASS =
  'text-[#8b4513] dark:text-[#d9a066] font-mono font-bold'

export function SportsLeagueLabel(props: {
  league: string
  href?: string
  className?: string
}) {
  const { league, href, className } = props
  // The /sports badge's wording, which says who made the market and nothing
  // about how it resolves: a prop or a line on the same game is official too.
  return (
    <Tooltip
      text={OFFICIAL_SPORTS_MARKET_DESCRIPTION}
      className={clsx(SPORTS_LEAGUE_LABEL_CLASS, className)}
    >
      {href ? (
        <Link href={href} className="hover:underline">
          {league}
        </Link>
      ) : (
        league
      )}
    </Tooltip>
  )
}
