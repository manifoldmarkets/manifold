import {
  combineAndSumIncomeNotifications,
  combineReactionNotifications,
  NotificationGroup,
  ReactionNotificationTypes,
} from 'common/notification'
import { useState } from 'react'
import { sortBy } from 'lodash'
import { Col } from 'components/layout/col'
import { NotificationItem } from './notification-item'
import { GroupNotificationHeader } from './notification-header'
import { useColor } from 'hooks/use-color'

export function NotificationGroupItem({
  notificationGroup,
}: {
  notificationGroup: NotificationGroup
}) {
  const { notifications } = notificationGroup
  const [groupHighlighted] = useState(notifications.some((n) => !n.isSeen))
  const { sourceTitle, sourceContractTitle } = notifications[0]
  const incomeTypesToSum = ['bonus', 'tip', 'tip_and_like']

  const combinedNotifs = sortBy(
    combineReactionNotifications(
      notifications.filter((n) =>
        ReactionNotificationTypes.includes(n.sourceType)
      )
    )
      .concat(
        notifications.filter(
          (n) =>
            !ReactionNotificationTypes.includes(n.sourceType) &&
            !incomeTypesToSum.includes(n.sourceType)
        )
      )
      .concat(
        combineAndSumIncomeNotifications(
          notifications.filter((n) => incomeTypesToSum.includes(n.sourceType))
        )
      ),
    'createdTime'
  ).reverse()
  const color = useColor()

  return (
    <Col
      style={{
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: color.borderSecondary,
      }}
    >
      <GroupNotificationHeader notificationGroup={notificationGroup} />
      <Col>
        {notifications.map((notification) => {
          return (
            <NotificationItem
              notification={notification}
              key={notification.id}
              isChildOfGroup={true}
            />
          )
        })}
      </Col>
    </Col>
  )
}
