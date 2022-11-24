import { ControlledTabs } from 'web/components/layout/tabs'
import React, { ReactNode, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import {
  BetFillData,
  ContractResolutionData,
  getSourceIdForLinkComponent,
  getSourceUrl,
  Notification,
} from 'common/notification'
import { Avatar, EmptyAvatar } from 'web/components/widgets/avatar'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from 'web/lib/firebase/init'
import { MANIFOLD_AVATAR_URL, PAST_BETS, PrivateUser } from 'common/user'
import clsx from 'clsx'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { Linkify } from 'web/components/widgets/linkify'
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
} from 'web/hooks/use-notifications'
import { TrendingUpIcon } from '@heroicons/react/outline'
import { formatMoney } from 'common/util/format'
import {
  BETTING_STREAK_BONUS_AMOUNT,
  BETTING_STREAK_BONUS_MAX,
  UNIQUE_BETTOR_BONUS_AMOUNT,
} from 'common/economy'
import { groupBy, sum, uniqBy } from 'lodash'
import { Pagination } from 'web/components/widgets/pagination'
import { SiteLink } from 'web/components/widgets/site-link'
import { NotificationSettings } from 'web/components/notification-settings'
import { SEO } from 'web/components/SEO'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { UserLink } from 'web/components/widgets/user-link'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import {
  MultiUserLinkInfo,
  MultiUserTransactionLink,
} from 'web/components/multi-user-transaction-link'
import { Col } from 'web/components/layout/col'
import { track } from 'web/lib/service/analytics'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { PushNotificationsModal } from 'web/components/push-notifications-modal'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { groupPath } from 'common/group'
import Link from 'next/link'
import {
  ChevronDoubleDownIcon,
  ChevronDoubleUpIcon,
} from '@heroicons/react/solid'
import { Button } from 'web/components/buttons/button'
import {
  IncomeNotificationGroupItem,
  IncomeNotificationItem,
  PredictionStreak,
} from 'web/components/notifications/income-summary-notifications'
import {
  NotificationItem,
  ParentNotificationHeader,
  QuestionOrGroupLink,
} from 'web/components/notifications/notification-types'

const notification_base_style =
  'relative cursor-pointer text-sm bg-inherit rounded-lg transition-all'
export const NESTED_NOTIFICATION_STYLE = clsx(
  notification_base_style,
  'hover:bg-indigo-50 p-2'
)
export const PARENT_NOTIFICATION_STYLE = clsx(
  notification_base_style,
  'group px-2 pt-3'
)
export const NOTIFICATION_STYLE = clsx(
  notification_base_style,
  'py-4 px-2 hover:bg-indigo-50'
)
export const NOTIFICATIONS_PER_PAGE = 30
export function getHighlightClass(highlight: boolean) {
  return highlight ? 'opacity-100' : 'opacity-70'
}
export const NUM_SUMMARY_LINES = 3

export default function Notifications() {
  const privateUser = usePrivateUser()
  const router = useRouter()
  const [navigateToSection, setNavigateToSection] = useState<string>()
  const [activeIndex, setActiveIndex] = useState(0)

  useRedirectIfSignedOut()

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
          <div className="relative">
            <Button size="xs" className="absolute right-0">
              Mark all as read
            </Button>
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
  const grayLine = <hr className="mx-auto w-[calc(100%-1rem)] bg-gray-400" />
  return (
    <>
      {notificationGroups.map((notification) =>
        notification.type === 'income' ? (
          <>
            <IncomeNotificationGroupItem
              notificationGroup={notification}
              key={notification.groupedById + notification.timePeriod}
            />
            {grayLine}
          </>
        ) : notification.notifications.length === 1 ? (
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
              key={notification.groupedById + notification.timePeriod}
            />
            {grayLine}
          </>
        )
      )}
    </>
  )
}

function NotificationsList(props: { privateUser: PrivateUser }) {
  const { privateUser } = props

  const [page, setPage] = useState(0)

  const allGroupedNotifications = useGroupedNotifications(privateUser)
  const paginatedGroupedNotifications = useMemo(() => {
    if (!allGroupedNotifications) return undefined

    const start = page * NOTIFICATIONS_PER_PAGE
    const end = start + NOTIFICATIONS_PER_PAGE
    return allGroupedNotifications.slice(start, end)
  }, [allGroupedNotifications, page])

  const isPageVisible = useIsPageVisible()

  // Mark all notifications as seen.
  useEffect(() => {
    if (isPageVisible && allGroupedNotifications) {
      const notifications = allGroupedNotifications
        .flat()
        .flatMap((g) => g.notifications)

      markNotificationsAsSeen(notifications)
    }
  }, [isPageVisible, allGroupedNotifications])

  if (!paginatedGroupedNotifications || !allGroupedNotifications)
    return <LoadingIndicator />

  return (
    <Col className={'min-h-[100vh] gap-0 text-sm'}>
      {paginatedGroupedNotifications.length === 0 && (
        <div className={'mt-2'}>
          You don't have any notifications. Try changing your settings to see
          more.
        </div>
      )}
      <PushNotificationsModal
        privateUser={privateUser}
        totalNotifications={
          allGroupedNotifications.map((ng) => ng.notifications).flat().length
        }
      />

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
    </Col>
  )
}

function NotificationGroupItem(props: {
  notificationGroup: NotificationGroup
  className?: string
}) {
  const { notificationGroup, className } = props
  const { notifications } = notificationGroup
  const isMobile = useIsMobile(768)
  const { sourceContractTitle } = notifications[0]
  const [highlighted, setHighlighted] = useState(
    notifications.some((n) => !n.isSeen)
  )
  const header = (
    <ParentNotificationHeader
      icon={<EmptyAvatar multi size={5} />}
      header={
        sourceContractTitle ? (
          <>
            Activity on
            <QuestionOrGroupLink notification={notifications[0]} />
          </>
        ) : (
          <span>Other activity</span>
        )
      }
      createdTime={notifications[0].createdTime}
      highlighted={highlighted}
    />
  )

  return (
    <NotificationGroupItemComponent
      notifications={notifications}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      header={header}
    />
  )
}

export function NotificationGroupItemComponent(props: {
  notifications: Notification[]
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  header: ReactNode
  isIncomeNotification?: boolean
  className?: string
}) {
  const {
    notifications,
    className,
    highlighted,
    setHighlighted,
    header,
    isIncomeNotification,
  } = props

  const needsExpanding = notifications.length > NUM_SUMMARY_LINES
  const [expanded, setExpanded] = useState(
    notifications.length <= NUM_SUMMARY_LINES
  )
  const onExpandHandler = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey) return
    setExpanded(!expanded)
  }

  useEffect(() => {
    if (expanded) setHighlighted(false)
  }, [expanded])

  return (
    <div className={clsx(PARENT_NOTIFICATION_STYLE, className)}>
      {header}
      <div className={clsx(' whitespace-pre-line')}>
        {notifications
          .slice(
            0,
            needsExpanding
              ? expanded
                ? notifications.length
                : NUM_SUMMARY_LINES
              : notifications.length
          )
          .map((notification) => {
            return (
              <NotificationItem
                notification={notification}
                key={notification.id}
                isChildOfGroup={true}
                isIncomeNotification={isIncomeNotification}
              />
            )
          })}
        {needsExpanding && (
          <Row
            className={
              'w-full items-center justify-end gap-1 text-sm text-gray-500 hover:text-indigo-500'
            }
            onClick={onExpandHandler}
          >
            {!expanded && (
              <>
                <div>
                  {notifications.length - NUM_SUMMARY_LINES > 0
                    ? 'See ' +
                      (notifications.length - NUM_SUMMARY_LINES) +
                      ' more'
                    : ''}
                </div>
                <ChevronDoubleDownIcon className="h-4 w-4" />
              </>
            )}
            {expanded && (
              <>
                <div>See Less</div>
                <ChevronDoubleUpIcon className="h-4 w-4" />
              </>
            )}
          </Row>
        )}
      </div>
    </div>
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

export function NotificationFrame(props: {
  notification: Notification
  highlighted: boolean
  children: React.ReactNode
  symbol: string | ReactNode
  link?: string
  onClick?: () => void
  subtitle?: string | ReactNode
  isChildOfGroup?: boolean
}) {
  const {
    notification,
    isChildOfGroup,
    highlighted,
    children,
    symbol,
    subtitle,
    onClick,
    link,
  } = props
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
  const isMobile = useIsMobile(600)

  const frameObject = (
    <>
      {' '}
      <Row>
        <Col className="w-4">
          {highlighted && (
            <div className="bg-highlight-blue mx-auto my-auto h-2 w-2 rounded-full" />
          )}
        </Col>
        <Row className="w-full justify-between gap-1 text-base text-gray-600">
          <div>
            <span>{symbol}</span> <span>{children}</span>
          </div>
          <RelativeTimestamp time={notification.createdTime} />
        </Row>
      </Row>
      <div className="ml-4 text-sm text-gray-500">{subtitle}</div>
    </>
  )

  if (link) {
    return (
      <SiteLink
        href={link}
        className={clsx(
          'group flex w-full flex-col',
          isChildOfGroup ? NESTED_NOTIFICATION_STYLE : NOTIFICATION_STYLE,
          getHighlightClass(highlighted)
        )}
        followsLinkClass={false}
      >
        {frameObject}
      </SiteLink>
    )
  }
  return (
    <Col
      className={clsx(
        'group w-full',
        isChildOfGroup ? NESTED_NOTIFICATION_STYLE : NOTIFICATION_STYLE,
        getHighlightClass(highlighted)
      )}
      onClick={onClick}
    >
      {frameObject}
    </Col>
  )
}

const markNotificationsAsSeen = async (notifications: Notification[]) => {
  const unseenNotifications = notifications.filter((n) => !n.isSeen)
  return await Promise.all(
    unseenNotifications.map((n) => {
      const notificationDoc = doc(db, `users/${n.userId}/notifications/`, n.id)
      return updateDoc(notificationDoc, { isSeen: true, viewTime: new Date() })
    })
  )
}
