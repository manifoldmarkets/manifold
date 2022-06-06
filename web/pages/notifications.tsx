import { Tabs } from 'web/components/layout/tabs'
import { useUser } from 'web/hooks/use-user'
import React, { useEffect, useState } from 'react'
import {
  Notification,
  notification_reason_types,
  notification_source_types,
} from 'common/notification'
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
import { notification_subscribe_types, PrivateUser } from 'common/user'
import { useContract } from 'web/hooks/use-contract'
import { Contract } from 'common/contract'
import { ChoicesToggleGroup } from 'web/components/choices-toggle-group'
import { listenForPrivateUser, updatePrivateUser } from 'web/lib/firebase/users'
import { LoadingIndicator } from 'web/components/loading-indicator'
import clsx from 'clsx'
import { groupBy, map } from 'lodash'
import { UsersIcon } from '@heroicons/react/solid'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { Linkify } from 'web/components/linkify'
import {
  FreeResponseOutcomeLabel,
  OutcomeLabel,
} from 'web/components/outcome-label'
import { useNotifications } from 'web/hooks/use-notifications'
import { getContractFromId } from 'web/lib/firebase/contracts'
import { CheckIcon, XIcon } from '@heroicons/react/outline'
import toast from 'react-hot-toast'

type NotificationGroup = {
  notifications: Notification[]
  sourceContractId: string
  isSeen: boolean
  timePeriod: string
}

export default function Notifications() {
  const user = useUser()
  const [allNotificationGroups, setAllNotificationsGroups] = useState<
    NotificationGroup[]
  >([])
  const [unseenNotificationGroups, setUnseenNotificationGroups] = useState<
    NotificationGroup[]
  >([])
  const notifications = useNotifications(user?.id, { unseenOnly: false })

  useEffect(() => {
    const notificationIdsToShow = notifications.map(
      (notification) => notification.id
    )
    // Hide notifications the user doesn't want to see.
    const notificationIdsToHide = notifications
      .filter(
        (notification) => !notificationIdsToShow.includes(notification.id)
      )
      .map((notification) => notification.id)

    // Because hidden notifications won't be rendered, set them to seen here
    setNotificationsAsSeen(
      notifications.filter((n) => notificationIdsToHide.includes(n.id))
    )

    // Group notifications by contract and 24-hour time period.
    const allGroupedNotifications = groupNotifications(
      notifications,
      notificationIdsToHide
    )

    // Don't add notifications that are already visible or have been seen.
    const currentlyVisibleUnseenNotificationIds = Object.values(
      unseenNotificationGroups
    )
      .map((n) => n.notifications.map((n) => n.id))
      .flat()
    const unseenGroupedNotifications = groupNotifications(
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
  }, [notifications])

  if (user === undefined) {
    return <LoadingIndicator />
  }
  if (user === null) {
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
                  {unseenNotificationGroups.length === 0 &&
                    "You don't have any new notifications."}
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
                  {allNotificationGroups.length === 0 &&
                    "You don't have any notifications."}
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

function groupNotifications(
  notifications: Notification[],
  hideNotificationIds: string[]
) {
  // Then remove them from the list of notifications to show
  notifications = notifications.filter(
    (notification) => !hideNotificationIds.includes(notification.id)
  )

  let notificationGroups: NotificationGroup[] = []
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
    notificationGroups = notificationGroups.concat(
      map(groupedNotificationsByContractId, (notifications, contractId) => {
        // Create a notification group for each contract within each day
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
        return notificationGroup
      })
    )
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
  const numSummaryLines = 3
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!contract) return
    setNotificationsAsSeen(notifications)
  }, [contract, notifications])

  return (
    <div
      className={clsx(
        'relative cursor-pointer bg-white px-2 pt-6 text-sm',
        className,
        !expanded ? 'hover:bg-gray-100' : ''
      )}
      onClick={() => setExpanded(!expanded)}
    >
      {expanded && (
        <span
          className="absolute top-14 left-6 -ml-px h-[calc(100%-5rem)] w-0.5 bg-gray-200"
          aria-hidden="true"
        />
      )}
      <Row className={'items-center text-gray-500 sm:justify-start'}>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200">
          <UsersIcon className="h-5 w-5 text-gray-500" aria-hidden="true" />
        </div>
        <div className={'flex-1 overflow-hidden pl-2 sm:flex'}>
          <div
            onClick={() => setExpanded(!expanded)}
            className={'line-clamp-1 cursor-pointer pl-1  sm:pl-0'}
          >
            {'Activity on '}
            <span className={'mx-1 font-bold'}>{contract?.question}</span>
          </div>
          <RelativeTimestamp time={notifications[0].createdTime} />
        </div>
      </Row>
      <div>
        <div className={clsx('mt-1 md:text-base', expanded ? 'pl-4' : '')}>
          {' '}
          <div className={'line-clamp-4 mt-1 gap-1 whitespace-pre-line'}>
            {!expanded ? (
              <>
                {notifications
                  .slice(0, numSummaryLines)
                  .map((notification, i) => {
                    return (
                      <NotificationItem
                        notification={notification}
                        justSummary={true}
                      />
                    )
                  })}
                <div className={'text-sm text-gray-500 hover:underline '}>
                  {notifications.length - numSummaryLines > 0
                    ? 'And ' +
                      (notifications.length - numSummaryLines) +
                      ' more...'
                    : ''}
                </div>
              </>
            ) : (
              <>
                {notifications.map((notification, i) => (
                  <NotificationItem
                    notification={notification}
                    key={notification.id}
                    justSummary={false}
                  />
                ))}
              </>
            )}
          </div>
        </div>

        <div className={'mt-6 border-b border-gray-300'} />
      </div>
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
  const [showSettings, setShowSettings] = useState<'in-app' | 'email' | 'none'>(
    'none'
  )

  useEffect(() => {
    if (user) listenForPrivateUser(user.id, setPrivateUser)
  }, [user])

  useEffect(() => {
    if (!privateUser) return
    if (privateUser.notificationPreferences) {
      setNotificationSettings(privateUser.notificationPreferences)
    }
    if (
      privateUser.unsubscribedFromResolutionEmails &&
      privateUser.unsubscribedFromCommentEmails &&
      privateUser.unsubscribedFromAnswerEmails
    ) {
      setEmailNotificationSettings('none')
    } else if (
      !privateUser.unsubscribedFromResolutionEmails &&
      !privateUser.unsubscribedFromCommentEmails &&
      !privateUser.unsubscribedFromAnswerEmails
    ) {
      setEmailNotificationSettings('all')
    } else {
      setEmailNotificationSettings('less')
    }
  }, [privateUser])

  const loading = 'Changing Notifications Settings'
  const success = 'Notification Settings Changed!'
  function changeEmailNotifications(newValue: notification_subscribe_types) {
    if (!privateUser) return
    setShowSettings('email')
    if (newValue === 'all') {
      toast.promise(
        updatePrivateUser(privateUser.id, {
          unsubscribedFromResolutionEmails: false,
          unsubscribedFromCommentEmails: false,
          unsubscribedFromAnswerEmails: false,
        }),
        {
          loading,
          success,
          error: (err) => `${err.message}`,
        }
      )
    } else if (newValue === 'less') {
      toast.promise(
        updatePrivateUser(privateUser.id, {
          unsubscribedFromResolutionEmails: false,
          unsubscribedFromCommentEmails: true,
          unsubscribedFromAnswerEmails: true,
        }),
        {
          loading,
          success,
          error: (err) => `${err.message}`,
        }
      )
    } else if (newValue === 'none') {
      toast.promise(
        updatePrivateUser(privateUser.id, {
          unsubscribedFromResolutionEmails: true,
          unsubscribedFromCommentEmails: true,
          unsubscribedFromAnswerEmails: true,
        }),
        {
          loading,
          success,
          error: (err) => `${err.message}`,
        }
      )
    }
  }

  function changeInAppNotificationSettings(
    newValue: notification_subscribe_types
  ) {
    if (!privateUser) return
    toast.promise(
      updatePrivateUser(privateUser.id, {
        notificationPreferences: newValue,
      }),
      {
        loading,
        success,
        error: (err) => `${err.message}`,
      }
    )
    setShowSettings('in-app')
  }

  useEffect(() => {
    if (privateUser && privateUser.notificationPreferences)
      setNotificationSettings(privateUser.notificationPreferences)
    else setNotificationSettings('all')
  }, [privateUser])

  if (!privateUser) {
    return <LoadingIndicator spinnerClassName={'border-gray-500 h-4 w-4'} />
  }

  function NotificationSettingLine(props: {
    label: string
    highlight: boolean
  }) {
    const { label, highlight } = props
    return (
      <Row className={clsx('my-1 text-gray-300', highlight && '!text-black')}>
        {highlight ? <CheckIcon height={20} /> : <XIcon height={20} />}
        {label}
      </Row>
    )
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
        className={'col-span-4 p-2'}
        toggleClassName={'w-24'}
      />
      <div className={'mt-4'}>Email Notifications</div>
      <ChoicesToggleGroup
        currentChoice={emailNotificationSettings}
        choicesMap={{ All: 'all', Less: 'less', None: 'none' }}
        setChoice={(choice) =>
          changeEmailNotifications(choice as notification_subscribe_types)
        }
        className={'col-span-4 p-2'}
        toggleClassName={'w-24'}
      />
      <div className={'mt-4 text-base'}>
        {showSettings === 'in-app' ? (
          <div>
            <div className={''}>
              You will receive notifications for:
              <NotificationSettingLine
                label={"Resolution of questions you've interacted with"}
                highlight={notificationSettings !== 'none'}
              />
              <NotificationSettingLine
                highlight={notificationSettings !== 'none'}
                label={'Activity on your own questions, comments, & answers'}
              />
              <NotificationSettingLine
                highlight={notificationSettings !== 'none'}
                label={"Activity on questions you're betting on"}
              />
              <NotificationSettingLine
                label={"Activity on questions you've ever bet or commented on"}
                highlight={notificationSettings === 'all'}
              />
            </div>
          </div>
        ) : showSettings === 'email' ? (
          <div>
            You will receive emails for:
            <NotificationSettingLine
              label={"Resolution of questions you're betting on"}
              highlight={emailNotificationSettings !== 'none'}
            />
            <NotificationSettingLine
              label={'Closure of your questions'}
              highlight={emailNotificationSettings !== 'none'}
            />
            <NotificationSettingLine
              label={'Activity on your questions'}
              highlight={emailNotificationSettings === 'all'}
            />
            <NotificationSettingLine
              label={"Activity on questions you've answered or commented on"}
              highlight={emailNotificationSettings === 'all'}
            />
          </div>
        ) : (
          <div />
        )}
      </div>
    </div>
  )
}

async function getNotificationSummaryText(
  sourceId: string,
  sourceContractId: string,
  sourceType: 'answer' | 'comment',
  setText: (text: string) => void
) {
  if (sourceType === 'answer') {
    const answer = await getValue<Answer>(
      doc(db, `contracts/${sourceContractId}/answers/`, sourceId)
    )
    setText(answer?.text ?? '')
  } else {
    const comment = await getValue<Comment>(
      doc(db, `contracts/${sourceContractId}/comments/`, sourceId)
    )
    setText(comment?.text ?? '')
  }
}

function NotificationItem(props: {
  notification: Notification
  justSummary?: boolean
}) {
  const { notification, justSummary } = props
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
  const [contract, setContract] = useState<Contract | null>(null)
  useEffect(() => {
    if (!sourceContractId) return
    getContractFromId(sourceContractId).then((contract) => {
      if (contract) setContract(contract)
    })
  }, [sourceContractId])

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
      getNotificationSummaryText(
        sourceId,
        sourceContractId,
        sourceType,
        setNotificationText
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

  function isNotificationContractResolution() {
    return sourceType === 'contract' && contract?.resolution
  }

  if (justSummary) {
    return (
      <Row className={'items-center text-sm text-gray-500 sm:justify-start'}>
        <div className={'line-clamp-1 flex-1 overflow-hidden sm:flex'}>
          <div className={'flex pl-1 sm:pl-0'}>
            <UserLink
              name={sourceUserName || ''}
              username={sourceUserUsername || ''}
              className={'mr-0 flex-shrink-0'}
            />
            <div className={'inline-flex overflow-hidden text-ellipsis pl-1'}>
              {sourceType &&
                reason &&
                getReasonTextFromReason(
                  sourceType,
                  reason,
                  contract,
                  true
                ).replace(' on', '')}
              <div className={'ml-1 text-black'}>
                {contract ? (
                  <NotificationTextLabel
                    contract={contract}
                    notificationText={notificationText}
                    className={'line-clamp-1'}
                  />
                ) : sourceType != 'follow' ? (
                  <LoadingIndicator
                    spinnerClassName={'border-gray-500 h-4 w-4'}
                  />
                ) : (
                  <div />
                )}
              </div>
            </div>
          </div>
        </div>
      </Row>
    )
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
              'flex max-w-xl shrink overflow-hidden text-ellipsis pl-1 sm:pl-0'
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
                  <span className={'mx-1 font-bold'}>{contract?.question}</span>
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
          {isNotificationContractResolution() && ' Resolved:'}{' '}
          {contract ? (
            <NotificationTextLabel
              contract={contract}
              notificationText={notificationText}
            />
          ) : sourceType != 'follow' ? (
            <LoadingIndicator spinnerClassName={'border-gray-500 h-4 w-4'} />
          ) : (
            <div />
          )}
        </div>

        <div className={'mt-6 border-b border-gray-300'} />
      </a>
    </div>
  )
}

function NotificationTextLabel(props: {
  contract: Contract
  notificationText: string
  className?: string
}) {
  const { contract, notificationText, className } = props
  if (notificationText === contract.question) {
    return (
      <div className={clsx('text-indigo-700 hover:underline', className)}>
        {notificationText}
      </div>
    )
  } else if (notificationText === contract.resolution) {
    if (contract.outcomeType === 'FREE_RESPONSE') {
      return (
        <FreeResponseOutcomeLabel
          contract={contract}
          resolution={contract.resolution}
          truncate={'long'}
          answerClassName={className}
        />
      )
    }
    return (
      <OutcomeLabel
        contract={contract}
        outcome={contract.resolution}
        truncate={'long'}
      />
    )
  } else {
    return (
      <div
        className={className ? className : 'line-clamp-4 whitespace-pre-line'}
      >
        <Linkify text={notificationText} />
      </div>
    )
  }
}

function getReasonTextFromReason(
  source: notification_source_types,
  reason: notification_reason_types,
  contract: Contract | undefined | null,
  simple?: boolean
) {
  let reasonText = ''
  switch (source) {
    case 'comment':
      if (reason === 'reply_to_users_answer')
        reasonText = !simple ? 'replied to your answer on' : 'replied'
      else if (reason === 'tagged_user')
        reasonText = !simple ? 'tagged you in a comment on' : 'tagged you'
      else if (reason === 'reply_to_users_comment')
        reasonText = !simple ? 'replied to your comment on' : 'replied'
      else if (reason === 'on_users_contract')
        reasonText = !simple ? `commented on your question` : 'commented'
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
    case 'follow':
      reasonText = 'followed you'
      break
    default:
      reasonText = ''
  }
  return reasonText
}
