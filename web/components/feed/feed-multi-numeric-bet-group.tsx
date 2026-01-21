import clsx from 'clsx'
import { Bet } from 'common/bet'
import { CPMMNumericContract } from 'common/contract'
import { memo } from 'react'
import { groupMultiNumericBets } from 'web/components/bet/contract-bets-table'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { UserHovercard } from 'web/components/user/user-hovercard'
import { Avatar, AvatarSizeType } from 'web/components/widgets/avatar'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { UserLink } from 'web/components/widgets/user-link'
import { useDisplayUserById } from 'web/hooks/use-user-supabase'
import { MoneyDisplay } from '../bet/money-display'

export const MultiNumericBetGroup = memo(function FeedBet(props: {
  contract: CPMMNumericContract
  bets: Bet[]
  avatarSize?: AvatarSizeType
  className?: string
}) {
  const { contract, bets, avatarSize, className } = props
  const { userId } = bets[0]

  const first = useDisplayUserById(userId)

  return (
    <Col className={'w-full'}>
      <Row className={'justify-between'}>
        <Row className={clsx(className, 'items-center gap-2')}>
          <UserHovercard userId={userId}>
            <Avatar
              size={avatarSize}
              avatarUrl={first?.avatarUrl}
              username={first?.username}
              entitlements={first?.entitlements}
              displayContext="feed"
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

  const user = useDisplayUserById(bet?.userId ?? '')

  if (!bet) return null

  const { amount, isApi, shares } = bet
  const bought = shares >= 0 ? 'bought' : 'sold'
  const absAmount = Math.abs(amount)
  const isCashContract = contract.token === 'CASH'
  const money = (
    <MoneyDisplay amount={absAmount} isCashContract={isCashContract} />
  )

  return (
    <div className={clsx('text-ink-1000 text-sm', className)}>
      {user && (
        <UserHovercard userId={bet.userId}>
          <UserLink user={user} className={'font-semibold'} />
        </UserHovercard>
      )}
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
