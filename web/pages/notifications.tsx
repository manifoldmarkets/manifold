import {
  ChevronDoubleDownIcon,
  ChevronDoubleUpIcon,
} from '@heroicons/react/solid'
import clsx from 'clsx'
import { Notification } from 'common/notification'
import { PrivateUser } from 'common/user'
import { useRouter } from 'next/router'
import React, { ReactNode, useEffect, useMemo, useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { ControlledTabs } from 'web/components/layout/tabs'
import { NotificationSettings } from 'web/components/notification-settings'
import { IncomeNotificationGroupItem } from 'web/components/notifications/income-summary-notifications'
import {
  markNotificationsAsSeen,
  NOTIFICATIONS_PER_PAGE,
  NUM_SUMMARY_LINES,
  ParentNotificationHeader,
  PARENT_NOTIFICATION_STYLE,
  QuestionOrGroupLink,
} from 'web/components/notifications/notification-helpers'
import { NotificationItem } from 'web/components/notifications/notification-types'
import { PushNotificationsModal } from 'web/components/push-notifications-modal'
import { SEO } from 'web/components/SEO'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Pagination } from 'web/components/widgets/pagination'
import { Title } from 'web/components/widgets/title'
import {
  NotificationGroup,
  useGroupedNotifications,
} from 'web/hooks/use-notifications'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { usePrivateUser } from 'web/hooks/use-user'

export default function Notifications() {
  const privateUser = usePrivateUser()
  const router = useRouter()
  const [navigateToSection, setNavigateToSection] = useState<string>()
  const [activeIndex, setActiveIndex] = useState(0)
  const [allMarkedAsRead, setAllMarkedAsRead] = useState(false)

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
        <Row className="hidden w-full justify-between md:flex">
          <Title text={'Notifications'} className="grow" />
          <div className="my-auto">
            <Button
              onClick={() => {
                setAllMarkedAsRead(true)
                setTimeout(() => setAllMarkedAsRead(false), 50)
              }}
            >
              Mark all as read
            </Button>
          </div>
        </Row>
        <SEO title="Notifications" description="Manifold user notifications" />

        {privateUser && router.isReady && (
          <div className="relative">
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
                  content: (
                    <NotificationsList
                      privateUser={privateUser}
                      allMarkedAsRead={allMarkedAsRead}
                    />
                  ),
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
  allMarkedAsRead: boolean
}) {
  const { notificationGroups, allMarkedAsRead } = props
  const grayLine = <hr className="mx-auto w-[calc(100%-1rem)] bg-gray-400" />
  return (
    <>
      {notificationGroups.map((notification) =>
        notification.type === 'income' ? (
          <>
            <IncomeNotificationGroupItem
              notificationGroup={notification}
              key={notification.groupedById + notification.timePeriod}
              allMarkedAsRead={allMarkedAsRead}
            />
            {grayLine}
          </>
        ) : notification.notifications.length === 1 ? (
          <>
            <NotificationItem
              notification={notification.notifications[0]}
              key={notification.notifications[0].id}
              markedAsRead={allMarkedAsRead}
            />
            {grayLine}
          </>
        ) : (
          <>
            <NotificationGroupItem
              notificationGroup={notification}
              key={notification.groupedById + notification.timePeriod}
              allMarkedAsRead={allMarkedAsRead}
            />
            {grayLine}
          </>
        )
      )}
    </>
  )
}

function NotificationsList(props: {
  privateUser: PrivateUser
  allMarkedAsRead: boolean
}) {
  const { privateUser, allMarkedAsRead } = props

  const [page, setPage] = useState(0)

  const allGroupedNotifications = useGroupedNotifications(privateUser)
  const paginatedGroupedNotifications = useMemo(() => {
    if (!allGroupedNotifications) return undefined

    const start = page * NOTIFICATIONS_PER_PAGE
    const end = start + NOTIFICATIONS_PER_PAGE
    return allGroupedNotifications.slice(start, end)
  }, [allGroupedNotifications, page])

  // const isPageVisible = useIsPageVisible()

  // Mark all notifications as seen.
  // useEffect(() => {
  //   if (isPageVisible && allGroupedNotifications) {
  //     const notifications = allGroupedNotifications
  //       .flat()
  //       .flatMap((g) => g.notifications)

  //     markNotificationsAsSeen(notifications)
  //   }
  // }, [isPageVisible, allGroupedNotifications])

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
        allMarkedAsRead={allMarkedAsRead}
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
  allMarkedAsRead: boolean
}) {
  const { notificationGroup, allMarkedAsRead } = props
  const { notifications } = notificationGroup
  const { sourceContractTitle } = notifications[0]
  const highlighted = notifications.some((n) => !n.isSeen)
  const header = (
    <ParentNotificationHeader
      header={
        sourceContractTitle ? (
          <>
            Activity on{' '}
            <QuestionOrGroupLink
              notification={notifications[0]}
              truncatedLength={'xl'}
            />
          </>
        ) : (
          <span>Other Activity</span>
        )
      }
      highlighted={highlighted}
    />
  )

  return (
    <NotificationGroupItemComponent
      notifications={notifications}
      header={header}
      allMarkedAsRead={allMarkedAsRead}
    />
  )
}

export function NotificationGroupItemComponent(props: {
  notifications: Notification[]
  header: ReactNode
  allMarkedAsRead: boolean
  isIncomeNotification?: boolean
  className?: string
}) {
  const {
    notifications,
    className,
    header,
    allMarkedAsRead,
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
                markedAsRead={allMarkedAsRead}
              />
            )
          })}
        {needsExpanding && (
          <Row
            className={clsx(
              'text my-1 w-full items-center justify-end gap-1 text-indigo-700'
            )}
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
