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
import EnvelopeClosedIcon from 'web/lib/icons/envelope-closed-icon'
import EnvelopeOpenIcon from 'web/lib/icons/envelope-open-icon'
import DropdownMenu from '../comments/dropdown-menu'
import {
  changeSetting,
  getUsersSavedPreference,
  notificationIsNecessary,
} from '../notification-settings'
import {
  getHighlightClass,
  markNotificationAsSeen,
  markNotificationAsUnseen,
} from './notification-helpers'

export default function NotificationDropdown(props: {
  notification: Notification
  highlighted: boolean
}) {
  const { notification, highlighted } = props
  const notificationDropdownItems = useNotificationDropdownItems(
    notification,
    highlighted
  )
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

function useNotificationDropdownItems(
  notification: Notification,
  highlighted: boolean
) {
  const dropdownItems = [
    {
      name: highlighted ? 'Mark as read' : 'Mark as unread',
      icon: highlighted ? (
        <EnvelopeOpenIcon className="h-5 w-5" />
      ) : (
        <EnvelopeClosedIcon className="h-5 w-5" />
      ),
      onClick: () => {
        if (highlighted) {
          markNotificationAsSeen(notification)
        } else {
          markNotificationAsUnseen(notification)
        }
      },
    },
  ]
  return dropdownItems.concat(useNotificationPreferenceItem(notification))
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
  //   if (!destinations.includes('browser')) {
  //     return []
  //   }

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
          ? 'Turn OFF this type of notification'
          : 'Turn ON this type of notification',
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
