import {
  ContractResolutionData,
  getSourceUrl,
  Notification,
} from 'common/notification'
import { floatingEqual } from 'common/util/math'
import { getNotificationColor, NotificationFrame } from '../notification-frame'
import { WrittenAmount } from 'components/number/writtenCurrency'

import { Token } from 'components/token/token'
import { imageSizeMap } from 'components/user/avatar-circle'
import {
  formatLargeNumber,
  formatPercent,
  getMoneyNumber,
} from 'common/util/format'
import { NumberText } from 'components/number-text'
import { truncateText } from 'lib/truncate-text'

export function MarketResolvedNotification(props: {
  notification: Notification

  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup } = props
  const { sourceText, data } = notification
  const { userInvestment, userPayout, profitRank, totalShareholders, token } =
    (data as ContractResolutionData) ?? {}
  const profit = userPayout - userInvestment
  const profitable = profit > 0 && !floatingEqual(userInvestment, 0)
  const betterThan = (totalShareholders ?? 0) - (profitRank ?? 0)
  const comparison =
    profitRank && totalShareholders && betterThan > 0
      ? `you outperformed ${betterThan} other${betterThan > 1 ? 's' : ''}!`
      : ''
  const title =
    sourceText === 'CANCEL' && userInvestment > 0 ? (
      <>
        <WrittenAmount
          amount={getMoneyNumber(userInvestment)}
          token={token === 'CASH' ? 'CASH' : 'M$'}
          color={getNotificationColor(notification)}
        />{' '}
        invested has has been returned to you
      </>
    ) : sourceText === 'CANCEL' && Math.abs(userPayout) > 0 ? (
      <>
        <WrittenAmount
          amount={getMoneyNumber(-userPayout)}
          token={token === 'CASH' ? 'CASH' : 'M$'}
          color={getNotificationColor(notification)}
        />{' '}
        in profit has been removed
      </>
    ) : profitable ? (
      <>
        <WrittenAmount
          amount={getMoneyNumber(userPayout)}
          token={token === 'CASH' ? 'CASH' : 'M$'}
          color={getNotificationColor(notification)}
        />{' '}
        paid out
        {/* Your {formatMoney(userInvestment, token)} won{' '}
        <span className="text-teal-600">+{formatMoney(profit, token)}</span> in
        profit */}
        {/* {comparison ? `, and ${comparison}` : ``} 🎉🎉🎉 */}
      </>
    ) : userInvestment > 0 ? (
      <>
        <WrittenAmount
          amount={getMoneyNumber(Math.abs(profit))}
          token={token === 'CASH' ? 'CASH' : 'M$'}
          color={getNotificationColor(notification)}
        />{' '}
        lost
        {/* {' '}
        {comparison ? `, but ${comparison}` : ``} */}
      </>
    ) : null

  const resolutionDescription = () => {
    if (!sourceText) return <div />

    if (sourceText === 'YES' || sourceText == 'NO') {
      return sourceText
    }

    if (sourceText.includes('%')) {
      return (
        // <ProbPercentLabel
        //   prob={parseFloat(sourceText.replace('%', '')) / 100}
        // />
        <NumberText color={getNotificationColor(notification)}>
          {formatPercent(parseFloat(sourceText.replace('%', '')) / 100)}
        </NumberText>
      )
    }
    if (sourceText === 'MKT' || sourceText === 'PROB')
      return <>multiple answers</>

    // Numeric markets
    const isNumberWithCommaOrPeriod = /^[0-9,.]*$/.test(sourceText)
    if (isNumberWithCommaOrPeriod)
      return (
        <NumberText color={getNotificationColor(notification)}>
          {formatLargeNumber(parseFloat(sourceText))}
        </NumberText>
      )

    // Free response market
    return <>{truncateText(sourceText, '2xl')}</>
  }

  const subtitle =
    sourceText === 'CANCEL' ? (
      <>This question was cancelled</>
    ) : (
      <>Resolved to {resolutionDescription()}</>
    )

  return (
    <>
      <NotificationFrame
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        icon={
          <Token
            overrideToken={token === 'CASH' ? 'CASH' : 'MANA'}
            style={{ width: imageSizeMap.md, height: imageSizeMap.md }}
          />
        }
        subtitle={subtitle}
        link={getSourceUrl(notification)}
      >
        {title}
      </NotificationFrame>
    </>
  )
}
