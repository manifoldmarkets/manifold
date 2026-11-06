import { ChevronDownIcon } from '@heroicons/react/solid'
import clsx from 'clsx'

import { fromNow } from 'client-common/lib/time'
import type {
  ElectionLeaderboard,
  ElectionLeaderboardKey,
} from 'common/election-leaderboards'
import { formatMoney } from 'common/util/format'
import { FilterPill } from 'web/components/search/filter-pills'
import {
  CREATOR_COLUMNS,
  LeaderboardPanel,
  PROFIT_COLUMNS,
} from 'web/components/topics/topic-leaderboard'
import { UserAvatarAndBadge } from 'web/components/widgets/user-link'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { useUser } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'

const ROWS = 10
const PREVIEW = 3

const SCOPE_TEXT: Record<ElectionLeaderboardKey, string> = {
  '2026': 'the 2026 election topics',
  '2028': 'the 2028 election topics',
  '2030': 'the 2030 election topics',
  'us-elections': 'every US election topic, 2020 to 2036',
  'us-politics': 'US politics and every US election topic',
}

// The leaderboards, at the top of the page in one card: a scope per election
// (the 2026 midterms, 2028, …), all US elections and US politics. Closed, it
// is one row: the scopes and the top three traders. Open, it shows the top
// traders and creators. The boards are stored (rebuilt hourly or every six
// hours by the scheduler), so switching scopes costs nothing.
export function ElectionLeaderboards(props: {
  boards: ElectionLeaderboard[]
  defaultKey: ElectionLeaderboardKey
}) {
  const { boards } = props
  const user = useUser()
  const [picked, setPicked] = usePersistentInMemoryState<
    ElectionLeaderboardKey | undefined
  >(undefined, 'election-leaderboard-scope')
  const [open, setOpen] = usePersistentInMemoryState(
    false,
    'election-leaderboard-open'
  )
  const board =
    boards.find((b) => b.key === picked) ??
    boards.find((b) => b.key === props.defaultKey) ??
    boards[0]
  if (!board) return null

  const toggle = () => {
    track('election leaderboard toggle', { open: !open, board: board.key })
    setOpen(!open)
  }

  return (
    <section
      aria-label="Leaderboards"
      className="bg-canvas-0 border-ink-200 flex flex-col gap-3 rounded-xl border p-3 sm:p-4"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="text-ink-1000 flex items-center gap-1 text-base font-semibold"
        >
          Leaderboard
          <ChevronDownIcon
            className={clsx(
              'text-ink-500 h-5 w-5 transition-transform',
              open && 'rotate-180'
            )}
          />
        </button>
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
                track('election leaderboard scope', { board: b.key })
                setPicked(b.key)
              }}
            >
              {b.label}
            </FilterPill>
          ))}
        </div>
      </div>

      {open ? (
        <>
          <div className="flex flex-col gap-4 lg:flex-row">
            <LeaderboardPanel
              title="Top traders"
              loading={false}
              entries={board.profit.slice(0, ROWS)}
              columns={PROFIT_COLUMNS}
              highlightUserId={user?.id}
            />
            <LeaderboardPanel
              title="Top creators"
              loading={false}
              entries={board.creator.slice(0, ROWS)}
              columns={CREATOR_COLUMNS}
              highlightUserId={user?.id}
            />
          </div>
          <div className="text-ink-500 flex flex-wrap justify-between gap-2 text-xs">
            <span>
              Profit, and traders on the markets each creator made, across{' '}
              {SCOPE_TEXT[board.key]}.
            </span>
            <span>Updated {fromNow(board.updatedTime)}</span>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={toggle}
          className="flex flex-wrap items-center gap-x-5 gap-y-2 text-left"
        >
          {board.profit.slice(0, PREVIEW).map((e, i) => (
            <span key={e.userId} className="flex items-center gap-2 text-sm">
              <span className="text-ink-500 tabular-nums">{i + 1}</span>
              <UserAvatarAndBadge
                user={{ id: e.userId }}
                noLink
                short
                className="max-w-[10rem]"
              />
              <span className="text-ink-700 tabular-nums">
                {formatMoney(e.score, 'MANA')}
              </span>
            </span>
          ))}
          <span className="text-primary-700 text-sm font-medium">
            See the top {ROWS} →
          </span>
        </button>
      )}
    </section>
  )
}
