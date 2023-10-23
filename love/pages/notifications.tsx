import { usePrivateUser } from 'web/hooks/use-user'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useEffect, useState } from 'react'
import { getNativePlatform } from 'web/lib/native/is-native'
import { useRouter } from 'next/router'
import { Title } from 'web/components/widgets/title'
import { SEO } from 'web/components/SEO'
import { Row } from 'web/components/layout/row'
import { AppBadgesOrGetAppButton } from 'web/components/buttons/app-badges-or-get-app-button'
import { updatePrivateUser } from 'web/lib/firebase/users'
import { XIcon } from '@heroicons/react/outline'
import { PrivateUser } from 'common/user'
import { useGroupedNotifications } from 'web/hooks/use-notifications'
import { QueryUncontrolledTabs } from 'web/components/layout/tabs'
import { NotificationSettings } from 'web/components/notification-settings'
import { NotificationsList } from 'web/pages/notifications'
import { NotificationReason } from 'common/notification'
import { LovePage } from 'love/components/love-page'
export const NOTIFICATIONS_TO_IGNORE: NotificationReason[] = ['league_changed']
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
    <LovePage trackPageView={'notifications page'}>
      <div className="w-full">
        <Title className="hidden lg:block">Notifications</Title>
        <SEO title="Notifications" description="Manifold user notifications" />
        {shouldShowBanner && <NotificationsAppBanner userId={privateUser.id} />}
        {privateUser && router.isReady ? (
          <NotificationsContent
            privateUser={privateUser}
            section={navigateToSection}
          />
        ) : null}
      </div>
    </LovePage>
  )
}

function NotificationsAppBanner(props: { userId: string }) {
  const { userId } = props
  return (
    <Row className="bg-primary-100 relative mb-2 justify-between rounded-md px-4 py-2 text-sm">
      <Row className={'text-ink-600 items-center gap-3 text-sm sm:text-base'}>
        Get the app for the best experience
        <AppBadgesOrGetAppButton />
      </Row>
      <button
        onClick={() =>
          updatePrivateUser(userId, {
            hasSeenAppBannerInNotificationsOn: Date.now(),
          })
        }
      >
        <XIcon className="text-ink-600 hover:text-ink-800 h-6 w-6" />
      </button>
    </Row>
  )
}

function NotificationsContent(props: {
  privateUser: PrivateUser
  section?: string
}) {
  const { privateUser, section } = props
  const {
    groupedNotifications,
    mostRecentNotification,
    groupedBalanceChangeNotifications,
    groupedNewMarketNotifications,
  } = useGroupedNotifications(privateUser.id, NOTIFICATIONS_TO_IGNORE)
  const [unseenNewMarketNotifs, setNewMarketNotifsAsSeen] = useState(
    groupedNewMarketNotifications?.filter((n) => !n.isSeen).length ?? 0
  )

  return (
    <div className="relative mt-2 h-full w-full">
      {privateUser && (
        <QueryUncontrolledTabs
          trackingName={'notification tabs'}
          labelClassName={'relative pb-2 pt-1 '}
          className={'mb-0 sm:mb-2'}
          onClick={(title) =>
            title === 'Following' ? setNewMarketNotifsAsSeen(0) : null
          }
          labelsParentClassName={'gap-3'}
          tabs={[
            {
              title: 'General',
              content: (
                <NotificationsList
                  privateUser={privateUser}
                  groupedNotifications={groupedNotifications}
                  mostRecentNotification={mostRecentNotification}
                />
              ),
            },
            {
              title: 'Following',
              inlineTabIcon:
                unseenNewMarketNotifs > 0 ? (
                  <div
                    className={
                      'text-ink-0 bg-primary-500 absolute -left-4 min-w-[15px] rounded-full p-[2px] text-center text-[10px] leading-3'
                    }
                  >
                    {unseenNewMarketNotifs}
                  </div>
                ) : undefined,
              content: (
                <NotificationsList
                  groupedNotifications={groupedNewMarketNotifications}
                  emptyTitle={
                    'You don’t have any new question notifications from followed users, yet. Try following some users to see more.'
                  }
                />
              ),
            },
            {
              title: 'Transactions',
              content: (
                <NotificationsList
                  groupedNotifications={groupedBalanceChangeNotifications}
                />
              ),
            },
            {
              title: 'Settings',
              content: <NotificationSettings navigateToSection={section} />,
            },
          ]}
        />
      )}
    </div>
  )
}
