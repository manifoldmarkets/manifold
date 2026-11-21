import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { fromNow } from 'client-common/lib/time'
import type {
  ElectionLeaderboard,
  ElectionLeaderboardKey,
} from 'common/election-leaderboards'
import { FilterPill } from 'web/components/search/filter-pills'
import {
  CREATOR_COLUMNS,
  LeaderboardPanel,
  PROFIT_COLUMNS,
} from 'web/components/topics/topic-leaderboard'
import { useIsClient } from 'web/hooks/use-is-client'
import { useUser } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'

const ROWS = 10

const SCOPE_TEXT: Record<ElectionLeaderboardKey, string> = {
  '2026': 'the 2026 election topics',
  '2028': 'the 2028 election topics',
  '2030': 'the 2030 election topics',
  'us-elections': 'every US election topic, 2020 to 2036',
  'us-politics': 'US politics and every US election topic',
}

// The election leaderboards in one card, under the page's own heading: a
// scope per election (the 2026 midterms, 2028, …), all US elections and US
// politics, each with its top traders by profit and top creators by the
// traders on their markets. The boards are stored (rebuilt hourly or every
// six hours by the scheduler), so switching scopes costs nothing.
export function ElectionLeaderboards(props: {
  boards: ElectionLeaderboard[]
  defaultKey: ElectionLeaderboardKey
  // Keeps each page's pick of scope apart.
  page: string
}) {
  const { boards } = props
  const user = useUser()
  // "Updated 5 minutes ago" would differ between the server's render and
  // the browser's, so it waits for the browser.
  const isClient = useIsClient()
  const [picked, setPicked] = usePersistentInMemoryState<
    ElectionLeaderboardKey | undefined
  >(undefined, `election-leaderboard-scope-${props.page}`)
  const board =
    boards.find((b) => b.key === picked) ??
    boards.find((b) => b.key === props.defaultKey) ??
    boards[0]
  if (!board) return null

  return (
    <div className="bg-canvas-0 border-ink-200 flex flex-col gap-3 rounded-xl border p-3 sm:p-4">
      {boards.length > 1 && (
        <div
          role="radiogroup"
          aria-label="Leaderboard scope"
          className="flex flex-wrap gap-1.5"
        >
          {boards.map((b) => (
            <FilterPill
              key={b.key}
              role="radio"
              selected={b.key === board.key}
              onSelect={() => {
                track('election leaderboard scope', {
                  board: b.key,
                  page: props.page,
                })
                setPicked(b.key)
              }}
            >
              {b.label}
            </FilterPill>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-4 lg:flex-row">
        <LeaderboardPanel
          title="Top traders"
          loading={false}
          entries={board.profit.slice(0, ROWS)}
          columns={PROFIT_COLUMNS}
          highlightUserId={user?.id}
          shortNames={false}
        />
        <LeaderboardPanel
          title="Top creators"
          loading={false}
          entries={board.creator.slice(0, ROWS)}
          columns={CREATOR_COLUMNS}
          highlightUserId={user?.id}
          shortNames={false}
        />
      </div>
      <div className="text-ink-500 flex flex-wrap justify-between gap-2 text-xs">
        <span>
          Profit, and traders on the markets each creator made, across{' '}
          {SCOPE_TEXT[board.key]}.
        </span>
        {isClient && <span>Updated {fromNow(board.updatedTime)}</span>}
      </div>
    </div>
  )
}
