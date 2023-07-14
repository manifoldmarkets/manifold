import clsx from 'clsx'
import { Notification, ReactionNotificationTypes } from 'common/notification'
import { PrivateUser } from 'common/user'
import { sortBy } from 'lodash'
import { useRouter } from 'next/router'
import React, { Fragment, ReactNode, useEffect, useMemo, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { QueryUncontrolledTabs } from 'web/components/layout/tabs'
import { NotificationSettings } from 'web/components/notification-settings'
import { combineAndSumIncomeNotifications } from 'web/components/notifications/income-summary-notifications'
import {
  combineReactionNotifications,
  NOTIFICATIONS_PER_PAGE,
  NUM_SUMMARY_LINES,
  ParentNotificationHeader,
  PARENT_NOTIFICATION_STYLE,
  QuestionOrGroupLink,
} from 'web/components/notifications/notification-helpers'
import { createAnnouncement, markAllNotifications } from 'web/lib/firebase/api'
import { NotificationItem } from 'web/components/notifications/notification-types'
import { PushNotificationsModal } from 'web/components/push-notifications-modal'
import { SEO } from 'web/components/SEO'
import { ShowMoreLessButton } from 'web/components/widgets/collapsible-content'
import { Pagination } from 'web/components/widgets/pagination'
import { Title } from 'web/components/widgets/title'
import {
  NotificationGroup,
  useGroupedBalanceChangeNotifications,
  useGroupedNonBalanceChangeNotifications,
} from 'web/hooks/use-notifications'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { usePrivateUser, useIsAuthorized } from 'web/hooks/use-user'
import { XIcon } from '@heroicons/react/outline'
import { updatePrivateUser } from 'web/lib/firebase/users'
import { getNativePlatform } from 'web/lib/native/is-native'
import { AppBadgesOrGetAppButton } from 'web/components/buttons/app-badges-or-get-app-button'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { useAdmin } from 'web/hooks/use-admin'
import { useTextEditor } from 'web/components/widgets/editor'
import { User } from 'common/user'
import { savePost } from 'web/components/groups/group-about-section'
import { Input } from 'web/components/widgets/input'
import WaitingForSupabaseButton from 'web/components/contract/waiting-for-supabase-button'
import { Button } from 'web/components/buttons/button'

export default function NotificationsPage() {
  const privateUser = usePrivateUser()
  useRedirectIfSignedOut()

  const [navigateToSection, setNavigateToSection] = useState<string>()
  const { isNative } = getNativePlatform()
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
    <Page>
      <Col className="mx-auto w-full p-2 pb-0">
        <Title className="hidden lg:block">Notifications</Title>
        <SEO title="Notifications" description="Manifold user notifications" />
        {shouldShowBanner && <NotificationsAppBanner userId={privateUser.id} />}
        {privateUser && router.isReady ? (
          <NotificationsContent
            privateUser={privateUser}
            section={navigateToSection}
          />
        ) : null}
      </Col>
    </Page>
  )
}

function NotificationsAppBanner(props: { userId: string }) {
  const { userId } = props
  return (
    <Row className="bg-primary-50 relative mb-2 rounded-md py-2 px-4 text-sm">
      <XIcon
        onClick={() =>
          updatePrivateUser(userId, {
            hasSeenAppBannerInNotificationsOn: Date.now(),
          })
        }
        className={
          'bg-canvas-100 absolute -top-1 -right-1 h-4 w-4 cursor-pointer rounded-full sm:p-0.5'
        }
      />
      <span className={'text-ink-600 text-sm sm:text-base'}>
        <Row className={'items-center'}>
          Get notified when markets resolve, your streak is expiring, or when
          someone @'s you.
          <Col
            className={'min-w-fit items-center justify-center p-2 md:flex-row'}
          >
            <AppBadgesOrGetAppButton />
          </Col>
        </Row>
      </span>
    </Row>
  )
}

function SendCustomNotification() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')

  // const editor = useTextEditor({
  //   placeholder: 'Write your announcement here...',
  //   size: 'md',
  // })

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    setIsSubmitting(true)

    const result = await createAnnouncement({ url, title }).catch((e) => {
      const errorDetails = e.details[0]
      if (errorDetails)
        setErrorText(
          `Error with ${errorDetails.field} field - ${errorDetails.error} `
        )
      else setErrorText(e.message)
      setIsSubmitting(false)
      console.error(e)
      return e
    })

    if (!result.notification) {
      setIsSubmitting(false)
      return false
    }
    //   if (editor && !editor.isEmpty) {
    //     savePost(editor, result.notification)
    //   }
    //   editor?.commands.clearContent(true)
    //   setIsSubmitting(false)
    //   setTitle('')
    //   setUrl('')
  }

  return (
    <form onSubmit={onSubmit}>
      <Input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Enter announcement"
        required
      />
      <Input
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Enter URL if applicable"
      />
      <Button
        className="w-full"
        type="submit"
        color="indigo"
        size="xl"
        loading={isSubmitting}
      >
        {isSubmitting ? 'Creating...' : 'Send announcement'}
      </Button>
    </form>
  )
}

function NotificationsContent(props: {
  privateUser: PrivateUser
  section?: string
}) {
  const { privateUser, section } = props
  const { groupedNotifications, mostRecentNotification } =
    useGroupedNonBalanceChangeNotifications(privateUser.id)
  const balanceChangeGroupedNotifications =
    useGroupedBalanceChangeNotifications(privateUser.id)
  const isAdmin = useAdmin()

  const tabs = [
    {
      title: 'Notifications',
      content: (
        <NotificationsList
          privateUser={privateUser}
          groupedNotifications={groupedNotifications}
          mostRecentNotification={mostRecentNotification}
        />
      ),
    },
    {
      title: 'Balance Changes',
      content: (
        <NotificationsList
          groupedNotifications={balanceChangeGroupedNotifications}
        />
      ),
    },
    {
      title: 'Settings',
      content: (
        <NotificationSettings
          navigateToSection={section}
          privateUser={privateUser}
        />
      ),
    },
  ]

  if (isAdmin) {
    tabs.push({
      title: 'Send Notif',
      content: <SendCustomNotification />,
    })
  }

  return (
    <div className="relative h-full w-full">
      <div className="relative">
        {privateUser && (
          <QueryUncontrolledTabs
            currentPageForAnalytics={'notifications'}
            labelClassName={'pb-2 pt-1 '}
            className={'mb-0 sm:mb-2'}
            tabs={tabs}
          />
        )}
      </div>
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

  const grayLine = (
    <div className="bg-ink-300 mx-auto h-[1.5px] w-[calc(100%-1rem)]" />
  )
  return (
    <>
      {notificationGroups.map((notification) => (
        <Fragment key={notification.groupedById}>
          {notification.notifications.length === 1 ? (
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
          itemsPerPage={NOTIFICATIONS_PER_PAGE}
          totalItems={totalItems}
          setPage={setPage}
          savePageToQuery={true}
        />
      )}
    </>
  )
}

function NotificationsList(props: {
  groupedNotifications: NotificationGroup[] | undefined
  privateUser?: PrivateUser
  mostRecentNotification?: Notification
}) {
  const { privateUser, groupedNotifications, mostRecentNotification } = props
  const isAuthorized = useIsAuthorized()
  const [page, setPage] = useState(0)

  const paginatedGroupedNotifications = useMemo(() => {
    const start = page * NOTIFICATIONS_PER_PAGE
    const end = start + NOTIFICATIONS_PER_PAGE
    return groupedNotifications?.slice(start, end)
  }, [groupedNotifications, page])

  const isPageVisible = useIsPageVisible()

  // Mark all notifications as seen. Rerun as new notifications come in.
  useEffect(() => {
    if (privateUser && isPageVisible && isAuthorized) {
      markAllNotifications({ seen: true })
    }
  }, [privateUser, isPageVisible, mostRecentNotification?.id, isAuthorized])

  return (
    <Col className={'min-h-[100vh] gap-0 text-sm'}>
      {groupedNotifications === undefined ||
      paginatedGroupedNotifications === undefined ? (
        <LoadingIndicator />
      ) : paginatedGroupedNotifications.length === 0 ? (
        <div className={'mt-2'}>
          You don't have any notifications, yet. Try changing your settings to
          see more.
        </div>
      ) : (
        <RenderNotificationGroups
          notificationGroups={paginatedGroupedNotifications}
          totalItems={groupedNotifications.length}
          page={page}
          setPage={setPage}
        />
      )}
      {privateUser && groupedNotifications && (
        <PushNotificationsModal
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
  const header = (
    <ParentNotificationHeader
      header={
        sourceTitle || sourceContractTitle ? (
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
      highlighted={groupHighlighted}
    />
  )

  return (
    <NotificationGroupItemComponent
      notifications={combinedNotifs}
      header={header}
    />
  )
}

export function NotificationGroupItemComponent(props: {
  notifications: Notification[]
  header: ReactNode
  className?: string
}) {
  const { notifications, className, header } = props
  const numNotifications = notifications.length

  const needsExpanding = numNotifications > NUM_SUMMARY_LINES
  const [expanded, setExpanded] = useState(false)
  const onExpandHandler = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey) return
    setExpanded(!expanded)
  }

  const shownNotifications = expanded
    ? notifications
    : notifications.slice(0, NUM_SUMMARY_LINES)
  return (
    <div className={clsx(PARENT_NOTIFICATION_STYLE, className)}>
      {header}
      <div className={clsx(' whitespace-pre-line')}>
        {shownNotifications.map((notification) => {
          return (
            <NotificationItem
              notification={notification}
              key={notification.id}
              isChildOfGroup={true}
            />
          )
        })}
        {needsExpanding && (
          <Row className={clsx('w-full items-center justify-end gap-1')}>
            <ShowMoreLessButton
              onClick={onExpandHandler}
              isCollapsed={!expanded}
              howManyMore={numNotifications - NUM_SUMMARY_LINES}
            />
          </Row>
        )}
      </div>
    </div>
  )
}
