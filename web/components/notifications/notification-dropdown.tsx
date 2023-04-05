import { useState } from 'react'
import {
  DotsVerticalIcon,
  EyeIcon,
  EyeOffIcon,
  MinusCircleIcon,
  PlusCircleIcon,
} from '@heroicons/react/solid'
import clsx from 'clsx'
import { Notification } from 'common/notification'
import { getNotificationPreference } from 'common/user-notification-preferences'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { followMarket, unfollowMarket } from '../buttons/follow-market-button'
import DropdownMenu, { DropdownItem } from '../comments/dropdown-menu'
import { Spacer } from '../layout/spacer'
import {
  changeSetting,
  getUsersSavedPreference,
  notificationIsNecessary,
} from '../notification-settings'

export default function NotificationDropdown(props: {
  notification: Notification
}) {
  const { notification } = props
  const notificationDropdownItems = useNotificationDropdownItems(notification)

  if (notificationDropdownItems.length > 0) {
    return (
      <DropdownMenu
        Items={notificationDropdownItems}
        Icon={
          <DotsVerticalIcon
            className={clsx('my-1 h-4 w-4 md:invisible md:group-hover:visible')}
          />
        }
        menuWidth="w-52"
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
  const reason = notification.reason
  const subType = getNotificationPreference(reason)
  const destinations = getUsersSavedPreference(subType, privateUser)

  const inAppEnabled = destinations.includes('browser')
  const emailEnabled = destinations.includes('email')

  const canBeTurnedOff = !notificationIsNecessary({
    setting: 'browser',
    subscriptionTypeKey: subType,
    emailEnabled: emailEnabled,
    newValue: !inAppEnabled,
    inAppEnabled: inAppEnabled,
  })

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
        onClick: () =>
          changeSetting({
            setting: 'browser',
            newValue: !inAppEnabled,
            privateUser: privateUser,
            subscriptionTypeKey: subType,
          }),
      } as DropdownItem,
    ]
  } else return []
}

function useNotificationFollowItem(notification: Notification) {
  const sourceContractId = notification.sourceContractId
  const sourceContractSlug = notification.sourceContractSlug
  const [isFollowing, setIsFollowing] = useState(true)
  const user = useUser()
  if (!user || !sourceContractId || !sourceContractSlug) {
    return []
  }
  return [
    {
      name: isFollowing ? 'Unfollow this market' : 'Follow this market',
      icon: isFollowing ? (
        <EyeOffIcon className="h-5 w-5" />
      ) : (
        <EyeIcon className="h-5 w-5" />
      ),
      onClick: () => {
        if (isFollowing) {
          setIsFollowing(false)
          unfollowMarket(sourceContractId, sourceContractSlug, user)
        } else {
          setIsFollowing(true)
          followMarket(sourceContractId, sourceContractSlug, user)
        }
      },
    } as DropdownItem,
  ]
}

function useNotificationDropdownItems(
  notification: Notification
): DropdownItem[] {
  return useNotificationFollowItem(notification).concat(
    useNotificationPreferenceItem(notification)
  )
}
