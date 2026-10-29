import { Col } from '../layout/col'
import { Row } from '../layout/row'
import {
  Leaderboard,
  LeaderboardColumn,
  LeaderboardEntry,
  LoadingLeaderboard,
} from '../leaderboard'
import { formatMoney, formatWithCommas } from 'common/util/format'
import { useAPIGetter } from 'web/hooks/use-api-getter'

export function TopicLeaderboard(props: { topicId: string }) {
  // A cache slot per topic and kind: sharing the endpoint's one slot showed
  // one kind's entries, or another topic's, while these load.
  const profitResult = useAPIGetter(
    'leaderboard',
    { kind: 'profit', groupId: props.topicId, token: 'MANA', limit: 20 },
    undefined,
    `topic-leaderboard-profit-${props.topicId}`
  )

  const creatorResult = useAPIGetter(
    'leaderboard',
    { kind: 'creator', groupId: props.topicId, token: 'MANA', limit: 20 },
    undefined,
    `topic-leaderboard-creator-${props.topicId}`
  )

  return (
    <Row className="flex-col gap-6 lg:flex-row">
      <LeaderboardPanel
        title="Top Traders"
        loading={profitResult.loading}
        entries={profitResult.data}
        columns={PROFIT_COLUMNS}
      />
      <LeaderboardPanel
        title="Top Creators"
        loading={creatorResult.loading}
        entries={creatorResult.data}
        columns={CREATOR_COLUMNS}
      />
    </Row>
  )
}

export const PROFIT_COLUMNS: LeaderboardColumn[] = [
  { header: 'Profit', renderCell: (c) => formatMoney(c.score, 'MANA') },
]
export const CREATOR_COLUMNS: LeaderboardColumn[] = [
  { header: 'Traders', renderCell: (c) => formatWithCommas(c.score) },
]

/** A titled card holding one leaderboard. */
export function LeaderboardPanel(props: {
  title: string
  loading: boolean
  entries: LeaderboardEntry[] | undefined
  columns: LeaderboardColumn[]
  highlightUserId?: string
  /** Shown when there are no entries to show (the fetch failed). */
  emptyText?: string
  footer?: React.ReactNode
}) {
  const {
    title,
    loading,
    entries,
    columns,
    highlightUserId,
    emptyText = 'No data available',
    footer,
  } = props
  return (
    <Col className="bg-canvas-0 border-ink-200 min-w-0 flex-1 overflow-hidden rounded-xl border shadow-sm">
      <div className="border-ink-100 bg-canvas-50 border-b px-4 py-3">
        <h2 className="text-ink-700 text-sm font-semibold uppercase tracking-wide">
          {title}
        </h2>
      </div>
      <div className="p-2">
        {loading && !entries ? (
          <LoadingLeaderboard columns={columns} maxToShow={10} />
        ) : entries ? (
          <Leaderboard
            entries={entries}
            columns={columns}
            highlightUserId={highlightUserId}
          />
        ) : (
          <div className="text-ink-400 py-8 text-center text-sm">
            {emptyText}
          </div>
        )}
        {footer}
      </div>
    </Col>
  )
}
