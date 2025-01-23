import { BetFillData, getSourceUrl } from 'common/notification'
import { NotificationFrame } from '../notification-frame'
import { ThemedText } from 'components/themed-text'
import { Notification } from 'common/notification'
import { Token } from 'components/token/token'
import { imageSizeMap } from 'components/user/avatar-circle'
import { WrittenAmount } from 'components/number/writtenCurrency'
import { CASH_NAME, MANA_NAME } from 'constants/token-names'
import { useColor } from 'hooks/use-color'
import { NumberText } from 'components/number-text'
import { getMoneyNumber } from 'common/util/format'

export function BetFillNotification(props: {
  notification: Notification
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup } = props
  const { sourceText, data } = notification
  const {
    creatorOutcome,
    probability,
    limitOrderRemaining,
    limitOrderTotal,
    limitAt: dataLimitAt,
    outcomeType,
    betAnswer,
    token,
  } = (data as BetFillData) ?? {}

  const color = useColor()
  const amount = parseInt(sourceText ?? '0')
  const limitAt =
    dataLimitAt !== undefined
      ? dataLimitAt
      : Math.round(probability * 100) + '%'

  const outcome =
    outcomeType === 'PSEUDO_NUMERIC'
      ? creatorOutcome === 'YES'
        ? ' HIGHER'
        : ' LOWER'
      : creatorOutcome

  const description =
    creatorOutcome && probability ? (
      <ThemedText>
        <WrittenAmount
          amount={amount}
          token={token === 'MANA' ? 'M$' : 'CASH'}
        />{' '}
        of your {outcome} {betAnswer && <ThemedText>• {betAnswer} </ThemedText>}
        limit order at {limitAt} was filled{' '}
      </ThemedText>
    ) : (
      <ThemedText>
        {' '}
        <WrittenAmount
          amount={amount}
          token={token === 'MANA' ? 'M$' : 'CASH'}
        />{' '}
        of your limit order was filled
      </ThemedText>
    )

  const subtitle = (
    <>
      {limitOrderRemaining === 0 && (
        <>
          Your limit order{' '}
          {limitOrderTotal && (
            <>
              for{' '}
              <WrittenAmount
                amount={limitOrderTotal}
                token={token === 'MANA' ? 'M$' : 'CASH'}
                color={color.textSecondary}
              />
            </>
          )}{' '}
          is complete
        </>
      )}
      {!!limitOrderRemaining && (
        <>
          You have{' '}
          <NumberText color={color.textSecondary}>
            {getMoneyNumber(limitOrderRemaining)}
          </NumberText>
          {limitOrderTotal && (
            <ThemedText color={color.textSecondary}>
              {' of '}
              <NumberText color={color.textSecondary}>
                {getMoneyNumber(limitOrderTotal)}
              </NumberText>
            </ThemedText>
          )}{' '}
          {token == 'MANA' ? MANA_NAME : CASH_NAME} remaining in your order
        </>
      )}
    </>
  )

  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      icon={
        <Token
          overrideToken={token}
          style={{ width: imageSizeMap.md, height: imageSizeMap.md }}
        />
      }
      subtitle={subtitle}
      link={getSourceUrl(notification)}
    >
      <ThemedText>{description}</ThemedText>
    </NotificationFrame>
  )
}
