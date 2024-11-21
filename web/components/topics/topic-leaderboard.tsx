import { Col } from '../layout/col'
import { Leaderboard, LoadingLeaderboard } from '../leaderboard'
import { formatMoney, formatWithCommas } from 'common/util/format'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useSweepstakes } from 'web/components/sweepstakes-provider'
import { SweepsToggle } from 'web/components/sweeps/sweeps-toggle'

export function TopicLeaderboard(props: { topicId: string }) {
  const { prefersPlay } = useSweepstakes()
  const token = prefersPlay ? 'MANA' : 'CASH'

  const profitResult = useAPIGetter('leaderboard', {
    kind: 'profit',
    groupId: props.topicId,
    token,
    limit: 50,
  })

  const creatorResult = useAPIGetter('leaderboard', {
    kind: 'creator',
    groupId: props.topicId,
    token,
    limit: 50,
  })

  const profitColumns = [
    { header: 'Profit', renderCell: (c: any) => formatMoney(c.score, token) },
  ]
  const creatorColumns = [
    { header: 'Traders', renderCell: (c: any) => formatWithCommas(c.score) },
  ]

  return (
    <Col className="relative gap-8">
      <SweepsToggle sweepsEnabled className="!absolute right-2 top-2" />
      {profitResult.loading ? (
        <LoadingLeaderboard columns={profitColumns} />
      ) : profitResult.data ? (
        <Leaderboard
          title="Top traders"
          entries={profitResult.data}
          columns={profitColumns}
        />
      ) : null}
      {creatorResult.loading ? (
        <LoadingLeaderboard columns={creatorColumns} />
      ) : creatorResult.data ? (
        <Leaderboard
          title="Top creators"
          entries={creatorResult.data}
          columns={creatorColumns}
        />
      ) : null}
    </Col>
  )
}
