import { useState } from 'react'

import {
  CREATOR_COLUMNS,
  LeaderboardPanel,
  PROFIT_COLUMNS,
} from 'web/components/topics/topic-leaderboard'
import { useUser } from 'web/hooks/use-user'
import type { ElectionLeaderboard } from 'web/lib/politics/elections-2028'
import { track } from 'web/lib/service/analytics'

// A leaderboard's two boards side by side (stacked on phones): top traders
// by profit and market creators by traders, across the topics it covers.
// The viewer's own row is highlighted. `rows` shows that many until
// expanded.
export function ElectionLeaderboards(props: {
  board: ElectionLeaderboard
  rows?: number
}) {
  const { board, rows } = props
  const user = useUser()
  const [expanded, setExpanded] = useState(false)
  const longest = Math.max(board.profit.length, board.creators.length)
  const limit = rows !== undefined && !expanded ? rows : longest
  const more = longest > limit

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-4 lg:flex-row">
        <LeaderboardPanel
          title="Top traders"
          loading={false}
          entries={board.profit.slice(0, limit)}
          columns={PROFIT_COLUMNS}
          highlightUserId={user?.id}
        />
        <LeaderboardPanel
          title="Top creators"
          loading={false}
          entries={board.creators.slice(0, limit)}
          columns={CREATOR_COLUMNS}
          highlightUserId={user?.id}
        />
      </div>
      {more && (
        <button
          type="button"
          className="text-primary-700 hover:text-primary-800 self-center text-sm font-medium hover:underline"
          onClick={() => {
            track('election leaderboard expand', { board: board.key })
            setExpanded(true)
          }}
        >
          Show the top {longest}
        </button>
      )}
    </div>
  )
}
