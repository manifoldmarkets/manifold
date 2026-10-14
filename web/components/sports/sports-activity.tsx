import { RefreshIcon } from '@heroicons/react/outline'
import { useEvent } from 'client-common/hooks/use-event'
import dayjs from 'dayjs'
import Link from 'next/link'
import { useEffect } from 'react'
import { ScheduleGame, teamDisplayName } from 'common/sports-schedule'
import { shortFormatNumber } from 'common/util/format'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { usePrivateUser, isBlocked } from 'web/hooks/use-user'
import { Avatar } from 'web/components/widgets/avatar'

const createSportsMarketHref = `/create?params=${encodeURIComponent(
  JSON.stringify({
    q: '',
    description: '',
    visibility: 'public',
    groupSlugs: ['sports-default'],
    rand: 'sports-board',
  })
)}`

/** A read-only tape of actual trades, scoped to the games on this board. */
export function SportsActivity({ games }: { games: ScheduleGame[] }) {
  const privateUser = usePrivateUser()
  const trackedGames = games.slice(0, 50)
  const ids = trackedGames.map((game) => game.id)
  const { data, error, refresh, loading } = useAPIGetter(
    'bets',
    { contractId: ids, limit: 40, order: 'desc', filterRedemptions: true },
    undefined,
    `sports-activity-${ids.join(',')}`,
    ids.length > 0
  )
  const refreshBets = useEvent(refresh)
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refreshBets()
    }, 30_000)
    return () => clearInterval(timer)
  }, [refreshBets])
  const byId = new Map(trackedGames.map((game) => [game.id, game]))
  const bets = (data ?? [])
    .filter(
      (bet) =>
        byId.has(bet.contractId) &&
        !isBlocked(privateUser, bet.userId) &&
        !bet.isRedemption &&
        !bet.isRebalance &&
        Number.isFinite(bet.amount) &&
        Math.abs(bet.amount) > 0 &&
        Number.isFinite(bet.shares) &&
        Math.abs(bet.shares) > 0
    )
    .slice(0, 6)
  const userIds = [...new Set(bets.map((bet) => bet.userId))]
  const { data: users } = useAPIGetter(
    'users/by-id',
    { ids: userIds },
    undefined,
    `sports-traders-${userIds.join(',')}`,
    userIds.length > 0
  )
  const usersById = new Map(users?.map((user) => [user.id, user]))

  return (
    <aside
      className="min-w-0 space-y-5 xl:sticky xl:top-20 xl:self-start"
      aria-label="Game activity"
    >
      <section className="border-ink-200 bg-canvas-0 overflow-hidden rounded-xl border">
        <div className="border-ink-100 flex items-center justify-between gap-2 border-b px-4 py-3">
          <div>
            <h2 className="text-ink-900 text-base font-bold">
              The trading floor
            </h2>
            <p className="text-ink-500 mt-0.5 text-xs">
              Recent bets on these games
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshBets()}
            disabled={loading}
            aria-label="Refresh recent bets"
            className="text-ink-500 hover:bg-canvas-100 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg disabled:opacity-40"
          >
            <RefreshIcon className="h-4 w-4" />
          </button>
        </div>
        {error ? (
          <p role="status" className="text-ink-500 px-4 py-6 text-sm">
            Recent bets couldn't load. Try refreshing.
          </p>
        ) : !data ? (
          <div className="space-y-4 p-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="bg-canvas-100 h-12 animate-pulse rounded"
              />
            ))}
          </div>
        ) : bets.length === 0 ? (
          <p className="text-ink-500 px-4 py-6 text-sm">
            Quiet for now. New bets on these games will appear here.
          </p>
        ) : (
          <div className="divide-ink-100 divide-y">
            {bets.map((bet) => {
              const game = byId.get(bet.contractId)!
              const user = usersById.get(bet.userId)
              const team = [game.home, game.away].find(
                (team) => team.answerId === bet.answerId
              )
              const outcome = team
                ? teamDisplayName(team.name)
                : bet.answerId === game.draw?.answerId
                ? 'Draw'
                : bet.outcome
              const sold = bet.amount < 0
              return (
                <Link
                  href={`/${game.creatorUsername}/${game.slug}`}
                  key={bet.id}
                  className="hover:bg-canvas-50 block px-4 py-3"
                >
                  <div className="mb-1.5 flex min-w-0 items-center gap-1.5 text-xs">
                    <Avatar size="2xs" avatarUrl={user?.avatarUrl} noLink />
                    <span className="text-ink-700 truncate font-medium">
                      {user?.name ?? 'Trader'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span
                      className={sold ? 'text-ink-500' : 'text-primary-700'}
                    >
                      {sold ? 'Sold' : 'Bought'}{' '}
                      {bet.outcome === 'NO' && team ? 'against ' : ''}
                      {outcome}
                    </span>
                    <span className="text-ink-900 shrink-0 font-bold tabular-nums">
                      Ṁ{shortFormatNumber(Math.abs(bet.amount))}
                    </span>
                  </div>
                  <div className="text-ink-500 mt-1 flex items-center justify-between gap-2 text-[11px]">
                    <span className="truncate">
                      {game.home.shortName} vs {game.away.shortName}
                    </span>
                    <time
                      className="shrink-0"
                      dateTime={new Date(bet.createdTime).toISOString()}
                      title={dayjs(bet.createdTime).format('MMM D, h:mm:ss A')}
                    >
                      {dayjs(bet.createdTime).format('MMM D, h:mm A')}
                    </time>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
        <p className="border-ink-100 text-ink-400 border-t px-4 py-2 text-[11px]">
          Refreshes every 30s{games.length > 50 ? ' · first 50 games' : ''}
        </p>
      </section>
      <section className="bg-primary-50 rounded-xl p-5">
        <span className="text-2xl" aria-hidden>
          💭
        </span>
        <h2 className="text-ink-900 mt-2 text-lg font-bold">Got a hot take?</h2>
        <p className="text-ink-600 mt-1 text-sm leading-relaxed">
          A breakout season. A coaching shakeup. The prediction nobody else
          sees. Make it a market.
        </p>
        <Link
          href={createSportsMarketHref}
          className="text-primary-700 mt-4 inline-flex min-h-[40px] items-center text-sm font-bold"
        >
          Create a sports market →
        </Link>
      </section>
    </aside>
  )
}
