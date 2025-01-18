export function PushNotificationBonusNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
}) {
  const { notification, highlighted, setHighlighted } = props
  return (
    <NotificationFrame
      notification={notification}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      isChildOfGroup={true}
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'🎁'} />
      }
    >
      <span className="line-clamp-3">
        <IncomeNotificationLabel notification={notification} />{' '}
        <span className={'font-semibold'}>Bonus</span> for enabling push
        notifications
      </span>
    </NotificationFrame>
  )
}
