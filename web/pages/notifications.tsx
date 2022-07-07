import { Tabs } from 'web/components/layout/tabs'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import React, { useEffect, useState } from 'react'
import { Notification, notification_source_types } from 'common/notification'
import { Avatar, EmptyAvatar } from 'web/components/avatar'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/page'
import { Title } from 'web/components/title'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from 'web/lib/firebase/init'
import { CopyLinkDateTimeComponent } from 'web/components/feed/copy-link-date-time'
import { UserLink } from 'web/components/user-page'
import { notification_subscribe_types, PrivateUser } from 'common/user'
import { Contract } from 'common/contract'
import { ChoicesToggleGroup } from 'web/components/choices-toggle-group'
import { listenForPrivateUser, updatePrivateUser } from 'web/lib/firebase/users'
import { LoadingIndicator } from 'web/components/loading-indicator'
import clsx from 'clsx'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { Linkify } from 'web/components/linkify'
import {
  BinaryOutcomeLabel,
  CancelLabel,
  MultiLabel,
  ProbPercentLabel,
} from 'web/components/outcome-label'
import {
  NotificationGroup,
  usePreferredGroupedNotifications,
} from 'web/hooks/use-notifications'
import { CheckIcon, TrendingUpIcon, XIcon } from '@heroicons/react/outline'
import toast from 'react-hot-toast'
import { formatMoney } from 'common/util/format'
import { groupPath } from 'web/lib/firebase/groups'
import { UNIQUE_BETTOR_BONUS_AMOUNT } from 'common/numeric-constants'
import { groupBy, sum, uniq } from 'lodash'
import Custom404 from 'web/pages/404'

export const NOTIFICATIONS_PER_PAGE = 30
const MULTIPLE_USERS_KEY = 'multipleUsers'

export default function Notifications() {
  const user = useUser()
  const privateUser = usePrivateUser(user?.id)

  if (!user) return <Custom404 />
  return (
    <Page>
      <div className={'p-2 sm:p-4'}>
        <Title text={'Notifications'} className={'hidden md:block'} />
        <div>
          <Tabs
            labelClassName={'pb-2 pt-1 '}
            className={'mb-0 sm:mb-2'}
            defaultIndex={0}
            tabs={[
              {
                title: 'Notifications',
                content: privateUser ? (
                  <NotificationsList privateUser={privateUser} />
                ) : (
                  <LoadingIndicator />
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
      </div>
    </Page>
  )
}

function NotificationsList(props: { privateUser: PrivateUser }) {
  const { privateUser } = props
  const [page, setPage] = useState(1)
  const allGroupedNotifications = usePreferredGroupedNotifications(privateUser)
  const [paginatedGroupedNotifications, setPaginatedGroupedNotifications] =
    useState<NotificationGroup[] | undefined>(undefined)

  useEffect(() => {
    if (!allGroupedNotifications) return
    const start = (page - 1) * NOTIFICATIONS_PER_PAGE
    const end = start + NOTIFICATIONS_PER_PAGE
    const maxNotificationsToShow = allGroupedNotifications.slice(start, end)
    const remainingNotification = allGroupedNotifications.slice(end)
    for (const notification of remainingNotification) {
      if (notification.isSeen) break
      else setNotificationsAsSeen(notification.notifications)
    }
    setPaginatedGroupedNotifications(maxNotificationsToShow)
  }, [allGroupedNotifications, page])

  if (!paginatedGroupedNotifications || !allGroupedNotifications)
    return <LoadingIndicator />

  return (
    <div className={'min-h-[100vh]'}>
      {paginatedGroupedNotifications.length === 0 && (
        <div className={'mt-2'}>
          You don't have any notifications. Try changing your settings to see
          more.
        </div>
      )}

      {paginatedGroupedNotifications.map((notification) =>
        notification.type === 'income' ? (
          <IncomeNotificationGroupItem
            notificationGroup={notification}
            key={notification.groupedById + notification.timePeriod}
          />
        ) : notification.notifications.length === 1 ? (
          <NotificationItem
            notification={notification.notifications[0]}
            key={notification.notifications[0].id}
          />
        ) : (
          <NotificationGroupItem
            notificationGroup={notification}
            key={notification.groupedById + notification.timePeriod}
          />
        )
      )}
      {paginatedGroupedNotifications.length > 0 &&
        allGroupedNotifications.length > NOTIFICATIONS_PER_PAGE && (
          <nav
            className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6"
            aria-label="Pagination"
          >
            <div className="hidden sm:block">
              <p className="text-sm text-gray-700">
                Showing{' '}
                <span className="font-medium">
                  {page === 1 ? page : (page - 1) * NOTIFICATIONS_PER_PAGE}
                </span>{' '}
                to{' '}
                <span className="font-medium">
                  {page * NOTIFICATIONS_PER_PAGE}
                </span>{' '}
                of{' '}
                <span className="font-medium">
                  {allGroupedNotifications.length}
                </span>{' '}
                results
              </p>
            </div>
            <div className="flex flex-1 justify-between sm:justify-end">
              <a
                href="#"
                className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                onClick={() => page > 1 && setPage(page - 1)}
              >
                Previous
              </a>
              <a
                href="#"
                className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                onClick={() =>
                  page <
                    allGroupedNotifications?.length / NOTIFICATIONS_PER_PAGE &&
                  setPage(page + 1)
                }
              >
                Next
              </a>
            </div>
          </nav>
        )}
    </div>
  )
}

function IncomeNotificationGroupItem(props: {
  notificationGroup: NotificationGroup
  className?: string
}) {
  const { notificationGroup, className } = props
  const { notifications } = notificationGroup
  const numSummaryLines = 3
  const [expanded, setExpanded] = useState(false)
  const [highlighted, setHighlighted] = useState(
    notifications.some((n) => !n.isSeen)
  )

  useEffect(() => {
    setNotificationsAsSeen(notifications)
  }, [notifications])

  useEffect(() => {
    if (expanded) setHighlighted(false)
  }, [expanded])

  const totalIncome = sum(
    notifications.map((notification) =>
      notification.sourceText ? parseInt(notification.sourceText) : 0
    )
  )
  // Loop through the contracts and combine the notification items into one
  function combineNotificationsByAddingNumericSourceTexts(
    notifications: Notification[]
  ) {
    const newNotifications = []
    const groupedNotificationsBySourceType = groupBy(
      notifications,
      (n) => n.sourceType
    )
    for (const sourceType in groupedNotificationsBySourceType) {
      const groupedNotificationsByContractId = groupBy(
        groupedNotificationsBySourceType[sourceType],
        (notification) => {
          return notification.sourceContractId
        }
      )
      for (const contractId in groupedNotificationsByContractId) {
        const notificationsForContractId =
          groupedNotificationsByContractId[contractId]
        if (notificationsForContractId.length === 1) {
          newNotifications.push(notificationsForContractId[0])
          continue
        }
        let sum = 0
        notificationsForContractId.forEach(
          (notification) =>
            notification.sourceText &&
            (sum = parseInt(notification.sourceText) + sum)
        )
        const uniqueUsers = uniq(
          notificationsForContractId.map((notification) => {
            return notification.sourceUserUsername
          })
        )

        const newNotification = {
          ...notificationsForContractId[0],
          sourceText: sum.toString(),
          sourceUserUsername:
            uniqueUsers.length > 1
              ? MULTIPLE_USERS_KEY
              : notificationsForContractId[0].sourceType,
        }
        newNotifications.push(newNotification)
      }
    }
    return newNotifications
  }

  const combinedNotifs =
    combineNotificationsByAddingNumericSourceTexts(notifications)

  return (
    <div
      className={clsx(
        'relative cursor-pointer bg-white px-2 pt-6 text-sm',
        className,
        !expanded ? 'hover:bg-gray-100' : '',
        highlighted && !expanded ? 'bg-indigo-200 hover:bg-indigo-100' : ''
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
        <TrendingUpIcon className={'text-primary h-7 w-7'} />
        <div className={'flex truncate'}>
          <div
            onClick={() => setExpanded(!expanded)}
            className={'line-clamp-1 cursor-pointer pl-1  sm:pl-0'}
          >
            <span>
              {'Daily Income Summary: '}
              <span className={'text-primary'}>
                {'+' + formatMoney(totalIncome)}
              </span>
            </span>
            <RelativeTimestamp time={notifications[0].createdTime} />
          </div>
        </div>
      </Row>
      <div>
        <div className={clsx('mt-1 md:text-base', expanded ? 'pl-4' : '')}>
          {' '}
          <div
            className={clsx(
              'mt-1 ml-1 gap-1 whitespace-pre-line',
              !expanded ? 'line-clamp-4' : ''
            )}
          >
            {!expanded ? (
              <>
                {combinedNotifs
                  .slice(0, numSummaryLines)
                  .map((notification) => (
                    <IncomeNotificationItem
                      notification={notification}
                      justSummary={true}
                      key={notification.id}
                    />
                  ))}
                <div className={'text-sm text-gray-500 hover:underline '}>
                  {combinedNotifs.length - numSummaryLines > 0
                    ? 'And ' +
                      (combinedNotifs.length - numSummaryLines) +
                      ' more...'
                    : ''}
                </div>
              </>
            ) : (
              <>
                {combinedNotifs.map((notification) => (
                  <IncomeNotificationItem
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

function IncomeNotificationItem(props: {
  notification: Notification
  justSummary?: boolean
}) {
  const { notification, justSummary } = props
  const {
    sourceType,
    sourceUserName,
    reason,
    sourceUserUsername,
    createdTime,
  } = notification
  const [highlighted] = useState(!notification.isSeen)

  useEffect(() => {
    setNotificationsAsSeen([notification])
  }, [notification])

  function getReasonForShowingIncomeNotification(simple: boolean) {
    const { sourceText } = notification
    let reasonText = ''
    if (sourceType === 'bonus' && sourceText) {
      reasonText = !simple
        ? `Bonus for ${
            parseInt(sourceText) / UNIQUE_BETTOR_BONUS_AMOUNT
          } unique bettors`
        : 'bonus on'
    } else if (sourceType === 'tip') {
      reasonText = !simple ? `tipped you` : `in tips on`
    }
    return <span className={'flex-shrink-0'}>{reasonText}</span>
  }

  if (justSummary) {
    return (
      <Row className={'items-center text-sm text-gray-500 sm:justify-start'}>
        <div className={'line-clamp-1 flex-1 overflow-hidden sm:flex'}>
          <div className={'flex pl-1 sm:pl-0'}>
            <div className={'inline-flex overflow-hidden text-ellipsis pl-1'}>
              <div className={'mr-1 text-black'}>
                <NotificationTextLabel
                  contract={null}
                  defaultText={notification.sourceText ?? ''}
                  className={'line-clamp-1'}
                  notification={notification}
                  justSummary={true}
                />
              </div>
              <span className={'flex truncate'}>
                {getReasonForShowingIncomeNotification(true)}
                <NotificationLink notification={notification} />
              </span>
            </div>
          </div>
        </div>
      </Row>
    )
  }

  return (
    <div
      className={clsx(
        'bg-white px-2 pt-6 text-sm sm:px-4',
        highlighted && 'bg-indigo-200 hover:bg-indigo-100'
      )}
    >
      <a href={getSourceUrl(notification)}>
        <Row className={'items-center text-gray-500 sm:justify-start'}>
          <div className={'flex max-w-xl shrink '}>
            {sourceType && reason && (
              <div className={'inline'}>
                <span className={'mr-1'}>
                  <NotificationTextLabel
                    contract={null}
                    defaultText={notification.sourceText ?? ''}
                    notification={notification}
                  />
                </span>

                {sourceType != 'bonus' &&
                  (sourceUserUsername === MULTIPLE_USERS_KEY ? (
                    <span className={'mr-1 truncate'}>Multiple users</span>
                  ) : (
                    <UserLink
                      name={sourceUserName || ''}
                      username={sourceUserUsername || ''}
                      className={'mr-1 flex-shrink-0'}
                      justFirstName={true}
                    />
                  ))}
              </div>
            )}
            {getReasonForShowingIncomeNotification(false)}
            <span className={'ml-1 flex hidden sm:inline-block'}>
              on
              <NotificationLink notification={notification} />
            </span>
            <RelativeTimestamp time={createdTime} />
          </div>
        </Row>
        <span className={'flex truncate text-gray-500 sm:hidden'}>
          on
          <NotificationLink notification={notification} />
        </span>
        <div className={'mt-4 border-b border-gray-300'} />
      </a>
    </div>
  )
}

function NotificationGroupItem(props: {
  notificationGroup: NotificationGroup
  className?: string
}) {
  const { notificationGroup, className } = props
  const { notifications } = notificationGroup
  const { sourceContractTitle } = notifications[0]
  const numSummaryLines = 3

  const [expanded, setExpanded] = useState(false)
  const [highlighted, setHighlighted] = useState(
    notifications.some((n) => !n.isSeen)
  )
  useEffect(() => {
    setNotificationsAsSeen(notifications)
  }, [notifications])

  useEffect(() => {
    if (expanded) setHighlighted(false)
  }, [expanded])

  return (
    <div
      className={clsx(
        'relative cursor-pointer bg-white px-2 pt-6 text-sm',
        className,
        !expanded ? 'hover:bg-gray-100' : '',
        highlighted && !expanded ? 'bg-indigo-200 hover:bg-indigo-100' : ''
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
        <EmptyAvatar multi />
        <div className={'flex truncate pl-2'}>
          <div
            onClick={() => setExpanded(!expanded)}
            className={' flex cursor-pointer truncate pl-1  sm:pl-0'}
          >
            {sourceContractTitle ? (
              <>
                <span className={'flex-shrink-0'}>{'Activity on '}</span>
                <span className={'truncate'}>
                  <NotificationLink notification={notifications[0]} />
                </span>
              </>
            ) : (
              'Other activity'
            )}
          </div>
          <RelativeTimestamp time={notifications[0].createdTime} />
        </div>
      </Row>
      <div>
        <div className={clsx('mt-1 md:text-base', expanded ? 'pl-4' : '')}>
          {' '}
          <div
            className={clsx(
              'mt-1 ml-1 gap-1 whitespace-pre-line',
              !expanded ? 'line-clamp-4' : ''
            )}
          >
            {' '}
            {!expanded ? (
              <>
                {notifications.slice(0, numSummaryLines).map((notification) => {
                  return (
                    <NotificationItem
                      notification={notification}
                      justSummary={true}
                      key={notification.id}
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
                {notifications.map((notification) => (
                  <NotificationItem
                    notification={notification}
                    key={notification.id}
                    justSummary={false}
                    hideTitle={true}
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

function NotificationItem(props: {
  notification: Notification
  justSummary?: boolean
  hideTitle?: boolean
}) {
  const { notification, justSummary, hideTitle } = props
  const {
    sourceType,
    sourceId,
    sourceUserName,
    sourceUserAvatarUrl,
    sourceUpdateType,
    reasonText,
    reason,
    sourceUserUsername,
    createdTime,
    sourceText,
    sourceContractCreatorUsername,
    sourceContractSlug,
  } = notification

  const [defaultNotificationText, setDefaultNotificationText] =
    useState<string>('')

  useEffect(() => {
    if (sourceText) {
      setDefaultNotificationText(sourceText)
    } else if (reasonText) {
      // Handle arbitrary notifications with reason text here.
      setDefaultNotificationText(reasonText)
    }
  }, [reasonText, sourceText])

  const [highlighted] = useState(!notification.isSeen)

  useEffect(() => {
    setNotificationsAsSeen([notification])
  }, [notification])

  if (justSummary) {
    return (
      <Row className={'items-center text-sm text-gray-500 sm:justify-start'}>
        <div className={'line-clamp-1 flex-1 overflow-hidden sm:flex'}>
          <div className={'flex pl-1 sm:pl-0'}>
            <UserLink
              name={sourceUserName || ''}
              username={sourceUserUsername || ''}
              className={'mr-0 flex-shrink-0'}
              justFirstName={true}
            />
            <div className={'inline-flex overflow-hidden text-ellipsis pl-1'}>
              <span className={'flex-shrink-0'}>
                {sourceType &&
                  reason &&
                  getReasonForShowingNotification(notification, true, true)}
              </span>
              <div className={'ml-1 text-black'}>
                <NotificationTextLabel
                  contract={null}
                  defaultText={defaultNotificationText}
                  className={'line-clamp-1'}
                  notification={notification}
                  justSummary={true}
                />
              </div>
            </div>
          </div>
        </div>
      </Row>
    )
  }

  return (
    <div
      className={clsx(
        'bg-white px-2 pt-6 text-sm sm:px-4',
        highlighted && 'bg-indigo-200 hover:bg-indigo-100'
      )}
    >
      <a href={getSourceUrl(notification)}>
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
              {sourceUpdateType != 'closed' && (
                <UserLink
                  name={sourceUserName || ''}
                  username={sourceUserUsername || ''}
                  className={'mr-0 flex-shrink-0'}
                  justFirstName={true}
                />
              )}
              {sourceType && reason && (
                <div className={'inline flex truncate'}>
                  <span className={'ml-1 flex-shrink-0'}>
                    {getReasonForShowingNotification(notification, false, true)}
                  </span>
                  {!hideTitle && (
                    <NotificationLink notification={notification} />
                  )}
                </div>
              )}
              {sourceId &&
              sourceContractSlug &&
              sourceContractCreatorUsername ? (
                <CopyLinkDateTimeComponent
                  prefix={sourceContractCreatorUsername}
                  slug={sourceContractSlug}
                  createdTime={createdTime}
                  elementId={getSourceIdForLinkComponent(sourceId)}
                  className={'-mx-1 inline-flex sm:inline-block'}
                />
              ) : (
                <RelativeTimestamp time={createdTime} />
              )}
            </div>
          </div>
        </Row>
        <div className={'mt-1 ml-1 md:text-base'}>
          <NotificationTextLabel
            contract={null}
            defaultText={defaultNotificationText}
            notification={notification}
          />
        </div>

        <div className={'mt-6 border-b border-gray-300'} />
      </a>
    </div>
  )
}

export const setNotificationsAsSeen = (notifications: Notification[]) => {
  notifications.forEach((notification) => {
    if (!notification.isSeen)
      updateDoc(
        doc(db, `users/${notification.userId}/notifications/`, notification.id),
        {
          isSeen: true,
          viewTime: new Date(),
        }
      )
  })
  return notifications
}

function NotificationLink(props: { notification: Notification }) {
  const { notification } = props
  const {
    sourceType,
    sourceContractTitle,
    sourceContractCreatorUsername,
    sourceContractSlug,
    sourceSlug,
    sourceTitle,
  } = notification
  return (
    <a
      href={
        sourceContractCreatorUsername
          ? `/${sourceContractCreatorUsername}/${sourceContractSlug}`
          : sourceType === 'group' && sourceSlug
          ? `${groupPath(sourceSlug)}`
          : ''
      }
      className={
        'ml-1 inline max-w-xs truncate font-bold text-gray-500 hover:underline hover:decoration-indigo-400 hover:decoration-2 sm:max-w-sm'
      }
    >
      {sourceContractTitle || sourceTitle}
    </a>
  )
}

function getSourceUrl(notification: Notification) {
  const {
    sourceType,
    sourceId,
    sourceUserUsername,
    sourceContractCreatorUsername,
    sourceContractSlug,
    sourceSlug,
  } = notification
  if (sourceType === 'follow') return `/${sourceUserUsername}`
  if (sourceType === 'group' && sourceSlug) return `${groupPath(sourceSlug)}`
  if (
    sourceContractCreatorUsername &&
    sourceContractSlug &&
    sourceType === 'user'
  )
    return `/${sourceContractCreatorUsername}/${sourceContractSlug}`
  if (sourceType === 'tip')
    return `/${sourceContractCreatorUsername}/${sourceContractSlug}#${sourceSlug}`
  if (sourceContractCreatorUsername && sourceContractSlug)
    return `/${sourceContractCreatorUsername}/${sourceContractSlug}#${getSourceIdForLinkComponent(
      sourceId ?? '',
      sourceType
    )}`
}

function getSourceIdForLinkComponent(
  sourceId: string,
  sourceType?: notification_source_types
) {
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

function NotificationTextLabel(props: {
  defaultText: string
  contract?: Contract | null
  notification: Notification
  className?: string
  justSummary?: boolean
}) {
  const { contract, className, defaultText, notification, justSummary } = props
  const { sourceUpdateType, sourceType, sourceText, sourceContractTitle } =
    notification
  if (sourceType === 'contract') {
    if (justSummary)
      return <span>{contract?.question || sourceContractTitle}</span>
    if (!sourceText) return <div />
    // Resolved contracts
    if (sourceType === 'contract' && sourceUpdateType === 'resolved') {
      {
        if (sourceText === 'YES' || sourceText == 'NO') {
          return <BinaryOutcomeLabel outcome={sourceText as any} />
        }
        if (sourceText.includes('%'))
          return (
            <ProbPercentLabel prob={parseFloat(sourceText.replace('%', ''))} />
          )
        if (sourceText === 'CANCEL') return <CancelLabel />
        if (sourceText === 'MKT' || sourceText === 'PROB') return <MultiLabel />
      }
    }
    // Close date will be a number - it looks better without it
    if (sourceUpdateType === 'closed') {
      return <div />
    }
    // Updated contracts
    // Description will be in default text
    if (parseInt(sourceText) > 0) {
      return (
        <span>
          Updated close time: {new Date(parseInt(sourceText)).toLocaleString()}
        </span>
      )
    }
  } else if (sourceType === 'user' && sourceText) {
    return (
      <span>
        As a thank you, we sent you{' '}
        <span className="text-primary">
          {formatMoney(parseInt(sourceText))}
        </span>
        !
      </span>
    )
  } else if (sourceType === 'liquidity' && sourceText) {
    return (
      <span className="text-blue-400">{formatMoney(parseInt(sourceText))}</span>
    )
  } else if ((sourceType === 'bonus' || sourceType === 'tip') && sourceText) {
    return (
      <span className="text-primary">
        {'+' + formatMoney(parseInt(sourceText))}
      </span>
    )
  }
  // return default text
  return (
    <div className={className ? className : 'line-clamp-4 whitespace-pre-line'}>
      <Linkify text={defaultText} />
    </div>
  )
}

function getReasonForShowingNotification(
  notification: Notification,
  simple?: boolean,
  replaceOn?: boolean
) {
  const { sourceType, sourceUpdateType, reason, sourceSlug } = notification
  let reasonText: string
  switch (sourceType) {
    case 'comment':
      if (reason === 'reply_to_users_answer')
        reasonText = !simple ? 'replied to you on' : 'replied'
      else if (reason === 'tagged_user')
        reasonText = !simple ? 'tagged you on' : 'tagged you'
      else if (reason === 'reply_to_users_comment')
        reasonText = !simple ? 'replied to you on' : 'replied'
      else if (reason === 'on_users_contract')
        reasonText = !simple ? `commented on your question` : 'commented'
      else if (reason === 'on_contract_with_users_comment')
        reasonText = `commented on`
      else if (reason === 'on_contract_with_users_answer')
        reasonText = `commented on`
      else if (reason === 'on_contract_with_users_shares_in')
        reasonText = `commented on`
      else reasonText = `commented on`
      break
    case 'contract':
      if (reason === 'you_follow_user') reasonText = 'asked'
      else if (sourceUpdateType === 'resolved') reasonText = `resolved`
      else if (sourceUpdateType === 'closed')
        reasonText = `Please resolve your question`
      else reasonText = `updated`
      break
    case 'answer':
      if (reason === 'on_users_contract') reasonText = `answered your question `
      else if (reason === 'on_contract_with_users_comment')
        reasonText = `answered`
      else if (reason === 'on_contract_with_users_answer')
        reasonText = `answered`
      else if (reason === 'on_contract_with_users_shares_in')
        reasonText = `answered`
      else reasonText = `answered`
      break
    case 'follow':
      reasonText = 'followed you'
      break
    case 'liquidity':
      reasonText = 'added liquidity to your question'
      break
    case 'group':
      reasonText = 'added you to the group'
      break
    case 'user':
      if (sourceSlug && reason === 'user_joined_to_bet_on_your_market')
        reasonText = 'joined to bet on your market'
      else if (sourceSlug) reasonText = 'joined because you shared'
      else reasonText = 'joined because of you'
      break
    default:
      reasonText = ''
  }

  return (
    <span className={'flex-shrink-0'}>
      {replaceOn ? reasonText.replace(' on', '') : reasonText}
    </span>
  )
}

// TODO: where should we put referral bonus notifications?
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
      <div className={'mt-4 text-sm'}>
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
              highlight={notificationSettings !== 'none'}
              label={"Income & referral bonuses you've received"}
            />
            <NotificationSettingLine
              label={"Activity on questions you've ever bet or commented on"}
              highlight={notificationSettings === 'all'}
            />
          </div>
        </div>
      </div>
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
      <div className={'mt-4 text-sm'}>
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
      </div>
    </div>
  )
}
