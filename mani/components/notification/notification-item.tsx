import { Notification } from 'common/notification'
import { PushNotificationBonusNotification } from './types/push-notification-bonus'
import { QuestIncomeNotification } from './types/quest-income'

export function NotificationItem({
  notification,
  isChildOfGroup,
}: {
  notification: Notification
  isChildOfGroup?: boolean
}) {
  const { sourceType, reason, sourceUpdateType } = notification

  if (sourceType == 'push_notification_bonus') {
    return (
      <PushNotificationBonusNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
      />
    )
  } else if (sourceType == 'quest_reward') {
    return (
      <QuestIncomeNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
      />
    )
  }
}
