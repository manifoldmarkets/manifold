import clsx from 'clsx'
import {
  combineAndSumIncomeNotifications,
  combineReactionNotifications,
  ContractResolutionData,
  Notification,
  NotificationGroup,
  ReactionNotificationTypes,
} from 'common/notification'
import { PrivateUser, User } from 'common/user'
import { groupBy, sortBy } from 'lodash'
import { useRouter } from 'next/router'
import { Fragment, ReactNode, useEffect, useMemo, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { QueryUncontrolledTabs } from 'web/components/layout/tabs'
import { NotificationSettings } from 'web/components/notification-settings'
import {
  NUM_SUMMARY_LINES,
  ParentNotificationHeader,
  QuestionOrGroupLink,
} from 'web/components/notifications/notification-helpers'
import { api, markAllNotifications } from 'web/lib/api/api'
import { NotificationItem } from 'web/components/notifications/notification-types'
import { PushNotificationsModal } from 'web/components/push-notifications-modal'
import { SEO } from 'web/components/SEO'
import { ShowMoreLessButton } from 'web/components/widgets/collapsible-content'
import { Pagination } from 'web/components/widgets/pagination'
import { Title } from 'web/components/widgets/title'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { XIcon } from '@heroicons/react/outline'
import { AppBadgesOrGetAppButton } from 'web/components/buttons/app-badges-or-get-app-button'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { track } from 'web/lib/service/analytics'
import { useNativeInfo } from 'web/components/native-message-provider'
import {
  NOTIFICATIONS_PER_PAGE,
  useGroupedNotifications,
} from 'client-common/hooks/use-notifications'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { useUnseenPrivateMessageChannels } from 'web/hooks/use-private-messages'
import { PrivateMessagesList } from '../components/messaging/private-messages-list'
import { maybePluralize } from 'common/util/format'
import dayjs from 'dayjs'
import { postMessageToNative } from 'web/lib/native/post-message'
import { useEvent } from 'client-common/hooks/use-event'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/solid'

export default function NotificationsPage() {
  const privateUser = usePrivateUser()
  const user = useUser()
  useRedirectIfSignedOut()
  const [navigateToSection, setNavigateToSection] = useState<string>()
  const { isNative } = useNativeInfo()
  const router = useRouter()
  useEffect(() => {
    if (!router.isReady) return
    const query = { ...router.query }
    if (query.section) {
      setNavigateToSection(query.section as string)
    }
  }, [router.query])

  const shouldShowBanner =
    privateUser && !privateUser.hasSeenAppBannerInNotificationsOn && !isNative

  return (
    <Page trackPageView={'notifications page'}>
      <div className="w-full">
        {shouldShowBanner && <NotificationsAppBanner />}
        <Title className="hidden lg:block">Notifications</Title>
        <SEO title="Notifications" description="Manifold user notifications" />
        {privateUser && user && router.isReady ? (
          <NotificationsContent
            user={user}
            privateUser={privateUser}
            section={navigateToSection}
          />
        ) : null}
      </div>
    </Page>
  )
}

function NotificationsAppBanner() {
  return (
    <Row className="bg-primary-100 relative mb-2 justify-between rounded-md px-4 py-2 text-sm">
      <Row className={'text-ink-600 items-center gap-3 text-sm sm:text-base'}>
        Get the app for the best experience
        <AppBadgesOrGetAppButton />
      </Row>
      <button
        onClick={() => {
          track('close app banner')
          api('me/private/update', {
            hasSeenAppBannerInNotificationsOn: Date.now(),
          })
        }}
      >
        <XIcon className="text-ink-600 hover:text-ink-800 h-6 w-6" />
      </button>
    </Row>
  )
}

function NotificationsContent(props: {
  privateUser: PrivateUser
  user: User
  section?: string
}) {
  const { privateUser, user, section } = props
  const {
    groupedNotifications,
    pinnedNotifications,
    mostRecentNotification,
    groupedNewMarketNotifications,
    groupedMentionNotifications,
    markAllAsSeen,
  } = useGroupedNotifications(
    user,
    (params) => api('get-notifications', params),
    usePersistentLocalState
  )
  const resolution = groupedNotifications?.some(
    (ng) =>
      ng.notifications.some(
        (n) => n.reason === 'resolutions_on_watched_markets'
      ) ||
      ng.notifications.some((n) => {
        if (n.reason === 'resolutions_on_watched_markets_with_shares_in') {
          const { data } = n
          const d =
            data && 'userPayout' in data
              ? (data as ContractResolutionData)
              : {
                  userPayout: 0,
                  userInvestment: 0,
                }
          const profit = d.userPayout - d.userInvestment
          return profit > -1
        }
        return false
      })
  )
  const { isNative } = useNativeInfo()
  const lastPushModalSeenTime =
    privateUser.lastPromptedToEnablePushNotifications

  const checkIfShouldPromptStoreReview = useEvent(() => {
    const shownPushModalToday = lastPushModalSeenTime
      ? dayjs(lastPushModalSeenTime).isSame(dayjs(), 'day')
      : false

    const yearAgo = dayjs().subtract(1, 'years').valueOf()
    const recentlyReviewed = privateUser.lastAppReviewTime
      ? privateUser.lastAppReviewTime > yearAgo
      : false
    const shouldCheckReviewAbility =
      isNative && resolution && !recentlyReviewed && !shownPushModalToday

    if (shouldCheckReviewAbility) {
      postMessageToNative('hasReviewActionRequested', {})
    }
  })

  useEffect(() => {
    setTimeout(() => {
      // Give the push notification modal time to show and the user to see their notifs
      checkIfShouldPromptStoreReview()
    }, 3000)
  }, [
    isNative,
    resolution,
    lastPushModalSeenTime,
    privateUser.lastAppReviewTime,
  ])

  const [unseenNewMarketNotifs, setNewMarketNotifsAsSeen] = useState(
    groupedNewMarketNotifications?.filter((n) => !n.isSeen).length ?? 0
  )

  const { unseenChannels } = useUnseenPrivateMessageChannels(false)

  return (
    <div className="relative mt-2 h-full w-full">
      {privateUser && (
        <QueryUncontrolledTabs
          trackingName={'notification tabs'}
          labelClassName={'relative pb-2 pt-1 '}
          className={'mb-0 sm:mb-2'}
          onClick={(title) => {
            if (title === 'Following') setNewMarketNotifsAsSeen(0)
          }}
          labelsParentClassName={'gap-3'}
          tabs={[
            {
              title: 'General',
              content: (
                <NotificationsList
                  privateUser={privateUser}
                  groupedNotifications={groupedNotifications}
                  pinnedNotifications={pinnedNotifications}
                  mostRecentNotification={mostRecentNotification}
                  markAllAsSeen={markAllAsSeen}
                />
              ),
            },
            {
              title: 'Following',
              inlineTabIcon:
                unseenNewMarketNotifs > 0 ? (
                  <div
                    className={
                      'text-ink-0 bg-primary-400 ml-2 min-w-[15px] rounded-full px-2 text-xs'
                    }
                  >
                    {unseenNewMarketNotifs}
                  </div>
                ) : undefined,
              content: (
                <NotificationsList
                  groupedNotifications={groupedNewMarketNotifications}
                  emptyTitle={
                    "You don't have any new question notifications from followed users, yet. Try following some users to see more."
                  }
                  markAllAsSeen={markAllAsSeen}
                />
              ),
            },
            {
              title: 'Messages',
              inlineTabIcon:
                unseenChannels.length > 0 ? (
                  <div
                    className={
                      'text-ink-0 bg-primary-400 ml-2 min-w-[15px] rounded-full px-2 text-xs'
                    }
                  >
                    {unseenChannels.length}
                  </div>
                ) : undefined,
              content: <PrivateMessagesList />,
            },
            {
              title: 'Mentions',
              content: (
                <NotificationsList
                  groupedNotifications={groupedMentionNotifications}
                  markAllAsSeen={markAllAsSeen}
                />
              ),
            },
            {
              queryString: 'Settings',
              title: 'Settings',
              content: (
                <NotificationSettings
                  navigateToSection={section}
                  privateUser={privateUser}
                />
              ),
            },
          ]}
        />
      )}
    </div>
  )
}

function RenderNotificationGroups(props: {
  notificationGroups: NotificationGroup[]
  totalItems: number
  page: number
  setPage: (page: number) => void
}) {
  const { notificationGroups, page, setPage, totalItems } = props

  const grayLine = <div className="bg-ink-300 mx-2 box-border h-[1.5px]" />
  const alwaysGroupTypes = ['market_movements']
  return (
    <>
      {notificationGroups.map((notification) => (
        <Fragment key={notification.groupedById}>
          {notification.notifications.length === 1 &&
          !alwaysGroupTypes.includes(notification.notifications[0].reason) ? (
            <>
              <NotificationItem
                notification={notification.notifications[0]}
                key={notification.notifications[0].id}
              />
              {grayLine}
            </>
          ) : (
            <>
              <NotificationGroupItem
                notificationGroup={notification}
                key={notification.groupedById}
              />
              {grayLine}
            </>
          )}
        </Fragment>
      ))}
      {notificationGroups.length > 0 && totalItems > NOTIFICATIONS_PER_PAGE && (
        <Pagination
          page={page}
          pageSize={NOTIFICATIONS_PER_PAGE}
          totalItems={totalItems}
          setPage={setPage}
          savePageToQuery={true}
        />
      )}
    </>
  )
}

export function NotificationsList(props: {
  groupedNotifications: NotificationGroup[] | undefined
  pinnedNotifications?: Notification[]
  privateUser?: PrivateUser
  mostRecentNotification?: Notification
  emptyTitle?: string
  markAllAsSeen?: () => void
}) {
  const {
    privateUser,
    emptyTitle,
    groupedNotifications,
    mostRecentNotification,
    markAllAsSeen,
    pinnedNotifications,
  } = props
  const [page, setPage] = useState(0)
  const user = useUser()
  const [pinnedExpanded, setPinnedExpanded] = usePersistentLocalState(
    true,
    'pinned-notifications-expanded'
  )

  const paginatedGroupedNotifications = useMemo(() => {
    const start = page * NOTIFICATIONS_PER_PAGE
    const end = start + NOTIFICATIONS_PER_PAGE
    return groupedNotifications?.slice(start, end)
  }, [JSON.stringify(groupedNotifications), page])

  const isPageVisible = useIsPageVisible()
  const { isNative } = useNativeInfo()

  useEffect(() => {
    if (!privateUser || !isPageVisible) return
    markAllNotifications({ seen: true })
    markAllAsSeen?.()
  }, [
    privateUser?.id,
    isPageVisible,
    mostRecentNotification?.id,
    markAllAsSeen,
  ])

  return (
    <Col className="gap-2">
      {pinnedNotifications && pinnedNotifications.length > 0 && (
        <Col className="gap-1 rounded-md border-2 border-indigo-500 p-2">
          <Row
            className={clsx(
              'bg-primary-100',
              'cursor-pointer items-center justify-between px-3 py-2'
            )}
            onClick={() => setPinnedExpanded(!pinnedExpanded)}
          >
            <span>
              {pinnedNotifications.length}{' '}
              {maybePluralize('comment', pinnedNotifications.length)} that may
              need your attention
            </span>
            {pinnedExpanded ? (
              <ChevronUpIcon className="h-5 w-5" />
            ) : (
              <ChevronDownIcon className="h-5 w-5" />
            )}
          </Row>
          {pinnedExpanded &&
            pinnedNotifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
              />
            ))}
        </Col>
      )}

      {groupedNotifications === undefined && user && <LoadingIndicator />}
      {groupedNotifications &&
        groupedNotifications.length === 0 &&
        (!pinnedNotifications || pinnedNotifications.length === 0) && (
          <div className="text-ink-500 mt-4 text-center">
            {emptyTitle ? emptyTitle : `You don't have any notifications yet.`}
          </div>
        )}
      {paginatedGroupedNotifications &&
        paginatedGroupedNotifications.length > 0 && (
          <RenderNotificationGroups
            notificationGroups={paginatedGroupedNotifications}
            totalItems={groupedNotifications?.length ?? 0}
            page={page}
            setPage={setPage}
          />
        )}
      {privateUser && groupedNotifications && user && isNative && (
        <PushNotificationsModal
          user={user}
          privateUser={privateUser}
          totalNotifications={
            groupedNotifications.map((ng) => ng.notifications).flat().length
          }
        />
      )}
    </Col>
  )
}

function NotificationGroupItem(props: {
  notificationGroup: NotificationGroup
  className?: string
}) {
  const { notificationGroup } = props
  const { notifications } = notificationGroup
  const [groupHighlighted] = useState(notifications.some((n) => !n.isSeen))
  const { sourceTitle, sourceContractTitle } = notifications[0]
  const incomeTypesToSum = ['bonus', 'tip', 'tip_and_like']
  const uniques = Object.keys(
    groupBy(notifications, (n) => n.sourceUserUsername)
  ).length
  const combinedNotifs = sortBy(
    combineReactionNotifications(
      notifications.filter((n) =>
        ReactionNotificationTypes.includes(n.sourceType)
      )
    )
      .concat(
        notifications.filter(
          (n) =>
            !ReactionNotificationTypes.includes(n.sourceType) &&
            !incomeTypesToSum.includes(n.sourceType)
        )
      )
      .concat(
        combineAndSumIncomeNotifications(
          notifications.filter((n) => incomeTypesToSum.includes(n.sourceType))
        )
      ),
    'createdTime'
  ).reverse()
  const onboardingNotifs = notifications.some(
    (n) => n.reason === 'onboarding_flow'
  )
  const questNotifs = notifications.some(
    (n) =>
      n.reason === 'quest_payout' || n.sourceType === 'betting_streak_bonus'
  )

  return (
    <NotificationGroupItemComponent
      notifications={combinedNotifs}
      lines={onboardingNotifs ? 5 : NUM_SUMMARY_LINES}
      header={
        <ParentNotificationHeader highlighted={groupHighlighted}>
          {notifications.some(
            (n) => n.reason === 'contract_from_followed_user'
          ) ? (
            <>
              {notifications.length} new questions from{' '}
              {notifications[0].sourceUserName}
            </>
          ) : onboardingNotifs ? (
            <>Welcome to Manifold!</>
          ) : questNotifs ? (
            <>
              {notifications.length}{' '}
              {maybePluralize('quest', notifications.length)} completed
            </>
          ) : notifications[0].reason === 'market_movements' ? (
            <>
              {notifications.length} notable 24-hour market{' '}
              {maybePluralize('movement', notifications.length)}
            </>
          ) : sourceTitle || sourceContractTitle ? (
            <>
              {uniques} {maybePluralize('user', uniques)} on{' '}
              <QuestionOrGroupLink
                notification={notifications[0]}
                truncatedLength={'xl'}
              />
            </>
          ) : (
            <>
              Other activity from {uniques} {maybePluralize('user', uniques)}
            </>
          )}
        </ParentNotificationHeader>
      }
    />
  )
}

function NotificationGroupItemComponent(props: {
  notifications: Notification[]
  header: ReactNode
  lines: number
}) {
  const { notifications, lines, header } = props
  const numNotifications = notifications.length

  const needsExpanding = numNotifications > lines
  const [expanded, setExpanded] = useState(false)
  const onExpandHandler = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey) return
    setExpanded(!expanded)
  }

  const shownNotifications = expanded
    ? notifications
    : notifications.slice(0, lines)
  return (
    <div>
      {header}
      <div className="relative whitespace-pre-line last:[&>*]:pb-6 sm:last:[&>*]:pb-4">
        {needsExpanding && (
          <div className={clsx('absolute bottom-0 right-4')}>
            <ShowMoreLessButton
              onClick={onExpandHandler}
              isCollapsed={!expanded}
              howManyMore={numNotifications - lines}
            />
          </div>
        )}
        {shownNotifications.map((notification) => {
          return (
            <NotificationItem
              notification={notification}
              key={notification.id}
              isChildOfGroup={shownNotifications.length > 1}
            />
          )
        })}
      </div>
    </div>
  )
}
