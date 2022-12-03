import {
  DotsVerticalIcon,
  MinusCircleIcon,
  PlusCircleIcon,
} from '@heroicons/react/solid'
import clsx from 'clsx'
import { Notification, notification_reason_types } from 'common/notification'
import {
  notificationReasonToSubscriptionType,
  notification_preference,
} from 'common/user-notification-preferences'
import { usePrivateUser } from 'web/hooks/use-user'
import DropdownMenu from '../comments/dropdown-menu'
import { Spacer } from '../layout/spacer'
import {
  changeSetting,
  getUsersSavedPreference,
  notificationIsNecessary,
} from '../notification-settings'
import { getHighlightClass } from './notification-helpers'

export default function NotificationDropdown(props: {
  notification: Notification
  highlighted: boolean
}) {
  const { notification, highlighted } = props
  const notificationDropdownItems = useNotificationPreferenceItem(notification)

  if (notificationDropdownItems.length > 0) {
    return (
      <DropdownMenu
        Items={notificationDropdownItems}
        Icon={
          <DotsVerticalIcon
            className={clsx(
              'my-1 h-4 w-4 md:invisible md:group-hover:visible',
              getHighlightClass(highlighted)
            )}
          />
        }
        MenuWidth="w-52"
      />
    )
  }
  return <Spacer w={4} />
}

function useNotificationPreferenceItem(notification: Notification) {
  const privateUser = usePrivateUser()
  if (!privateUser) {
    return []
  }
  const reason = notification.reason as notification_reason_types
  const subType = notificationReasonToSubscriptionType[
    reason
  ] as notification_preference
  if (!subType) {
    return []
  }
  const destinations = getUsersSavedPreference(subType, privateUser)

  const inAppEnabled = destinations.includes('browser')
  const emailEnabled = destinations.includes('email')

  const canBeTurnedOff = !notificationIsNecessary(
    'browser',
    subType,
    emailEnabled,
    false,
    inAppEnabled
  )

  if (canBeTurnedOff) {
    return [
      {
        name: inAppEnabled
          ? 'Turn off this type of notification'
          : 'Turn on this type of notification',
        icon: inAppEnabled ? (
          <MinusCircleIcon className="h-5 w-5" />
        ) : (
          <PlusCircleIcon className="h-5 w-5" />
        ),
        onClick: () => {
          changeSetting(
            'browser',
            !inAppEnabled,
            privateUser,
            subType,
            destinations
          )
        },
      },
    ]
  } else return []
}
