import { memo } from 'react'
import { CPMMNumericContract } from 'common/contract'
import { Bet } from 'common/bet'
import { Avatar, AvatarSizeType } from 'web/components/widgets/avatar'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import clsx from 'clsx'
import { UserHovercard } from 'web/components/user/user-hovercard'
import { groupMultiNumericBets } from 'web/components/bet/contract-bets-table'
import { formatMoney } from 'common/util/format'
import { UserLink } from 'web/components/widgets/user-link'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { RelativeTimestamp } from 'web/components/relative-timestamp'

export const MultiNumericBetGroup = memo(function FeedBet(props: {
  contract: CPMMNumericContract
  bets: Bet[]
  avatarSize?: AvatarSizeType
  className?: string
}) {
  const { contract, bets, avatarSize, className } = props
  const { userAvatarUrl, userUsername, userId } = bets[0]

  return (
    <Col className={'w-full'}>
      <Row className={'justify-between'}>
        <Row className={clsx(className, 'items-center gap-2')}>
          <UserHovercard userId={userId}>
            <Avatar
              size={avatarSize}
              avatarUrl={userAvatarUrl}
              username={userUsername}
            />
          </UserHovercard>
          <BetGroupStatusText
            bets={bets}
            contract={contract}
            className="flex-1"
          />
        </Row>
      </Row>
    </Col>
  )
})

function BetGroupStatusText(props: {
  contract: CPMMNumericContract
  bets: Bet[]
  className?: string
}) {
  const { contract, className, bets } = props
  const {
    bet,
    lowerRange,
    higherRange,
    expectedValueBefore,
    expectedValueAfter,
  } = groupMultiNumericBets(bets, contract)
  if (!bet) return null
  const { amount, isApi } = bet
  const bought = amount >= 0 ? 'bought' : 'sold'
  const absAmount = Math.abs(amount)
  const money = formatMoney(absAmount)

  return (
    <div className={clsx('text-ink-1000 text-sm', className)}>
      <UserHovercard userId={bet.userId}>
        <UserLink
          user={{
            id: bet.userId,
            name: bet.userName,
            username: bet.userUsername,
          }}
          className={'font-semibold'}
        />
      </UserHovercard>
      <>
        {' '}
        {bought} {money} of {lowerRange} - {higherRange}{' '}
        {expectedValueBefore === expectedValueAfter
          ? `at ${expectedValueBefore}`
          : `from ${expectedValueBefore} to ${expectedValueAfter}`}
      </>
      {isApi && <InfoTooltip text="Placed via the API">🤖</InfoTooltip>}
      <RelativeTimestamp time={bet.createdTime} shortened={true} />
    </div>
  )
}
