import {
  ContractResolutionData,
  getSourceUrl,
  Notification,
} from 'common/notification'
import { floatingEqual } from 'common/util/math'
import { useState } from 'react'
import { NotificationFrame } from '../notification-frame'
import { WrittenAmount } from 'components/number/writtenCurrency'
import {
  MANIFOLD_AVATAR_URL,
  MANIFOLD_USER_NAME,
  MANIFOLD_USER_USERNAME,
} from 'common/user'
import { Token } from 'components/token/token'
import { imageSizeMap } from 'components/user/avatar-circle'

export function MarketResolvedNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted, setHighlighted } = props
  const {
    sourceText,
    data,
    sourceId,
    sourceUserName,
    sourceUserUsername,
    sourceContractTitle,
    sourceContractCreatorUsername,
  } = notification
  const { userInvestment, userPayout, profitRank, totalShareholders, token } =
    (data as ContractResolutionData) ?? {}
  const profit = userPayout - userInvestment
  const profitable = profit > 0 && !floatingEqual(userInvestment, 0)
  const betterThan = (totalShareholders ?? 0) - (profitRank ?? 0)
  const comparison =
    profitRank && totalShareholders && betterThan > 0
      ? `you outperformed ${betterThan} other${betterThan > 1 ? 's' : ''}!`
      : ''
  const secondaryTitle =
    sourceText === 'CANCEL' && userInvestment > 0 ? (
      <>
        <WrittenAmount
          amount={userInvestment}
          token={token === 'MANA' ? 'M$' : 'CASH'}
        />{' '}
        invested has has been returned to you
      </>
    ) : sourceText === 'CANCEL' && Math.abs(userPayout) > 0 ? (
      <>
        <WrittenAmount
          amount={-userPayout}
          token={token === 'MANA' ? 'M$' : 'CASH'}
        />{' '}
        in profit has been removed
      </>
    ) : profitable ? (
      <>
        <WrittenAmount
          amount={userPayout}
          token={token === 'MANA' ? 'M$' : 'CASH'}
        />{' '}
        paid out
        {/* Your {formatMoney(userInvestment, token)} won{' '}
        <span className="text-teal-600">+{formatMoney(profit, token)}</span> in
        profit */}
        {/* {comparison ? `, and ${comparison}` : ``} 🎉🎉🎉 */}
      </>
    ) : userInvestment > 0 ? (
      <>
        You lost{' '}
        <WrittenAmount
          amount={profit}
          token={token === 'MANA' ? 'M$' : 'CASH'}
        />
        {/* {' '}
        {comparison ? `, but ${comparison}` : ``} */}
      </>
    ) : null

  const [openRateModal, setOpenRateModal] = useState(false)

  const resolutionDescription = () => {
    if (!sourceText) return <div />

    if (sourceText === 'YES' || sourceText == 'NO') {
      return <BinaryOutcomeLabel outcome={sourceText as any} />
    }

    if (sourceText.includes('%')) {
      return (
        <ProbPercentLabel
          prob={parseFloat(sourceText.replace('%', '')) / 100}
        />
      )
    }
    if (sourceText === 'MKT' || sourceText === 'PROB') return <MultiLabel />

    // Numeric markets
    const isNumberWithCommaOrPeriod = /^[0-9,.]*$/.test(sourceText)
    if (isNumberWithCommaOrPeriod)
      return <NumericValueLabel value={parseFloat(sourceText)} />

    // Free response market
    return (
      <span
        className={
          'inline-block max-w-[200px] truncate align-bottom text-blue-600'
        }
      >
        {sourceText}
      </span>
    )
  }

  const resolvedByAdmin = sourceUserUsername != sourceContractCreatorUsername

  const showManifoldAsResolver = token === 'CASH'

  const resolverName = showManifoldAsResolver
    ? MANIFOLD_USER_NAME
    : resolvedByAdmin
    ? 'A mod'
    : sourceUserName
  const resolverUsername = showManifoldAsResolver
    ? MANIFOLD_USER_USERNAME
    : sourceUserUsername
  const resolverAvatarUrl = showManifoldAsResolver
    ? MANIFOLD_AVATAR_URL
    : notification.sourceUserAvatarUrl

  const content =
    sourceText === 'CANCEL' ? (
      <>
        <NotificationUserLink
          userId={sourceId}
          name={resolverName}
          username={resolverUsername}
        />{' '}
        cancelled {isChildOfGroup && <span>the question</span>}
        {!isChildOfGroup && (
          <span>
            {' '}
            <PrimaryNotificationLink
              text={sourceContractTitle}
              truncatedLength={'xl'}
            />
          </span>
        )}
      </>
    ) : (
      <>
        <NotificationUserLink
          userId={sourceId}
          name={resolverName}
          username={resolverUsername}
        />{' '}
        resolved {isChildOfGroup && <span>the question</span>}
        {!isChildOfGroup && (
          <span>
            <PrimaryNotificationLink
              text={sourceContractTitle}
              truncatedLength={'xl'}
            />
          </span>
        )}{' '}
        to {resolutionDescription()}
      </>
    )

  return (
    <>
      <NotificationFrame
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        icon={
          <Token
            overrideToken={token}
            style={{ width: imageSizeMap.md, height: imageSizeMap.md }}
          />
        }
        link={getSourceUrl(notification)}
      >
        {content}
      </NotificationFrame>
    </>
  )
}
