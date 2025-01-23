import { useUser } from 'hooks/use-user'
import { NotificationFrame } from '../notification-frame'
import { BettingStreakData } from 'common/notification'
import { Notification } from 'common/notification'
import { ThemedText } from 'components/themed-text'

import { Token } from 'components/token/token'
import { imageSizeMap } from 'components/user/avatar-circle'
import { humanish } from 'common/user'
import { BETTING_STREAK_BONUS_MAX } from 'common/economy'
import { WrittenAmount } from 'components/number/writtenCurrency'

export function BettingStreakBonusIncomeNotification(props: {
  notification: Notification
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup } = props
  const { sourceText } = notification
  const user = useUser()
  const {
    streak: streakInDays,
    cashAmount,
    bonusAmount,
  } = notification.data as BettingStreakData
  const noBonus = sourceText === '0'
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      icon={
        <Token
          overrideToken={'MANA'}
          style={{ width: imageSizeMap.md, height: imageSizeMap.md }}
        />
      }
      subtitle={
        noBonus && user && !humanish(user) ? (
          <ThemedText>
            Verify your phone number to get up to{' '}
            <WrittenAmount amount={BETTING_STREAK_BONUS_MAX} token="M$" /> per
            streak day!
          </ThemedText>
        ) : (
          noBonus &&
          user &&
          humanish(user) && (
            <ThemedText>
              Come back and predict again tomorrow for a bonus!
            </ThemedText>
          )
        )
      }
    >
      {noBonus ? (
        <ThemedText>
          Congrats on your{' '}
          {sourceText && <ThemedText size="md">{streakInDays} day</ThemedText>}{' '}
          prediction streak
        </ThemedText>
      ) : (
        <ThemedText>
          {cashAmount && (
            <>
              <WrittenAmount amount={cashAmount} token="CASH" />
              {' + '}
            </>
          )}
          {bonusAmount && <WrittenAmount amount={bonusAmount} token="M$" />}{' '}
          {sourceText && +sourceText === BETTING_STREAK_BONUS_MAX && (
            <ThemedText>(max) </ThemedText>
          )}
          bonus for your{' '}
          {sourceText && <ThemedText>{streakInDays} day</ThemedText>} prediction
          streak
        </ThemedText>
      )}
    </NotificationFrame>
  )
}
