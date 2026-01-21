import dayjs from 'dayjs'
import { BETTOR } from 'common/user'
import { useUser } from 'web/hooks/use-user'
import { Row } from 'web/components/layout/row'
import {
  Avatar,
  type AvatarSizeType,
  EmptyAvatar,
} from 'web/components/widgets/avatar'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { LiquidityProvision } from 'common/liquidity-provision'
import { UserLink } from 'web/components/widgets/user-link'
import { UserHovercard } from '../user/user-hovercard'
import { useDisplayUserById } from 'web/hooks/use-user-supabase'
import { DisplayUser } from 'common/api/user-types'
import { MoneyDisplay } from '../bet/money-display'
import clsx from 'clsx'

export function FeedLiquidity(props: {
  liquidity: LiquidityProvision
  isCashContract: boolean
  avatarSize?: AvatarSizeType
  className?: string
}) {
  const { liquidity, isCashContract, avatarSize, className } = props
  const { userId, createdTime } = liquidity

  const showUser = dayjs(createdTime).isAfter('2022-06-01')

  const bettor = useDisplayUserById(userId) ?? undefined

  const user = useUser()
  const isSelf = user?.id === userId

  return (
    <Row className={clsx('items-stretch gap-2', className)}>
      {isSelf ? (
        <Avatar
          avatarUrl={user.avatarUrl}
          username={user.username}
          size={avatarSize}
          entitlements={user.entitlements}
          displayContext="feed"
        />
      ) : showUser && bettor ? (
        <UserHovercard userId={userId}>
          <Avatar
            avatarUrl={bettor.avatarUrl}
            username={bettor.username}
            size={avatarSize}
            entitlements={bettor.entitlements}
            displayContext="feed"
          />
        </UserHovercard>
      ) : (
        <div className="relative px-1">
          <EmptyAvatar />
        </div>
      )}
      <LiquidityStatusText
        liquidity={liquidity}
        isSelf={isSelf}
        bettor={bettor}
        isCashContract={isCashContract}
      />
    </Row>
  )
}

function LiquidityStatusText(props: {
  liquidity: LiquidityProvision
  isSelf: boolean
  bettor?: DisplayUser
  isCashContract: boolean
}) {
  const { liquidity, bettor, isSelf, isCashContract } = props
  const { amount, createdTime, isAnte } = liquidity

  return (
    <div className="text-ink-1000 flex flex-wrap items-center gap-x-1 pr-4 text-sm">
      {bettor ? (
        <UserHovercard userId={bettor.id}>
          <UserLink user={bettor} className="font-semibold" />
        </UserHovercard>
      ) : (
        <span>{isSelf ? 'You' : `A ${BETTOR}`}</span>
      )}
      <span>
        {isAnte ? 'created question with' : amount >= 0 ? 'added' : 'withdrew'}
      </span>
      <MoneyDisplay amount={Math.abs(amount)} isCashContract={isCashContract} />
      <span>subsidy</span>
      <RelativeTimestamp time={createdTime} shortened />
    </div>
  )
}
