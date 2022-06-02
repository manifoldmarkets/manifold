import { Tabs } from 'web/components/layout/tabs'
import { useUser } from 'web/hooks/use-user'
import React, { useEffect, useState } from 'react'
import {
  Notification,
  notification_reason_types,
  notification_source_types,
} from 'common/notification'
import { listenForNotifications } from 'web/lib/firebase/notifications'
import { Avatar } from 'web/components/avatar'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/page'
import { Title } from 'web/components/title'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from 'web/lib/firebase/init'
import { CopyLinkDateTimeComponent } from 'web/components/feed/copy-link-date-time'
import { Answer } from 'common/answer'
import { Comment } from 'web/lib/firebase/comments'
import { getValue } from 'web/lib/firebase/utils'
import Custom404 from 'web/pages/404'
import { UserLink } from 'web/components/user-page'
import { notification_subscribe_types, PrivateUser, User } from 'common/user'
import { useContract } from 'web/hooks/use-contract'
import { Contract } from 'common/contract'
import { ChoicesToggleGroup } from 'web/components/choices-toggle-group'
import { listenForPrivateUser, updatePrivateUser } from 'web/lib/firebase/users'
import { LoadingIndicator } from 'web/components/loading-indicator'
import clsx from 'clsx'
import { groupBy } from 'lodash'
import { UsersIcon } from '@heroicons/react/solid'
import { RelativeTimestamp } from 'web/components/relative-timestamp'

export default function Notifications() {
  const user = useUser()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notificationGroups, setNotificationsGroups] = useState<
    NotificationGroup[]
  >([])
  const [unseenNotificationGroups, setUnseenNotificationGroups] = useState<
    NotificationGroup[]
  >([])
  const [privateUser, setPrivateUser] = useState<PrivateUser | null>(null)
  useEffect(() => {
    if (user) listenForPrivateUser(user.id, setPrivateUser)
  }, [user])

  useEffect(() => {
    if (!privateUser) return
    const notificationsToShow = GetAppropriateNotifications(
      notifications,
      privateUser.notificationPreferences
    ).map((notification) => notification.id)
    // get notifications to hide using the ones we want to show
    const notificationsToHide = notifications
      .filter((notification) => !notificationsToShow.includes(notification.id))
      .map((notification) => notification.id)
    const groupedNotifs = GroupNotifications(notifications, notificationsToHide)
    const notificationIdsCurrentlyOnDisplay = Object.values(
      unseenNotificationGroups
    )
      .map((n) => n.notifications.map((n) => n.id))
      .flat()
    const groupedUnseenNotifs = GroupNotifications(
      notifications.filter(
        (notification) =>
          !notification.isSeen ||
          notificationIdsCurrentlyOnDisplay.includes(notification.id)
      ),
      notificationsToHide
    )
    setNotificationsGroups(groupedNotifs)
    setUnseenNotificationGroups(groupedUnseenNotifs)
  }, [notifications, privateUser])

  function setListenedNotifications(notifications: Notification[]) {
    setNotifications(notifications)
  }

  useEffect(() => {
    if (user) return listenForNotifications(user.id, setListenedNotifications)
  }, [user])

  if (!user) {
    // TODO: return sign in page
    return <Custom404 />
  }

  // TODO: use infinite scroll
  return (
    <Page>
      <div className={'p-2 sm:p-4'}>
        <Title text={'Notifications'} className={'hidden md:block'} />
        <Tabs
          className={'pb-2 pt-1 '}
          defaultIndex={0}
          tabs={[
            {
              title: 'New Notifications',
              content: (
                <div className={''}>
                  {unseenNotificationGroups.map((notification) =>
                    notification.notifications.length === 1 ? (
                      <NotificationItem
                        currentUser={user}
                        notification={notification.notifications[0]}
                        key={notification.notifications[0].id}
                      />
                    ) : (
                      <NotificationGroupItem
                        currentUser={user}
                        notificationGroup={notification}
                        key={notification.sourceContractId}
                      />
                    )
                  )}
                </div>
              ),
            },
            {
              title: 'All Notifications',
              content: (
                <div className={''}>
                  {notificationGroups.map((notification) =>
                    notification.notifications.length === 1 ? (
                      <NotificationItem
                        currentUser={user}
                        notification={notification.notifications[0]}
                        key={notification.notifications[0].id}
                      />
                    ) : (
                      <NotificationGroupItem
                        currentUser={user}
                        notificationGroup={notification}
                        key={notification.sourceContractId}
                      />
                    )
                  )}
                </div>
              ),
            },
            {
              title: 'Settings',
              content: (
                <div className={''}>
                  <NotificationSettings />
                </div>
              ),
            },
          ]}
        />
      </div>
    </Page>
  )
}
type NotificationGroup = {
  notifications: Notification[]
  sourceTypes: string[]
  sourceContractId: string
  isSeen: boolean
  timePeriod: string
}

const setSeenNotifications = (notifications: Notification[]) => {
  notifications.forEach((notification) => {
    if (!notification.isSeen)
      updateDoc(
        doc(db, `users/${notification.userId}/notifications/`, notification.id),
        {
          ...notification,
          isSeen: true,
          viewTime: new Date(),
        }
      )
  })
  return notifications
}

function GroupNotifications(
  notifications: Notification[],
  hideNotificationIds: string[]
) {
  // Because they won't be rendered, set them to seen here
  setSeenNotifications(
    notifications.filter((n) => hideNotificationIds.includes(n.id))
  )
  // Then remove them from the list of notifications to show
  notifications = notifications.filter(
    (notification) => !hideNotificationIds.includes(notification.id)
  )

  const notificationGroups: NotificationGroup[] = []
  const notificationGroupsByDay = groupBy(notifications, (notification) =>
    new Date(notification.createdTime).toDateString()
  )
  Object.keys(notificationGroupsByDay).forEach((day) => {
    // group notifications by sourceContractId:
    const groupedNotificationsByContractId = groupBy(
      notificationGroupsByDay[day],
      (notification) => {
        return notification.sourceContractId
      }
    )

    // create a notification group for each contract id
    Object.keys(groupedNotificationsByContractId).forEach((contractId, i) => {
      const groupedNotificationsBySourceType = groupBy(
        groupedNotificationsByContractId[contractId],
        (notification) => {
          return notification.sourceType
        }
      )

      const notificationGroup: NotificationGroup = {
        notifications: groupedNotificationsByContractId[contractId],
        sourceTypes: Object.keys(groupedNotificationsBySourceType).sort(),
        sourceContractId: contractId,
        isSeen: groupedNotificationsByContractId[contractId][0].isSeen,
        timePeriod: day,
      }
      notificationGroups.push(notificationGroup)
    })
  })
  return notificationGroups
}

function NotificationGroupItem(props: {
  currentUser: User
  notificationGroup: NotificationGroup
  className?: string
}) {
  const { notificationGroup, currentUser, className } = props
  const { sourceTypes, sourceContractId, notifications, timePeriod } =
    notificationGroup
  const contract = useContract(sourceContractId ?? '')

  useEffect(() => {
    if (!contract) return
    setSeenNotifications(notifications)
  }, [contract, notifications])

  return (
    <div className={clsx('bg-white px-1 pt-6 text-sm sm:px-4', className)}>
      <Row className={'items-center text-gray-500 sm:justify-start'}>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200">
          <UsersIcon className="h-5 w-5 text-gray-500" aria-hidden="true" />
        </div>
        <div className={'flex-1 overflow-hidden pl-2 sm:flex'}>
          <div
            className={
              'flex max-w-sm shrink overflow-hidden text-ellipsis sm:max-w-md'
            }
          >
            <a
              href={contract && `${contract.creatorUsername}/${contract.slug}`}
              className={'inline-flex overflow-hidden text-ellipsis'}
            >
              {'Activity on '}
              {contract?.question ?? 'contract'}
            </a>
          </div>
          <RelativeTimestamp time={notifications[0].createdTime} />
        </div>
      </Row>
      <a href={contract && `${contract.creatorUsername}/${contract.slug}`}>
        <div className={'mt-1 md:text-base'}>
          {' '}
          <div className={'line-clamp-4 whitespace-pre-line'}>
            {sourceTypes.map((sourceType, index) => (
              <span>
                {notificationGroupText(
                  notifications.filter((n) => n.sourceType === sourceType)
                ) +
                  (index === sourceTypes.length - 1
                    ? ''
                    : index === sourceTypes.length - 2
                    ? ', & '
                    : ', ')}
              </span>
            ))}
          </div>
        </div>

        <div className={'mt-6 border-b border-gray-300'} />
      </a>
    </div>
  )
}
function notificationGroupText(notifications: Notification[]) {
  const numNotifications = notifications.length
  const sourceType = notifications[0].sourceType
  if (sourceType === 'contract') {
    return `${numNotifications} ${sourceType} update${
      numNotifications > 1 ? 's' : ''
    }`
  }
  if (sourceType === 'answer') {
    return `${numNotifications} new ${sourceType}${
      numNotifications > 1 ? 's' : ''
    }`
  }
  return `${numNotifications} ${sourceType}${numNotifications > 1 ? 's' : ''}`
}

function NotificationSettings() {
  const user = useUser()
  const [notificationSettings, setNotificationSettings] =
    useState<notification_subscribe_types>('all')
  const [emailNotificationSettings, setEmailNotificationSettings] =
    useState<notification_subscribe_types>('all')
  const [privateUser, setPrivateUser] = useState<PrivateUser | null>(null)

  useEffect(() => {
    if (user) listenForPrivateUser(user.id, setPrivateUser)
  }, [user])

  useEffect(() => {
    if (!privateUser) return
    if (privateUser.notificationPreferences) {
      setNotificationSettings(privateUser.notificationPreferences)
    }
    if (
      privateUser.unsubscribedFromCommentEmails ||
      privateUser.unsubscribedFromAnswerEmails
    ) {
      setEmailNotificationSettings('less')
    }
    if (
      privateUser.unsubscribedFromResolutionEmails &&
      privateUser.unsubscribedFromCommentEmails &&
      privateUser.unsubscribedFromAnswerEmails
    ) {
      setEmailNotificationSettings('none')
    }
  }, [privateUser])

  function changeEmailNotifications(newValue: notification_subscribe_types) {
    if (!privateUser) return
    setEmailNotificationSettings(newValue)
    if (newValue === 'all') {
      updatePrivateUser(privateUser.id, {
        unsubscribedFromResolutionEmails: false,
        unsubscribedFromCommentEmails: false,
        unsubscribedFromAnswerEmails: false,
      })
    } else if (newValue === 'less') {
      updatePrivateUser(privateUser.id, {
        unsubscribedFromResolutionEmails: false,
        unsubscribedFromCommentEmails: true,
        unsubscribedFromAnswerEmails: true,
      })
    } else if (newValue === 'none') {
      updatePrivateUser(privateUser.id, {
        unsubscribedFromCommentEmails: true,
        unsubscribedFromAnswerEmails: true,
        unsubscribedFromResolutionEmails: true,
      })
    }
  }

  function changeInAppNotificationSettings(
    newValue: notification_subscribe_types
  ) {
    setNotificationSettings(newValue)
    if (privateUser) {
      updatePrivateUser(privateUser.id, {
        notificationPreferences: newValue,
      })
    }
  }

  useEffect(() => {
    if (privateUser && privateUser.notificationPreferences)
      setNotificationSettings(privateUser.notificationPreferences)
    else setNotificationSettings('all')
  }, [privateUser])

  if (!user && !privateUser) {
    return <LoadingIndicator />
  }

  return (
    <div className={'p-2'}>
      <div>In App Notifications</div>
      <ChoicesToggleGroup
        currentChoice={notificationSettings}
        choicesMap={{ All: 'all', Less: 'less', None: 'none' }}
        setChoice={(choice) =>
          changeInAppNotificationSettings(
            choice as notification_subscribe_types
          )
        }
        className={'col-span-4'}
      />
      <div className={' border-1 my-4 w-48 border-b border-gray-300'} />
      <div className={'mt-4'}>Email Notifications</div>
      <ChoicesToggleGroup
        currentChoice={emailNotificationSettings}
        choicesMap={{ All: 'all', Less: 'less', None: 'none' }}
        setChoice={(choice) =>
          changeEmailNotifications(choice as notification_subscribe_types)
        }
        className={'col-span-4'}
      />
    </div>
  )
}

function NotificationItem(props: {
  currentUser: User
  notification: Notification
  className?: string
}) {
  const { notification, currentUser, className } = props
  const {
    sourceType,
    sourceContractId,
    sourceId,
    userId,
    id,
    sourceUserName,
    sourceUserAvatarUrl,
    reasonText,
    reason,
    sourceUserUsername,
    createdTime,
  } = notification
  const [subText, setSubText] = useState<string>('')
  const contract = useContract(sourceContractId ?? '')

  useEffect(() => {
    if (!contract) return
    if (sourceType === 'contract') {
      setSubText(contract.question)
    }
  }, [contract, sourceType])

  useEffect(() => {
    if (!sourceContractId || !sourceId) return

    if (sourceType === 'answer') {
      getValue<Answer>(
        doc(db, `contracts/${sourceContractId}/answers/`, sourceId)
      ).then((answer) => {
        setSubText(answer?.text || '')
      })
    } else if (sourceType === 'comment') {
      getValue<Comment>(
        doc(db, `contracts/${sourceContractId}/comments/`, sourceId)
      ).then((comment) => {
        setSubText(comment?.text || '')
      })
    }
  }, [sourceContractId, sourceId, sourceType])

  useEffect(() => {
    if (!contract || notification.isSeen) return
    setSeenNotifications([notification])
  }, [notification, contract, currentUser, id, userId])

  function getSourceUrl(sourceId?: string) {
    if (!contract) return ''
    return `/${contract.creatorUsername}/${
      contract.slug
    }#${getSourceIdForLinkComponent(sourceId ?? '')}`
  }

  function getSourceIdForLinkComponent(sourceId: string) {
    switch (sourceType) {
      case 'answer':
        return `answer-${sourceId}`
      case 'comment':
        return sourceId
      case 'contract':
        return ''
      default:
        return sourceId
    }
  }

  return (
    <div className={clsx('bg-white px-1 pt-6 text-sm sm:px-4', className)}>
      <Row className={'items-center text-gray-500 sm:justify-start'}>
        <Avatar
          avatarUrl={sourceUserAvatarUrl}
          size={'sm'}
          className={'mr-2'}
          username={sourceUserName}
        />
        <div className={'flex-1 overflow-hidden sm:flex'}>
          <div
            className={
              'flex max-w-sm shrink overflow-hidden text-ellipsis sm:max-w-md'
            }
          >
            <UserLink
              name={sourceUserName || ''}
              username={sourceUserUsername || ''}
              className={'mr-0 flex-shrink-0'}
            />
            <a
              href={getSourceUrl(sourceId)}
              className={'inline-flex overflow-hidden text-ellipsis pl-1'}
            >
              {sourceType && reason ? (
                <div className={'inline truncate'}>
                  {getReasonTextFromReason(sourceType, reason, contract)}
                </div>
              ) : (
                reasonText
              )}
            </a>
          </div>
          {contract && sourceId && (
            <CopyLinkDateTimeComponent
              contract={contract}
              createdTime={createdTime}
              elementId={getSourceIdForLinkComponent(sourceId)}
              className={'-mx-1 inline-flex sm:inline-block'}
            />
          )}
        </div>
      </Row>
      <a href={getSourceUrl(sourceId)}>
        <div className={'mt-1 md:text-base'}>
          {' '}
          {contract && subText === contract.question ? (
            <div className={'text-indigo-700 hover:underline'}>{subText}</div>
          ) : (
            <div className={'line-clamp-4 whitespace-pre-line'}>{subText}</div>
          )}
        </div>

        <div className={'mt-6 border-b border-gray-300'} />
      </a>
    </div>
  )
}

function getReasonTextFromReason(
  source: notification_source_types,
  reason: notification_reason_types,
  contract: Contract | undefined
) {
  let reasonText = ''
  switch (source) {
    case 'comment':
      if (reason === 'reply_to_users_answer')
        reasonText = 'replied to your answer on'
      else if (reason === 'tagged_user')
        reasonText = 'tagged you in a comment on'
      else if (reason === 'reply_to_users_comment')
        reasonText = 'replied to your comment on'
      else if (reason === 'on_users_contract')
        reasonText = `commented on your question `
      else if (reason === 'on_contract_with_users_comment')
        reasonText = `commented on`
      else if (reason === 'on_contract_with_users_answer')
        reasonText = `commented on`
      else if (reason === 'on_contract_with_users_shares_in')
        reasonText = `commented`
      else reasonText = `commented on`
      break
    case 'contract':
      reasonText = `${reason}`
      break
    case 'answer':
      if (reason === 'on_users_contract') reasonText = `answered your question `
      if (reason === 'on_contract_with_users_comment') reasonText = `answered`
      else if (reason === 'on_contract_with_users_answer')
        reasonText = `answered`
      else if (reason === 'on_contract_with_users_shares_in')
        reasonText = `answered`
      else reasonText = `answered`
      break
    default:
      reasonText = ''
  }
  return `${reasonText} ${contract?.question}`
}
const less_reasons = [
  'on_contract_with_users_comment',
  'on_contract_with_users_answer',
]

// TODO: this should be able to pick up why the notification was created
export function GetAppropriateNotifications(
  notifications: Notification[],
  notificationPreferences?: notification_subscribe_types
) {
  if (notificationPreferences === 'all') return notifications
  if (notificationPreferences === 'less')
    return notifications.filter(
      (n) => n.reason && !less_reasons.includes(n.reason)
    )
  if (notificationPreferences === 'none') return []

  return notifications
}
