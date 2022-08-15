import dayjs from 'dayjs'
import { User } from 'common/user'
import { useUser, useUserById } from 'web/hooks/use-user'
import { Row } from 'web/components/layout/row'
import { Avatar, EmptyAvatar } from 'web/components/avatar'
import clsx from 'clsx'
import { formatMoney } from 'common/util/format'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import React from 'react'
import { UserLink } from '../user-page'
import { LiquidityProvision } from 'common/liquidity-provision'

export function FeedLiquidity(props: {
  liquidity: LiquidityProvision
  smallAvatar: boolean
}) {
  const { liquidity, smallAvatar } = props
  const { userId, createdTime } = liquidity

  const isBeforeJune2022 = dayjs(createdTime).isBefore('2022-06-01')
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const bettor = isBeforeJune2022 ? undefined : useUserById(userId)

  const user = useUser()
  const isSelf = user?.id === userId

  return (
    <>
      <Row className={'flex w-full gap-2 pt-3'}>
        {isSelf ? (
          <Avatar
            className={clsx(smallAvatar && 'ml-1')}
            size={smallAvatar ? 'sm' : undefined}
            avatarUrl={user.avatarUrl}
            username={user.username}
          />
        ) : bettor ? (
          <Avatar
            className={clsx(smallAvatar && 'ml-1')}
            size={smallAvatar ? 'sm' : undefined}
            avatarUrl={bettor.avatarUrl}
            username={bettor.username}
          />
        ) : (
          <div className="relative px-1">
            <EmptyAvatar />
          </div>
        )}
        <div className={'min-w-0 flex-1 py-1.5'}>
          <LiquidityStatusText
            liquidity={liquidity}
            isSelf={isSelf}
            bettor={bettor}
          />
        </div>
      </Row>
    </>
  )
}

export function LiquidityStatusText(props: {
  liquidity: LiquidityProvision
  isSelf: boolean
  bettor?: User
}) {
  const { liquidity, bettor, isSelf } = props
  const { amount, createdTime } = liquidity

  // TODO: Withdrawn liquidity will never be shown, since liquidity amounts currently are zeroed out upon withdrawal.
  const bought = amount >= 0 ? 'added' : 'withdrew'
  const money = formatMoney(Math.abs(amount))

  return (
    <div className="text-sm text-gray-500">
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
