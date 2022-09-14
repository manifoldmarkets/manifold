import clsx from 'clsx'
import dayjs from 'dayjs'
import { User } from 'common/user'
import { useUser, useUserById } from 'web/hooks/use-user'
import { Row } from 'web/components/layout/row'
import { Avatar, EmptyAvatar } from 'web/components/avatar'
import { formatMoney } from 'common/util/format'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import React from 'react'
import { LiquidityProvision } from 'common/liquidity-provision'
import { UserLink } from 'web/components/user-link'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'

export function FeedLiquidity(props: {
  className?: string
  liquidity: LiquidityProvision
}) {
  const { liquidity } = props
  const { userId, createdTime, isAnte } = liquidity

  const isBeforeJune2022 = dayjs(createdTime).isBefore('2022-06-01')
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const bettor = isBeforeJune2022 ? undefined : useUserById(userId)

  const user = useUser()
  const isSelf = user?.id === userId

  if (
    isAnte ||
    userId === HOUSE_LIQUIDITY_PROVIDER_ID ||
    userId === DEV_HOUSE_LIQUIDITY_PROVIDER_ID
  )
    return <></>

  return (
    <Row className="items-center gap-2 pt-3">
      {isSelf ? (
        <Avatar avatarUrl={user.avatarUrl} username={user.username} />
      ) : bettor ? (
        <Avatar avatarUrl={bettor.avatarUrl} username={bettor.username} />
      ) : (
        <div className="relative px-1">
          <EmptyAvatar />
        </div>
      )}
      <LiquidityStatusText
        liquidity={liquidity}
        isSelf={isSelf}
        bettor={bettor}
        className={'flex-1'}
      />
    </Row>
  )
}

export function LiquidityStatusText(props: {
  liquidity: LiquidityProvision
  isSelf: boolean
  bettor?: User
  className?: string
}) {
  const { liquidity, bettor, isSelf, className } = props
  const { amount, createdTime } = liquidity

  // TODO: Withdrawn liquidity will never be shown, since liquidity amounts currently are zeroed out upon withdrawal.
  const bought = amount >= 0 ? 'added' : 'withdrew'
  const money = formatMoney(Math.abs(amount))

  return (
    <div className={clsx(className, 'text-sm text-gray-500')}>
      {bettor ? (
        <UserLink name={bettor.name} username={bettor.username} />
      ) : (
        <span>{isSelf ? 'You' : 'A trader'}</span>
      )}{' '}
      {bought} a subsidy of {money}
      <RelativeTimestamp time={createdTime} />
    </div>
  )
}
