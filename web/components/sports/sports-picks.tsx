import type { ScheduleGame } from 'common/sports-schedule'
import Link from 'next/link'
import type { ComponentProps } from 'react'
import { firebaseLogin } from 'web/lib/firebase/users'
import { getGameStake } from './game-positions'
import { GameRow } from './game-row'
import type { GameFeed } from './schedule-list'
import type { SportMarkets } from './sports-shell'
import { UpcomingMarkets } from './upcoming-markets'
import { useGamePositions } from './use-game-positions'

type Feed = ComponentProps<typeof GameFeed>
type Markets = ComponentProps<typeof SportMarkets>

export function MoreGames(props: { load: Feed['loadMore'] }) {
  return (
    <button
      className="text-primary-700 min-h-[44px] text-sm font-semibold"
      onClick={() => void props.load()}
    >
      Load more games
    </button>
  )
}

export function SportsPicks(props: {
  games: ScheduleGame[]
  markets: Markets
  loading: boolean
  hasMore: boolean
  loadMore: Feed['loadMore']
}) {
  const { games, markets } = props
  const refs = markets.upcoming
  const positions = useGamePositions(
    [...games.map((g) => g.id), ...refs.map((r) => r.id)],
    true
  )
  if (positions.user === null)
    return (
      <button
        className="text-primary-700 min-h-[44px] justify-self-start font-semibold"
        onClick={firebaseLogin}
      >
        Sign in to see your picks
      </button>
    )
  if (positions.error)
    return (
      <button
        className="text-primary-700 min-h-[44px]"
        onClick={() => void positions.refresh()}
      >
        Couldn't load your picks. Retry
      </button>
    )
  if (positions.loading || props.loading)
    return <p role="status">Loading your picks…</p>
  const heldGames = games.flatMap((g) => {
    const position = positions.byGame[g.id]
    const stake = getGameStake(g, position)
    return stake ||
      (g.isResolved && position?.metrics.some((m) => m.totalAmountInvested > 0))
      ? [
          <GameRow
            key={g.id}
            game={g}
            stake={stake}
            variant="compact"
            showLeague
            onPositionsChange={() => void positions.refreshGame(g.id)}
          />,
        ]
      : []
  })
  const heldMarkets = refs.filter((r) => {
    const held = positions.byGame[r.id]
    return (
      held &&
      (held.orders.length > 0 ||
        held.metrics.some((m) => m.hasShares || m.totalAmountInvested > 0))
    )
  })
  return (
    <>
      {heldGames}
      <UpcomingMarkets
        title="Your market picks"
        refs={heldMarkets}
        league={markets.league}
        sport={markets.sport === 'all' ? 'all' : markets.sport.key}
        sportsByKey={markets.sportsByKey}
        showSport={markets.sport === 'all'}
      />
      {!heldGames.length && !heldMarkets.length && (
        <p>No picks on these events yet.</p>
      )}
      {props.hasMore && <MoreGames load={props.loadMore} />}
      {positions.user && (
        <Link
          className="text-primary-700 flex min-h-[44px] items-center text-sm"
          href={`/${positions.user.username}?tab=trades`}
        >
          View all account trades
        </Link>
      )}
    </>
  )
}
