import { Notification } from 'common/notification'

export function NotificationItem({
  notification,
}: {
  notification: Notification
}) {
  const { sourceType, reason, sourceUpdateType } = notification

  if (sourceType == 'push_notification_bonus') {
    return <PushNotificationBonusNotification notification={notification} />
  }
}
