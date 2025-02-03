import { Token } from 'components/token/token'
import { getNotificationColor, NotificationFrame } from '../notification-frame'
import { Notification } from 'common/notification'
import { IncomeNotificationLabel } from '../income-notification-label'
import { imageSizeMap } from 'components/user/avatar-circle'
import { QuestRewardTxn } from 'common/txn'
import { QUEST_DETAILS } from 'common/quest'

export function QuestIncomeNotification(props: {
  notification: Notification
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup } = props
  const { data } = notification

  const { questType } = data as QuestRewardTxn['data']
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
    >
      <>
        <IncomeNotificationLabel
          notification={notification}
          color={getNotificationColor(notification)}
        />{' '}
        bonus for completing the {QUEST_DETAILS[questType].title} quest
      </>
    </NotificationFrame>
  )
}
