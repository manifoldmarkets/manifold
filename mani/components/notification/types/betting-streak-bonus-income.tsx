import { useUser } from 'hooks/use-user'
import { getNotificationColor, NotificationFrame } from '../notification-frame'
import { BettingStreakData } from 'common/notification'
import { Notification } from 'common/notification'

import { Token } from 'components/token/token'
import { imageSizeMap } from 'components/user/avatar-circle'
import { canReceiveBonuses } from 'common/user'
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
        noBonus && user && !canReceiveBonuses(user) ? (
          <>
            Verify your identity to get up to{' '}
            <WrittenAmount
              amount={BETTING_STREAK_BONUS_MAX}
              token="M$"
              color={getNotificationColor(notification)}
            />{' '}
            per streak day!
          </>
        ) : (
          noBonus &&
          user &&
          canReceiveBonuses(user) && (
            <>Come back and predict again tomorrow for a bonus!</>
          )
        )
      }
    >
      {noBonus ? (
        <>
          Congrats on your {sourceText && <>{streakInDays} day</>} prediction
          streak
        </>
      ) : (
        <>
          {cashAmount && (
            <>
              <WrittenAmount
                amount={cashAmount}
                token="CASH"
                color={getNotificationColor(notification)}
              />
              {' + '}
            </>
          )}
          {bonusAmount && (
            <WrittenAmount
              amount={bonusAmount}
              token="M$"
              color={getNotificationColor(notification)}
            />
          )}{' '}
          {sourceText && +sourceText === BETTING_STREAK_BONUS_MAX && (
            <>(max) </>
          )}
          bonus for your {sourceText && <>{streakInDays} day</>} prediction
          streak
        </>
      )}
    </NotificationFrame>
  )
}
