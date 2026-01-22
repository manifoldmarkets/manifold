import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Leaderboard, LoadingLeaderboard } from '../leaderboard'
import { formatMoney, formatWithCommas } from 'common/util/format'
import { useAPIGetter } from 'web/hooks/use-api-getter'

export function TopicLeaderboard(props: { topicId: string }) {
  const profitResult = useAPIGetter('leaderboard', {
    kind: 'profit',
    groupId: props.topicId,
    token: 'MANA',
    limit: 20,
  })

  const creatorResult = useAPIGetter('leaderboard', {
    kind: 'creator',
    groupId: props.topicId,
    token: 'MANA',
    limit: 20,
  })

  const profitColumns = [
    { header: 'Profit', renderCell: (c: any) => formatMoney(c.score, 'MANA') },
  ]
  const creatorColumns = [
    { header: 'Traders', renderCell: (c: any) => formatWithCommas(c.score) },
  ]

  return (
    <Row className="flex-col gap-6 lg:flex-row">
      {/* Top Traders */}
      <Col className="bg-canvas-0 border-ink-200 flex-1 overflow-hidden rounded-xl border shadow-sm">
        <div className="border-ink-100 bg-canvas-50 border-b px-4 py-3">
          <h2 className="text-ink-700 text-sm font-semibold uppercase tracking-wide">
            Top Traders
          </h2>
        </div>
        <div className="p-2">
          {profitResult.loading ? (
            <LoadingLeaderboard columns={profitColumns} maxToShow={10} />
          ) : profitResult.data ? (
            <Leaderboard entries={profitResult.data} columns={profitColumns} />
          ) : (
            <div className="text-ink-400 py-8 text-center text-sm">
              No data available
            </div>
          )}
        </div>
      </Col>

      {/* Top Creators */}
      <Col className="bg-canvas-0 border-ink-200 flex-1 overflow-hidden rounded-xl border shadow-sm">
        <div className="border-ink-100 bg-canvas-50 border-b px-4 py-3">
          <h2 className="text-ink-700 text-sm font-semibold uppercase tracking-wide">
            Top Creators
          </h2>
        </div>
        <div className="p-2">
          {creatorResult.loading ? (
            <LoadingLeaderboard columns={creatorColumns} maxToShow={10} />
          ) : creatorResult.data ? (
            <Leaderboard entries={creatorResult.data} columns={creatorColumns} />
          ) : (
            <div className="text-ink-400 py-8 text-center text-sm">
              No data available
            </div>
          )}
        </div>
      </Col>
    </Row>
  )
}
