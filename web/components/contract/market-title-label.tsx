import clsx from 'clsx'
import { Contract } from 'common/contract'
import { getSportsLeagueLabel } from 'common/sports-league-label'

import { PerpMarketBadge } from '../perps/perp-market-badge'
import { OFFICIAL_SPORTS_MARKET_DESCRIPTION } from '../sports/sports-market-badge'
import { Tooltip } from '../widgets/tooltip'

// What goes in front of a market's title: a perp's ticker, or an official
// game market's league ("NFL", "EPL"). Renders nothing for any other market,
// so a call site can hand over whatever contract it holds.
export function MarketTitleLabel(props: {
  contract: Contract
  className?: string
}) {
  const { contract, className } = props
  if (contract.mechanism === 'perp')
    return <PerpMarketBadge contract={contract} className={className} />
  const league = getSportsLeagueLabel(contract)
  if (!league) return null
  return <SportsLeagueLabel league={league} className={className} />
}

// The perp ticker's look in red: bold monospace at the size of the text it
// sits in, reading as the first word of the title.
export const SPORTS_LEAGUE_LABEL_CLASS = 'text-scarlet-600 font-mono font-bold'

export function SportsLeagueLabel(props: {
  league: string
  className?: string
}) {
  const { league, className } = props
  // The /sports badge's wording, which says who made the market and nothing
  // about how it resolves: a prop or a line on the same game is official too.
  return (
    <Tooltip
      text={OFFICIAL_SPORTS_MARKET_DESCRIPTION}
      className={clsx(SPORTS_LEAGUE_LABEL_CLASS, className)}
    >
      {league}
    </Tooltip>
  )
}
