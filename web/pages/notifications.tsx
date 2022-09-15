import { ControlledTabs } from 'web/components/layout/tabs'
import React, { useEffect, useMemo, useState } from 'react'
import Router, { useRouter } from 'next/router'
import {
  BetFillData,
  Notification,
  notification_source_types,
} from 'common/notification'
import { Avatar, EmptyAvatar } from 'web/components/avatar'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/page'
import { Title } from 'web/components/title'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from 'web/lib/firebase/init'
import {
  MANIFOLD_AVATAR_URL,
  MANIFOLD_USERNAME,
  PrivateUser,
} from 'common/user'
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
  useGroupedNotifications,
  useUnseenGroupedNotification,
} from 'web/hooks/use-notifications'
import { TrendingUpIcon } from '@heroicons/react/outline'
import { formatMoney } from 'common/util/format'
import { groupPath } from 'web/lib/firebase/groups'
import {
  BETTING_STREAK_BONUS_AMOUNT,
  UNIQUE_BETTOR_BONUS_AMOUNT,
} from 'common/economy'
import { groupBy, sum, uniqBy } from 'lodash'
import { track } from '@amplitude/analytics-browser'
import { Pagination } from 'web/components/pagination'
import { useWindowSize } from 'web/hooks/use-window-size'
import { safeLocalStorage } from 'web/lib/util/local'
import { SiteLink } from 'web/components/site-link'
import { NotificationSettings } from 'web/components/notification-settings'
import { SEO } from 'web/components/SEO'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { UserLink } from 'web/components/user-link'
import { LoadingIndicator } from 'web/components/loading-indicator'
import {
  MultiUserLinkInfo,
  MultiUserTransactionLink,
} from 'web/components/multi-user-transaction-link'
import { Col } from 'web/components/layout/col'

export const NOTIFICATIONS_PER_PAGE = 30
const HIGHLIGHT_CLASS = 'bg-indigo-50'

export default function Notifications() {
  const privateUser = usePrivateUser()
  const router = useRouter()
  const [navigateToSection, setNavigateToSection] = useState<string>()
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    if (privateUser === null) Router.push('/')
  })

  useEffect(() => {
    const query = { ...router.query }
    if (query.tab === 'settings') {
      setActiveIndex(1)
    }
    if (query.section) {
      setNavigateToSection(query.section as string)
    }
  }, [router.query])

  return (
    <Page>
      <div className={'px-2 pt-4 sm:px-4 lg:pt-0'}>
        <Title text={'Notifications'} className={'hidden md:block'} />
        <SEO title="Notifications" description="Manifold user notifications" />

        {privateUser && router.isReady && (
          <div>
            <ControlledTabs
              currentPageForAnalytics={'notifications'}
              labelClassName={'pb-2 pt-1 '}
              className={'mb-0 sm:mb-2'}
              activeIndex={activeIndex}
              onClick={(title, i) => {
                router.replace(
                  {
                    query: {
                      ...router.query,
                      tab: title.toLowerCase(),
                      section: '',
                    },
                  },
                  undefined,
                  { shallow: true }
                )
                setActiveIndex(i)
              }}
              tabs={[
                {
                  title: 'Notifications',
                  content: <NotificationsList privateUser={privateUser} />,
                },
                {
                  title: 'Settings',
                  content: (
                    <NotificationSettings
                      navigateToSection={navigateToSection}
                      privateUser={privateUser}
                    />
                  ),
                },
              ]}
            />
          </div>
        )}
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
            justSummary={false}
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

function NotificationsList(props: { privateUser: PrivateUser }) {
  const { privateUser } = props
  const [page, setPage] = useState(0)
  const allGroupedNotifications = useGroupedNotifications(privateUser)
  const unseenGroupedNotifications = useUnseenGroupedNotification(privateUser)
  const paginatedGroupedNotifications = useMemo(() => {
    if (!allGroupedNotifications) return
    const start = page * NOTIFICATIONS_PER_PAGE
    const end = start + NOTIFICATIONS_PER_PAGE
    const maxNotificationsToShow = allGroupedNotifications.slice(start, end)

    const local = safeLocalStorage()
    local?.setItem(
      'notification-groups',
      JSON.stringify(allGroupedNotifications)
    )
    return maxNotificationsToShow
  }, [allGroupedNotifications, page])

  // Set all notifications that don't fit on the first page to seen
  useEffect(() => {
    if (
      paginatedGroupedNotifications &&
      paginatedGroupedNotifications?.length >= NOTIFICATIONS_PER_PAGE
    ) {
      const allUnseenNotifications = unseenGroupedNotifications
        ?.map((ng) => ng.notifications)
        .flat()
      allUnseenNotifications && setNotificationsAsSeen(allUnseenNotifications)
    }
  }, [paginatedGroupedNotifications, unseenGroupedNotifications])

  if (!paginatedGroupedNotifications || !allGroupedNotifications)
    return <LoadingIndicator />

  return (
    <div className={'min-h-[100vh] text-sm'}>
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
            nextTitle={'Older'}
            prevTitle={'Newer'}
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
  const [expanded, setExpanded] = useState(
    notifications.length <= numSummaryLines
  )
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
    const newNotifications: Notification[] = []
    const groupedNotificationsBySourceType = groupBy(
      notifications,
      (n) => n.sourceType
    )
    for (const sourceType in groupedNotificationsBySourceType) {
      // Source title splits by contracts, groups, betting streak bonus
      const groupedNotificationsBySourceTitle = groupBy(
        groupedNotificationsBySourceType[sourceType],
        (notification) => {
          return notification.sourceTitle ?? notification.sourceContractTitle
        }
      )
      for (const sourceTitle in groupedNotificationsBySourceTitle) {
        const notificationsForSourceTitle =
          groupedNotificationsBySourceTitle[sourceTitle]

        let sum = 0
        notificationsForSourceTitle.forEach(
          (notification) =>
            (sum = parseInt(notification.sourceText ?? '0') + sum)
        )
        const uniqueUsers = uniqBy(
          notificationsForSourceTitle.map((notification) => {
            let thisSum = 0
            notificationsForSourceTitle
              .filter(
                (n) => n.sourceUserUsername === notification.sourceUserUsername
              )
              .forEach(
                (n) => (thisSum = parseInt(n.sourceText ?? '0') + thisSum)
              )
            return {
              username: notification.sourceUserUsername,
              name: notification.sourceUserName,
              avatarUrl: notification.sourceUserAvatarUrl,
              amount: thisSum,
            } as MultiUserLinkInfo
          }),
          (n) => n.username
        )

        const newNotification = {
          ...notificationsForSourceTitle[0],
          sourceText: sum.toString(),
          sourceUserUsername: notificationsForSourceTitle[0].sourceUserUsername,
          data: { uniqueUsers },
        }
        newNotifications.push(newNotification)
      }
    }
    return newNotifications
  }
  const combinedNotifs = combineNotificationsByAddingNumericSourceTexts(
    notifications.filter((n) => n.sourceType !== 'betting_streak_bonus')
  )
  // Because the server's reset time will never align with the client's, we may
  // erroneously sum 2 betting streak bonuses, therefore just show the most recent
  const mostRecentBettingStreakBonus = notifications
    .filter((n) => n.sourceType === 'betting_streak_bonus')
    .sort((a, b) => a.createdTime - b.createdTime)
    .pop()
  if (mostRecentBettingStreakBonus)
    combinedNotifs.unshift(mostRecentBettingStreakBonus)

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
  const { sourceType, sourceUserUsername, sourceText, data } = notification
  const [highlighted] = useState(!notification.isSeen)
  const { width } = useWindowSize()
  const isMobile = (width && width < 768) || false
  const user = useUser()
  const isTip = sourceType === 'tip' || sourceType === 'tip_and_like'
  const isUniqueBettorBonus = sourceType === 'bonus'
  const userLinks: MultiUserLinkInfo[] =
    isTip || isUniqueBettorBonus ? data?.uniqueUsers ?? [] : []

  useEffect(() => {
    setNotificationsAsSeen([notification])
  }, [notification])

  function reasonAndLink(simple: boolean) {
    const { sourceText } = notification
    let reasonText = ''

    if (sourceType === 'bonus' && sourceText) {
      reasonText = !simple
        ? `Bonus for ${
            parseInt(sourceText) / UNIQUE_BETTOR_BONUS_AMOUNT
          } new predictors on`
        : 'bonus on'
    } else if (sourceType === 'tip') {
      reasonText = !simple ? `tipped you on` : `in tips on`
    } else if (sourceType === 'betting_streak_bonus') {
      if (sourceText && +sourceText === 50) reasonText = '(max) for your'
      else reasonText = 'for your'
    } else if (sourceType === 'loan' && sourceText) {
      reasonText = `of your invested predictions returned as a`
      // TODO: support just 'like' notification without a tip
    } else if (sourceType === 'tip_and_like' && sourceText) {
      reasonText = !simple ? `liked` : `in likes on`
    }

    const streakInDays = notification.data?.streak
      ? notification.data?.streak
      : Date.now() - notification.createdTime > 24 * 60 * 60 * 1000
      ? parseInt(sourceText ?? '0') / BETTING_STREAK_BONUS_AMOUNT
      : user?.currentBettingStreak ?? 0
    const bettingStreakText =
      sourceType === 'betting_streak_bonus' &&
      (sourceText
        ? `🔥 ${streakInDays} day Prediction Streak`
        : 'Prediction Streak')

    return (
      <>
        {reasonText}
        {sourceType === 'loan' ? (
          simple ? (
            <span className={'ml-1 font-bold'}>🏦 Loan</span>
          ) : (
            <SiteLink className={'ml-1 font-bold'} href={'/loans'}>
              🏦 Loan
            </SiteLink>
          )
        ) : sourceType === 'betting_streak_bonus' ? (
          simple ? (
            <span className={'ml-1 font-bold'}>{bettingStreakText}</span>
          ) : (
            <SiteLink
              className={'ml-1 font-bold'}
              href={'/betting-streak-bonus'}
            >
              {bettingStreakText}
            </SiteLink>
          )
        ) : (
          <QuestionOrGroupLink
            notification={notification}
            ignoreClick={isMobile}
          />
        )}
      </>
    )
  }

  const incomeNotificationLabel = () => {
    return sourceText ? (
      <span className="text-primary">
        {'+' + formatMoney(parseInt(sourceText))}
      </span>
    ) : (
      <div />
    )
  }

  const getIncomeSourceUrl = () => {
    const {
      sourceId,
      sourceContractCreatorUsername,
      sourceContractSlug,
      sourceSlug,
    } = notification
    if (sourceType === 'tip' && sourceContractSlug)
      return `/${sourceContractCreatorUsername}/${sourceContractSlug}#${sourceSlug}`
    if (sourceType === 'tip' && sourceSlug) return `${groupPath(sourceSlug)}`
    if (sourceType === 'challenge') return `${sourceSlug}`
    if (sourceType === 'betting_streak_bonus')
      return `/${sourceUserUsername}/?show=betting-streak`
    if (sourceType === 'loan') return `/${sourceUserUsername}/?show=loans`
    if (sourceContractCreatorUsername && sourceContractSlug)
      return `/${sourceContractCreatorUsername}/${sourceContractSlug}#${getSourceIdForLinkComponent(
        sourceId ?? '',
        sourceType
      )}`
  }

  if (justSummary) {
    return (
      <Row className={'items-center text-sm text-gray-500 sm:justify-start'}>
        <div className={'line-clamp-1 flex-1 overflow-hidden sm:flex'}>
          <div className={'flex pl-1 sm:pl-0'}>
            <div className={'inline-flex overflow-hidden text-ellipsis pl-1'}>
              <div className={'mr-1 text-black'}>
                {incomeNotificationLabel()}
              </div>
              <span className={'flex truncate'}>{reasonAndLink(true)}</span>
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
      <div className={'relative'}>
        <SiteLink
          href={getIncomeSourceUrl() ?? ''}
          className={'absolute left-0 right-0 top-0 bottom-0 z-0'}
        />
        <Col className={'justify-start text-gray-500'}>
          {(isTip || isUniqueBettorBonus) && (
            <MultiUserTransactionLink
              userInfos={userLinks}
              modalLabel={isTip ? 'Who tipped you' : 'Unique predictors'}
            />
          )}
          <Row className={'line-clamp-2 flex max-w-xl'}>
            <span>{incomeNotificationLabel()}</span>
            <span className={'mx-1'}>
              {isTip &&
                (userLinks.length > 1
                  ? 'Multiple users'
                  : userLinks.length > 0
                  ? userLinks[0].name
                  : '')}
            </span>
            <span>{reasonAndLink(false)}</span>
          </Row>
        </Col>
        <div className={'border-b border-gray-300 pt-4'} />
      </div>
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

  const [expanded, setExpanded] = useState(
    notifications.length <= numSummaryLines
  )
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
  justSummary: boolean
  isChildOfGroup?: boolean
}) {
  const { notification, justSummary, isChildOfGroup } = props
  const { sourceType, reason } = notification

  const [highlighted] = useState(!notification.isSeen)

  useEffect(() => {
    setNotificationsAsSeen([notification])
  }, [notification])

  // TODO Any new notification should be its own component
  if (reason === 'bet_fill') {
    return (
      <BetFillNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
        justSummary={justSummary}
      />
    )
  }
  // TODO Add new notification components here

  if (justSummary) {
    return (
      <NotificationSummaryFrame
        notification={notification}
        subtitle={
          (sourceType &&
            reason &&
            getReasonForShowingNotification(notification, true)) ??
          ''
        }
      >
        <NotificationTextLabel
          className={'line-clamp-1'}
          notification={notification}
          justSummary={true}
        />
      </NotificationSummaryFrame>
    )
  }

  return (
    <NotificationFrame
      notification={notification}
      subtitle={getReasonForShowingNotification(
        notification,
        isChildOfGroup ?? false
      )}
      highlighted={highlighted}
    >
      <div className={'mt-1 ml-1 md:text-base'}>
        <NotificationTextLabel notification={notification} />
      </div>
    </NotificationFrame>
  )
}

function NotificationSummaryFrame(props: {
  notification: Notification
  subtitle: string
  children: React.ReactNode
}) {
  const { notification, subtitle, children } = props
  const { sourceUserName, sourceUserUsername } = notification
  return (
    <Row className={'items-center text-sm text-gray-500 sm:justify-start'}>
      <div className={'line-clamp-1 flex-1 overflow-hidden sm:flex'}>
        <div className={'flex pl-1 sm:pl-0'}>
          <UserLink
            name={sourceUserName || ''}
            username={sourceUserUsername || ''}
            className={'mr-0 flex-shrink-0'}
            short={true}
          />
          <div className={'inline-flex overflow-hidden text-ellipsis pl-1'}>
            <span className={'flex-shrink-0'}>{subtitle}</span>
            <div className={'line-clamp-1 ml-1 text-black'}>{children}</div>
          </div>
        </div>
      </div>
    </Row>
  )
}

function NotificationFrame(props: {
  notification: Notification
  highlighted: boolean
  subtitle: string
  children: React.ReactNode
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted, subtitle, children } =
    props
  const {
    sourceType,
    sourceUserName,
    sourceUserAvatarUrl,
    sourceUpdateType,
    reason,
    reasonText,
    sourceUserUsername,
    sourceText,
  } = notification
  const questionNeedsResolution = sourceUpdateType == 'closed'

  return (
    <div
      className={clsx(
        'bg-white px-2 pt-6 text-sm sm:px-4',
        highlighted && HIGHLIGHT_CLASS
      )}
    >
      <div className={'relative cursor-pointer'}>
        <SiteLink
          href={getSourceUrl(notification) ?? ''}
          className={'absolute left-0 right-0 top-0 bottom-0 z-0'}
          onClick={() =>
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
          }
        />
        <Row className={'items-center text-gray-500 sm:justify-start'}>
          <Avatar
            avatarUrl={
              questionNeedsResolution
                ? MANIFOLD_AVATAR_URL
                : sourceUserAvatarUrl
            }
            size={'sm'}
            className={'z-10 mr-2'}
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
                <UserLink
                  name={sourceUserName || ''}
                  username={sourceUserUsername || ''}
                  className={'relative mr-1 flex-shrink-0'}
                  short={true}
                />
                {subtitle}
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
        <div className={'mt-1 ml-1 md:text-base'}>{children}</div>

        <div className={'mt-6 border-b border-gray-300'} />
      </div>
    </div>
  )
}

function BetFillNotification(props: {
  notification: Notification
  highlighted: boolean
  justSummary: boolean
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted, justSummary } = props
  const { sourceText, data } = notification
  const { creatorOutcome, probability } = (data as BetFillData) ?? {}
  const subtitle = 'bet against you'
  const amount = formatMoney(parseInt(sourceText ?? '0'))
  const description =
    creatorOutcome && probability ? (
      <span>
        of your{' '}
        <span
          className={
            creatorOutcome === 'YES'
              ? 'text-primary'
              : creatorOutcome === 'NO'
              ? 'text-red-500'
              : 'text-blue-500'
          }
        >
          {creatorOutcome}{' '}
        </span>
        limit order at {Math.round(probability * 100)}% was filled
      </span>
    ) : (
      <span>of your limit order was filled</span>
    )

  if (justSummary) {
    return (
      <NotificationSummaryFrame notification={notification} subtitle={subtitle}>
        <Row className={'line-clamp-1'}>
          <span className={'text-primary mr-1'}>{amount}</span>
          <span>{description}</span>
        </Row>
      </NotificationSummaryFrame>
    )
  }

  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      subtitle={subtitle}
    >
      <Row>
        <span>
          <span className="text-primary mr-1">{amount}</span>
          {description}
        </span>
      </Row>
    </NotificationFrame>
  )
}

export const setNotificationsAsSeen = async (notifications: Notification[]) => {
  const unseenNotifications = notifications.filter((n) => !n.isSeen)
  return await Promise.all(
    unseenNotifications.map((n) => {
      const notificationDoc = doc(db, `users/${n.userId}/notifications/`, n.id)
      return updateDoc(notificationDoc, { isSeen: true, viewTime: new Date() })
    })
  )
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
    <SiteLink
      className={'relative ml-1 font-bold'}
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
    </SiteLink>
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
  if (sourceType === 'challenge') return `${sourceSlug}`
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
  } else if (sourceType === 'challenge' && sourceText) {
    return (
      <>
        <span> for </span>
        <span className="text-primary">
          {formatMoney(parseInt(sourceText))}
        </span>
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
  // TODO: we could leave out this switch and just use the reason field now that they have more information
  if (reason === 'tagged_user')
    reasonText = justSummary ? 'tagged you' : 'tagged you on'
  else
    switch (sourceType) {
      case 'comment':
        if (reason === 'reply_to_users_answer')
          reasonText = justSummary ? 'replied' : 'replied to you on'
        else if (reason === 'reply_to_users_comment')
          reasonText = justSummary ? 'replied' : 'replied to you on'
        else reasonText = justSummary ? `commented` : `commented on`
        break
      case 'contract':
        if (reason === 'contract_from_followed_user')
          reasonText = justSummary ? 'asked the question' : 'asked'
        else if (sourceUpdateType === 'resolved')
          reasonText = justSummary ? `resolved the question` : `resolved`
        else if (sourceUpdateType === 'closed') reasonText = `Please resolve`
        else reasonText = justSummary ? 'updated the question' : `updated`
        break
      case 'answer':
        if (reason === 'answer_on_your_contract')
          reasonText = `answered your question `
        else reasonText = `answered`
        break
      case 'follow':
        reasonText = 'followed you'
        break
      case 'liquidity':
        reasonText = 'added a subsidy to your question'
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
      case 'challenge':
        reasonText = 'accepted your challenge'
        break
      default:
        reasonText = ''
    }
  return reasonText
}
