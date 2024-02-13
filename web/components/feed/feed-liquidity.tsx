import dayjs from 'dayjs'
import { BETTOR } from 'common/user'
import { useUser } from 'web/hooks/use-user'
import { Row } from 'web/components/layout/row'
import { EmptyAvatar, Avatar } from 'web/components/widgets/avatar'
import { formatMoney } from 'common/util/format'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { LiquidityProvision } from 'common/liquidity-provision'
import { UserLink } from 'web/components/widgets/user-link'

export function FeedLiquidity(props: {
  className?: string
  liquidity: LiquidityProvision
}) {
  const { liquidity } = props
  const { userId, createdTime } = liquidity

  const isBeforeJune2022 = dayjs(createdTime).isBefore('2022-06-01')
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const bettorId = isBeforeJune2022 ? undefined : userId ?? undefined

  const me = useUser()
  const isSelf = me?.id === userId

  return (
    <div className="to-primary-300 -ml-2 rounded-full bg-gradient-to-r from-pink-300 via-purple-300 p-2">
      <Row className="bg-ink-100 items-stretch gap-2 rounded-full">
        {isSelf ? (
          <Avatar userId={me.id} />
        ) : bettorId ? (
          <Avatar userId={bettorId} />
        ) : (
          <div className="relative px-1">
            <EmptyAvatar />
          </div>
        )}
        <LiquidityStatusText
          liquidity={liquidity}
          isSelf={isSelf}
          bettorId={bettorId}
        />
      </Row>
    </div>
  )
}

function LiquidityStatusText(props: {
  liquidity: LiquidityProvision
  isSelf: boolean
  bettorId?: string
}) {
  const { liquidity, bettorId, isSelf } = props
  const { amount, createdTime } = liquidity

  const bought = amount >= 0 ? 'added' : 'withdrew'
  const money = formatMoney(Math.abs(amount))

  return (
    <div className="text-ink-1000 flex flex-wrap items-center gap-x-1 pr-4 text-sm">
      {bettorId ? (
        <UserLink userId={bettorId} />
      ) : (
        <span>{isSelf ? 'You' : `A ${BETTOR}`}</span>
      )}
      {bought} a subsidy of <span className="text-primary-700">{money}</span>
      <RelativeTimestamp time={createdTime} className="text-ink-1000" />
    </div>
  )
}
