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
import { Linkify } from 'web/components/linkify'
import { OutcomeLabel } from 'web/components/outcome-label'

type NotificationGroup = {
  notifications: Notification[]
  sourceContractId: string
  isSeen: boolean
  timePeriod: string
}

export default function Notifications() {
  const user = useUser()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [allNotificationGroups, setAllNotificationsGroups] = useState<
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
    const notificationIdsToShow = GetAppropriateNotifications(
      notifications,
      privateUser.notificationPreferences
    ).map((notification) => notification.id)

    // Hide notifications the user doesn't want to see.
    const notificationIdsToHide = notifications
      .filter(
        (notification) => !notificationIdsToShow.includes(notification.id)
      )
      .map((notification) => notification.id)

    // Group notifications by contract and 24-hour time period.
    const allGroupedNotifications = GroupNotifications(
      notifications,
      notificationIdsToHide
    )

    // Don't add notifications that are already visible or have been seen.
    const currentlyVisibleUnseenNotificationIds = Object.values(
      unseenNotificationGroups
    )
      .map((n) => n.notifications.map((n) => n.id))
      .flat()
    const unseenGroupedNotifications = GroupNotifications(
      notifications.filter(
        (notification) =>
          !notification.isSeen ||
          currentlyVisibleUnseenNotificationIds.includes(notification.id)
      ),
      notificationIdsToHide
    )
    setAllNotificationsGroups(allGroupedNotifications)
    setUnseenNotificationGroups(unseenGroupedNotifications)

    // We don't want unseenNotificationsGroup to be in the dependencies as we update it here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications, privateUser])

  useEffect(() => {
    if (user) return listenForNotifications(user.id, setNotifications)
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
                        notification={notification.notifications[0]}
                        key={notification.notifications[0].id}
                      />
                    ) : (
                      <NotificationGroupItem
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
                  {allNotificationGroups.map((notification) =>
                    notification.notifications.length === 1 ? (
                      <NotificationItem
                        notification={notification.notifications[0]}
                        key={notification.notifications[0].id}
                      />
                    ) : (
                      <NotificationGroupItem
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

const setNotificationsAsSeen = (notifications: Notification[]) => {
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
  // Because hidden notifications won't be rendered, set them to seen here
  setNotificationsAsSeen(
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
    // Group notifications by contract:
    const groupedNotificationsByContractId = groupBy(
      notificationGroupsByDay[day],
      (notification) => {
        return notification.sourceContractId
      }
    )

    // Create a notification group for each contract within each day
    Object.keys(groupedNotificationsByContractId).forEach((contractId, i) => {
      const notificationGroup: NotificationGroup = {
        notifications: groupedNotificationsByContractId[contractId].sort(
          (a, b) => {
            return b.createdTime - a.createdTime
          }
        ),
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
  notificationGroup: NotificationGroup
  className?: string
}) {
  const { notificationGroup, className } = props
  const { sourceContractId, notifications } = notificationGroup
  const contract = useContract(sourceContractId ?? '')
  const [activitySummaryLines, setActivitySummaryLines] = useState<string[]>([])
  const numSummaryLines = 2

  const summarizeMostRecentActivity = async (notifications: Notification[]) => {
    let questionUpdates = 0
    const tempSummaryLines: string[] = []
    for (let i = 0; i < notifications.length; i++) {
      if (tempSummaryLines.length + questionUpdates >= numSummaryLines) break
      const notification = notifications[i]
      if (!notification) continue
      const { sourceType, sourceContractId, sourceId } = notification
      if (!sourceId || !sourceContractId) continue
      if (sourceType === 'comment' || sourceType === 'answer') {
        const summary = await GetNotificationSummaryText(
          sourceId,
          sourceContractId,
          sourceType
        )
        tempSummaryLines.push(
          sourceType === 'answer' ? `New answer: ${summary}` : summary
        )
      } else if (sourceType === 'contract') {
        questionUpdates += 1
      }
    }
    if (questionUpdates > 0)
      tempSummaryLines.push(
        `${questionUpdates} new question update${
          questionUpdates > 1 ? 's' : ''
        }`
      )
    setActivitySummaryLines(tempSummaryLines)
  }

  useEffect(() => {
    if (!contract) return
    setNotificationsAsSeen(notifications)
    summarizeMostRecentActivity(notifications)
  }, [contract, notifications])

  return (
    <div className={clsx('bg-white px-2 pt-6 text-sm sm:px-4', className)}>
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
              className={
                'inline-flex overflow-hidden text-ellipsis pl-1 sm:pl-0'
              }
            >
              {'Activity on '}
              {contract?.question ?? 'question'}
            </a>
          </div>
          <RelativeTimestamp time={notifications[0].createdTime} />
        </div>
      </Row>
      <a href={contract && `${contract.creatorUsername}/${contract.slug}`}>
        <div className={'mt-1 md:text-base'}>
          {' '}
          <div className={'line-clamp-4 mt-1 gap-1 whitespace-pre-line'}>
            {activitySummaryLines.map((line, i) => {
              return (
                <div key={line} className={'line-clamp-1'}>
                  <Linkify text={line} />
                </div>
              )
            })}
            <div>
              {notifications.length - numSummaryLines > 0
                ? 'And ' + (notifications.length - numSummaryLines) + ' more...'
                : ''}
            </div>
          </div>
        </div>

        <div className={'mt-6 border-b border-gray-300'} />
      </a>
    </div>
  )
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
    if (!privateUser) return
    setNotificationSettings(newValue)
    updatePrivateUser(privateUser.id, {
      notificationPreferences: newValue,
    })
  }

  useEffect(() => {
    if (privateUser && privateUser.notificationPreferences)
      setNotificationSettings(privateUser.notificationPreferences)
    else setNotificationSettings('all')
  }, [privateUser])

  if (!privateUser) {
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
        className={'col-span-4 w-24'}
      />
      <div className={' border-1 my-4 w-48 border-b border-gray-300'} />
      <div className={'mt-4'}>Email Notifications</div>
      <ChoicesToggleGroup
        currentChoice={emailNotificationSettings}
        choicesMap={{ All: 'all', Less: 'less', None: 'none' }}
        setChoice={(choice) =>
          changeEmailNotifications(choice as notification_subscribe_types)
        }
        className={'col-span-4 w-24'}
      />
    </div>
  )
}

function GetNotificationSummaryText(
  sourceId: string,
  sourceContractId: string,
  sourceType: 'answer' | 'comment'
) {
  if (sourceType === 'answer') {
    return getValue<Answer>(
      doc(db, `contracts/${sourceContractId}/answers/`, sourceId)
    ).then((answer) => {
      return answer?.text ?? ''
    })
  } else {
    return getValue<Comment>(
      doc(db, `contracts/${sourceContractId}/comments/`, sourceId)
    ).then((comment) => {
      return comment?.text ?? ''
    })
  }
}

function NotificationItem(props: { notification: Notification }) {
  const { notification } = props
  const {
    sourceType,
    sourceContractId,
    sourceId,
    sourceUserName,
    sourceUserAvatarUrl,
    reasonText,
    reason,
    sourceUserUsername,
    createdTime,
  } = notification
  const [notificationText, setNotificationText] = useState<string>('')
  const contract = useContract(sourceContractId ?? '')

  useEffect(() => {
    if (!contract || !sourceContractId) return
    if (sourceType === 'contract') {
      // We don't handle anything other than contract updates & resolution yet.
      if (contract.resolution) setNotificationText(contract.resolution)
      else setNotificationText(contract.question)
      return
    }
    if (!sourceId) return

    if (sourceType === 'answer' || sourceType === 'comment') {
      GetNotificationSummaryText(sourceId, sourceContractId, sourceType).then(
        (text) => {
          setNotificationText(text)
        }
      )
    } else if (reasonText) {
      // Handle arbitrary notifications with reason text here.
      setNotificationText(reasonText)
    }
  }, [contract, reasonText, sourceContractId, sourceId, sourceType])

  useEffect(() => {
    setNotificationsAsSeen([notification])
  }, [notification])

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
    <div className={'bg-white px-2 pt-6 text-sm sm:px-4'}>
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
              'flex max-w-sm shrink overflow-hidden text-ellipsis pl-1 sm:max-w-md sm:pl-0'
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
              {sourceType && reason && (
                <div className={'inline truncate'}>
                  {getReasonTextFromReason(sourceType, reason, contract)}
                </div>
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
          <NotificationOutcomeLabel
            contract={contract}
            notificationText={notificationText}
          />
        </div>

        <div className={'mt-6 border-b border-gray-300'} />
      </a>
    </div>
  )
}

function NotificationOutcomeLabel(props: {
  contract?: Contract
  notificationText: string
}) {
  const { contract, notificationText } = props
  if (!contract) return <LoadingIndicator />
  if (notificationText === contract.question) {
    return (
      <div className={'text-indigo-700 hover:underline'}>
        {notificationText}
      </div>
    )
  } else if (notificationText === contract.resolution) {
    return (
      <OutcomeLabel
        contract={contract}
        outcome={contract.resolution}
        truncate={'long'}
      />
    )
  } else {
    return (
      <div className={'line-clamp-4 whitespace-pre-line'}>
        <Linkify text={notificationText} />
      </div>
    )
  }
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
      if (contract?.resolution) reasonText = `resolved`
      else reasonText = `updated`
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
const less_priority_reasons = [
  'on_contract_with_users_comment',
  'on_contract_with_users_answer',
  'on_contract_with_users_shares_out',
  // Not sure if users will want to see these w/ less:
  // 'on_contract_with_users_shares_in',
]

export function GetAppropriateNotifications(
  notifications: Notification[],
  notificationPreferences?: notification_subscribe_types
) {
  if (notificationPreferences === 'all') return notifications
  if (notificationPreferences === 'less')
    return notifications.filter(
      (n) =>
        n.reason &&
        // Show all contract notifications
        (n.sourceType === 'contract' ||
          !less_priority_reasons.includes(n.reason))
    )
  if (notificationPreferences === 'none') return []

  return notifications
}
