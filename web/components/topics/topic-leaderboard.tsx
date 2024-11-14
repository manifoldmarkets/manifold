import { Col } from '../layout/col'
import { Leaderboard } from '../leaderboard'
import { formatMoney, formatWithCommas } from 'common/util/format'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useSweepstakes } from 'web/components/sweepstakes-provider'
import { SweepsToggle } from 'web/components/sweeps/sweeps-toggle'

export function TopicLeaderboard(props: { topicId: string }) {
  const { prefersPlay } = useSweepstakes()
  const token = prefersPlay ? 'MANA' : 'CASH'

  const { data: profitEntries } = useAPIGetter('leaderboard', {
    kind: 'profit',
    groupId: props.topicId,
    token,
    limit: 50,
  })

  const { data: creatorEntries } = useAPIGetter('leaderboard', {
    kind: 'creator',
    groupId: props.topicId,
    token,
    limit: 50,
  })

  return (
    <Col className="relative gap-8">
      <SweepsToggle sweepsEnabled className="!absolute right-2 top-2" />
      <Leaderboard
        title="Top traders"
        entries={profitEntries ?? []}
        columns={[
          { header: 'Profit', renderCell: (c) => formatMoney(c.score, token) },
        ]}
      />
      <Leaderboard
        title="Top creators"
        entries={creatorEntries ?? []}
        columns={[
          { header: 'Traders', renderCell: (c) => formatWithCommas(c.score) },
        ]}
      />
    </Col>
  )
}
