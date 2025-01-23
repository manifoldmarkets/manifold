import { ThemedText } from 'components/themed-text'
import { Notification } from 'common/notification'
import { groupBy } from 'lodash'

export function GroupNotificationHeader(props: {
  notifications: Notification[]
}) {
  const { notifications } = props
  const uniques = Object.keys(
    groupBy(notifications, (n: Notification) => n.sourceUserUsername)
  ).length
  const { sourceTitle, sourceContractTitle } = notifications[0]
  const onboardingNotifs = notifications.some(
    (n) => n.reason === 'onboarding_flow'
  )
  const questNotifs = notifications.some(
    (n) =>
      n.reason === 'quest_payout' || n.sourceType === 'betting_streak_bonus'
  )

  return (
    <ThemedText size="md">
      {notifications.some((n) => n.reason === 'contract_from_followed_user') ? (
        <>
          {notifications.length} new questions from{' '}
          {notifications[0].sourceUserName}
        </>
      ) : onboardingNotifs ? (
        <>Welcome to Manifold!</>
      ) : questNotifs ? (
        <>
          {notifications.length} quest
          {notifications.length > 1 ? 's' : ''} completed
        </>
      ) : sourceTitle || sourceContractTitle ? (
        <>
          {/* {uniques} user{uniques > 1 ? `s` : ``} on{' '} */}
          <NotificationHeader notification={notifications[0]} />
        </>
      ) : (
        <>
          Other activity from {uniques} user{uniques > 1 ? 's' : ''}
        </>
      )}
    </ThemedText>
  )
}

export function NotificationHeader(props: { notification: Notification }) {
  const { notification } = props
  const title = notification.sourceContractTitle || notification.sourceTitle
  if (!title) return null
  return (
    <ThemedText size="md" weight="normal">
      {title}
    </ThemedText>
  )
}
