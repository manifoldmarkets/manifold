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
import { UserLink } from 'web/components/user-page'
import {
  MANIFOLD_AVATAR_URL,
  MANIFOLD_USERNAME,
  notification_subscribe_types,
  PrivateUser,
  User,
} from 'common/user'
import { ChoicesToggleGroup } from 'web/components/choices-toggle-group'
import {
  getUser,
  listenForPrivateUser,
  updatePrivateUser,
} from 'web/lib/firebase/users'
import { LoadingIndicator } from 'web/components/loading-indicator'
import clsx from 'clsx'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { Linkify } from 'web/components/linkify'
import {
  BinaryOutcomeLabel,
  CancelLabel,
  MultiLabel,
  NumericValueLabel,
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
import { track } from '@amplitude/analytics-browser'
import { Pagination } from 'web/components/pagination'
import { useWindowSize } from 'web/hooks/use-window-size'
import Router from 'next/router'
import { safeLocalStorage } from 'web/lib/util/local'
import {
  getServerAuthenticatedUid,
  redirectIfLoggedOut,
} from 'web/lib/firebase/server-auth'

export const NOTIFICATIONS_PER_PAGE = 30
const MULTIPLE_USERS_KEY = 'multipleUsers'
const HIGHLIGHT_CLASS = 'bg-indigo-50'

export const getServerSideProps = redirectIfLoggedOut('/', async (ctx) => {
  const uid = await getServerAuthenticatedUid(ctx)
  if (!uid) {
    return { props: { user: null } }
  }
  const user = await getUser(uid)
  return { props: { user } }
})

export default function Notifications(props: { user: User }) {
  const { user } = props
  const privateUser = usePrivateUser(user?.id)
  const local = safeLocalStorage()
  let localNotifications = [] as Notification[]
  const localSavedNotificationGroups = local?.getItem('notification-groups')
  let localNotificationGroups = [] as NotificationGroup[]
  if (localSavedNotificationGroups) {
    localNotificationGroups = JSON.parse(localSavedNotificationGroups)
    localNotifications = localNotificationGroups
      .map((g) => g.notifications)
      .flat()
  }

  if (!user) return <Custom404 />
  return (
    <Page>
      <div className={'px-2 pt-4 sm:px-4 lg:pt-0'}>
        <Title text={'Notifications'} className={'hidden md:block'} />
        <div>
          <Tabs
            currentPageForAnalytics={'notifications'}
            labelClassName={'pb-2 pt-1 '}
            className={'mb-0 sm:mb-2'}
            defaultIndex={0}
            tabs={[
              {
                title: 'Notifications',
                content: privateUser ? (
                  <NotificationsList
                    privateUser={privateUser}
                    cachedNotifications={localNotifications}
                  />
                ) : localNotifications && localNotifications.length > 0 ? (
                  <div>
                    <RenderNotificationGroups
                      notificationGroups={localNotificationGroups}
                    />
                  </div>
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

function RenderNotificationGroups(props: {
  notificationGroups: NotificationGroup[]
}) {
  const { notificationGroups } = props
  return (
    <>
      {notificationGroups.map((notification) =>
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
    </>
  )
}

function NotificationsList(props: {
  privateUser: PrivateUser
  cachedNotifications: Notification[]
}) {
  const { privateUser, cachedNotifications } = props
  const [page, setPage] = useState(0)
  const allGroupedNotifications = usePreferredGroupedNotifications(
    privateUser,
    cachedNotifications
  )

  const [paginatedGroupedNotifications, setPaginatedGroupedNotifications] =
    useState<NotificationGroup[] | undefined>(undefined)

  useEffect(() => {
    if (!allGroupedNotifications) return
    const start = page * NOTIFICATIONS_PER_PAGE
    const end = start + NOTIFICATIONS_PER_PAGE
    const maxNotificationsToShow = allGroupedNotifications.slice(start, end)
    const remainingNotification = allGroupedNotifications.slice(end)
    for (const notification of remainingNotification) {
      if (notification.isSeen) break
      else setNotificationsAsSeen(notification.notifications)
    }
    setPaginatedGroupedNotifications(maxNotificationsToShow)
    const local = safeLocalStorage()
    local?.setItem(
      'notification-groups',
      JSON.stringify(maxNotificationsToShow)
    )
  }, [allGroupedNotifications, page])

  if (!paginatedGroupedNotifications || !allGroupedNotifications) return <div />

  return (
    <div className={'min-h-[100vh]'}>
      {paginatedGroupedNotifications.length === 0 && (
        <div className={'mt-2'}>
          You don't have any notifications. Try changing your settings to see
          more.
        </div>
      )}

      <RenderNotificationGroups
        notificationGroups={paginatedGroupedNotifications}
      />
      {paginatedGroupedNotifications.length > 0 &&
        allGroupedNotifications.length > NOTIFICATIONS_PER_PAGE && (
          <Pagination
            page={page}
            itemsPerPage={NOTIFICATIONS_PER_PAGE}
            totalItems={allGroupedNotifications.length}
            setPage={setPage}
            scrollToTop
          />
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

  const onClickHandler = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey) return
    setExpanded(!expanded)
  }

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
      // Source title splits by contracts and groups
      const groupedNotificationsBySourceTitle = groupBy(
        groupedNotificationsBySourceType[sourceType],
        (notification) => {
          return notification.sourceTitle ?? notification.sourceContractTitle
        }
      )
      for (const contractId in groupedNotificationsBySourceTitle) {
        const notificationsForContractId =
          groupedNotificationsBySourceTitle[contractId]
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
        highlighted && !expanded ? HIGHLIGHT_CLASS : ''
      )}
      onClick={onClickHandler}
    >
      {expanded && (
        <span
          className="absolute top-14 left-6 -ml-px h-[calc(100%-5rem)] w-0.5 bg-gray-200"
          aria-hidden="true"
        />
      )}
      <Row className={'items-center text-gray-500 sm:justify-start'}>
        <TrendingUpIcon
          className={'text-primary ml-1 h-7 w-7 flex-shrink-0 sm:ml-2'}
        />
        <div
          className={'ml-2 flex w-full flex-row flex-wrap truncate'}
          onClick={onClickHandler}
        >
          <div className={'flex w-full flex-row justify-between'}>
            <div>
              {'Daily Income Summary: '}
              <span className={'text-primary'}>
                {'+' + formatMoney(totalIncome)}
              </span>
            </div>
            <div className={'inline-block'}>
              <RelativeTimestamp time={notifications[0].createdTime} />
            </div>
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
  const { sourceType, sourceUserName, sourceUserUsername } = notification
  const [highlighted] = useState(!notification.isSeen)
  const { width } = useWindowSize()
  const isMobile = (width && width < 768) || false
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
    return reasonText
  }

  if (justSummary) {
    return (
      <Row className={'items-center text-sm text-gray-500 sm:justify-start'}>
        <div className={'line-clamp-1 flex-1 overflow-hidden sm:flex'}>
          <div className={'flex pl-1 sm:pl-0'}>
            <div className={'inline-flex overflow-hidden text-ellipsis pl-1'}>
              <div className={'mr-1 text-black'}>
                <NotificationTextLabel
                  className={'line-clamp-1'}
                  notification={notification}
                  justSummary={true}
                />
              </div>
              <span className={'flex truncate'}>
                {getReasonForShowingIncomeNotification(true)}
                <QuestionOrGroupLink
                  notification={notification}
                  ignoreClick={isMobile}
                />
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
        highlighted && HIGHLIGHT_CLASS
      )}
    >
      <a href={getSourceUrl(notification)}>
        <Row className={'items-center text-gray-500 sm:justify-start'}>
          <div className={'line-clamp-2 flex max-w-xl shrink '}>
            <div className={'inline'}>
              <span className={'mr-1'}>
                <NotificationTextLabel notification={notification} />
              </span>
            </div>
            <span>
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
              {getReasonForShowingIncomeNotification(false)} {' on'}
              <QuestionOrGroupLink notification={notification} />
            </span>
          </div>
        </Row>
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
  const { width } = useWindowSize()
  const isMobile = (width && width < 768) || false
  const numSummaryLines = 3

  const [expanded, setExpanded] = useState(false)
  const [highlighted, setHighlighted] = useState(
    notifications.some((n) => !n.isSeen)
  )

  const onClickHandler = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey) return
    setExpanded(!expanded)
  }

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
        highlighted && !expanded ? HIGHLIGHT_CLASS : ''
      )}
      onClick={onClickHandler}
    >
      {expanded && (
        <span
          className="absolute top-14 left-6 -ml-px h-[calc(100%-5rem)] w-0.5 bg-gray-200"
          aria-hidden="true"
        />
      )}
      <Row className={'items-center text-gray-500 sm:justify-start'}>
        <EmptyAvatar multi />
        <div
          className={'line-clamp-2 flex w-full flex-row flex-wrap pl-1 sm:pl-0'}
        >
          {sourceContractTitle ? (
            <div className={'flex w-full flex-row justify-between'}>
              <div className={'ml-2'}>
                Activity on
                <QuestionOrGroupLink
                  notification={notifications[0]}
                  ignoreClick={!expanded && isMobile}
                />
              </div>
              <div className={'hidden sm:inline-block'}>
                <RelativeTimestamp time={notifications[0].createdTime} />
              </div>
            </div>
          ) : (
            <span>
              Other activity
              <RelativeTimestamp time={notifications[0].createdTime} />
            </span>
          )}
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
                    isChildOfGroup={true}
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
  isChildOfGroup?: boolean
}) {
  const { notification, justSummary, isChildOfGroup } = props
  const {
    sourceType,
    sourceUserName,
    sourceUserAvatarUrl,
    sourceUpdateType,
    reasonText,
    reason,
    sourceUserUsername,
    sourceText,
  } = notification

  const [highlighted] = useState(!notification.isSeen)

  useEffect(() => {
    setNotificationsAsSeen([notification])
  }, [notification])

  const questionNeedsResolution = sourceUpdateType == 'closed'

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
                  getReasonForShowingNotification(notification, true)}
              </span>
              <div className={'ml-1 text-black'}>
                <NotificationTextLabel
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
        highlighted && HIGHLIGHT_CLASS
      )}
    >
      <div
        className={'cursor-pointer'}
        onClick={(event) => {
          event.stopPropagation()
          Router.push(getSourceUrl(notification) ?? '')
          track('Notification Clicked', {
            type: 'notification item',
            sourceType,
            sourceUserName,
            sourceUserAvatarUrl,
            sourceUpdateType,
            reasonText,
            reason,
            sourceUserUsername,
            sourceText,
          })
        }}
      >
        <Row className={'items-center text-gray-500 sm:justify-start'}>
          <Avatar
            avatarUrl={
              questionNeedsResolution
                ? MANIFOLD_AVATAR_URL
                : sourceUserAvatarUrl
            }
            size={'sm'}
            className={'mr-2'}
            username={
              questionNeedsResolution ? MANIFOLD_USERNAME : sourceUserUsername
            }
          />
          <div className={'flex w-full flex-row pl-1 sm:pl-0'}>
            <div
              className={
                'line-clamp-2 sm:line-clamp-none flex w-full flex-row justify-between'
              }
            >
              <div>
                {!questionNeedsResolution && (
                  <UserLink
                    name={sourceUserName || ''}
                    username={sourceUserUsername || ''}
                    className={'mr-1 flex-shrink-0'}
                    justFirstName={true}
                  />
                )}
                {getReasonForShowingNotification(
                  notification,
                  isChildOfGroup ?? false
                )}
                {isChildOfGroup ? (
                  <RelativeTimestamp time={notification.createdTime} />
                ) : (
                  <QuestionOrGroupLink notification={notification} />
                )}
              </div>
            </div>
            {!isChildOfGroup && (
              <div className={'hidden sm:inline-block'}>
                <RelativeTimestamp time={notification.createdTime} />
              </div>
            )}
          </div>
        </Row>
        <div className={'mt-1 ml-1 md:text-base'}>
          <NotificationTextLabel notification={notification} />
        </div>

        <div className={'mt-6 border-b border-gray-300'} />
      </div>
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

function QuestionOrGroupLink(props: {
  notification: Notification
  ignoreClick?: boolean
}) {
  const { notification, ignoreClick } = props
  const {
    sourceType,
    sourceContractTitle,
    sourceContractCreatorUsername,
    sourceContractSlug,
    sourceSlug,
    sourceTitle,
  } = notification

  if (ignoreClick)
    return (
      <span className={'ml-1 font-bold '}>
        {sourceContractTitle || sourceTitle}
      </span>
    )
  return (
    <a
      className={
        'ml-1 font-bold hover:underline hover:decoration-indigo-400 hover:decoration-2 '
      }
      href={
        sourceContractCreatorUsername
          ? `/${sourceContractCreatorUsername}/${sourceContractSlug}`
          : // User's added to group or received a tip there
          (sourceType === 'group' || sourceType === 'tip') && sourceSlug
          ? `${groupPath(sourceSlug)}`
          : // User referral via group
          sourceSlug?.includes('/group/')
          ? `${sourceSlug}`
          : ''
      }
      onClick={() =>
        track('Notification Clicked', {
          type: 'question title',
          sourceType,
          sourceContractTitle,
          sourceContractCreatorUsername,
          sourceContractSlug,
          sourceSlug,
          sourceTitle,
        })
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
  // User referral via contract:
  if (
    sourceContractCreatorUsername &&
    sourceContractSlug &&
    sourceType === 'user'
  )
    return `/${sourceContractCreatorUsername}/${sourceContractSlug}`
  // User referral:
  if (sourceType === 'user' && !sourceContractSlug)
    return `/${sourceUserUsername}`
  if (sourceType === 'tip' && sourceContractSlug)
    return `/${sourceContractCreatorUsername}/${sourceContractSlug}#${sourceSlug}`
  if (sourceType === 'tip' && sourceSlug) return `${groupPath(sourceSlug)}`
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
    case 'bet':
      return ''
    default:
      return sourceId
  }
}

function NotificationTextLabel(props: {
  notification: Notification
  className?: string
  justSummary?: boolean
}) {
  const { className, notification, justSummary } = props
  const { sourceUpdateType, sourceType, sourceText, reasonText } = notification
  const defaultText = sourceText ?? reasonText ?? ''
  if (sourceType === 'contract') {
    if (justSummary || !sourceText) return <div />
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

        // Numeric market
        if (parseFloat(sourceText))
          return <NumericValueLabel value={parseFloat(sourceText)} />

        // Free response market
        return (
          <div className={className ? className : 'line-clamp-1 text-blue-400'}>
            <Linkify text={sourceText} />
          </div>
        )
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
  } else if (sourceType === 'bet' && sourceText) {
    return (
      <>
        <span className="text-primary">
          {formatMoney(parseInt(sourceText))}
        </span>{' '}
        <span>of your limit order was filled</span>
      </>
    )
  }
  return (
    <div className={className ? className : 'line-clamp-4 whitespace-pre-line'}>
      <Linkify text={defaultText} />
    </div>
  )
}

function getReasonForShowingNotification(
  notification: Notification,
  justSummary: boolean
) {
  const { sourceType, sourceUpdateType, reason, sourceSlug } = notification
  let reasonText: string
  switch (sourceType) {
    case 'comment':
      if (reason === 'reply_to_users_answer')
        reasonText = justSummary ? 'replied' : 'replied to you on'
      else if (reason === 'tagged_user')
        reasonText = justSummary ? 'tagged you' : 'tagged you on'
      else if (reason === 'reply_to_users_comment')
        reasonText = justSummary ? 'replied' : 'replied to you on'
      else reasonText = justSummary ? `commented` : `commented on`
      break
    case 'contract':
      if (reason === 'you_follow_user')
        reasonText = justSummary ? 'asked the question' : 'asked'
      else if (sourceUpdateType === 'resolved')
        reasonText = justSummary ? `resolved the question` : `resolved`
      else if (sourceUpdateType === 'closed') reasonText = `Please resolve`
      else reasonText = justSummary ? 'updated the question' : `updated`
      break
    case 'answer':
      if (reason === 'on_users_contract') reasonText = `answered your question `
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
    case 'bet':
      reasonText = 'bet against you'
      break
    default:
      reasonText = ''
  }
  return reasonText
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
    track('In-App Notification Preferences Changed', {
      newPreference: newValue,
      oldPreference: privateUser.notificationPreferences,
    })
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
