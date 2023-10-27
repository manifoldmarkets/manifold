import { usePrivateUser } from 'web/hooks/use-user'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Title } from 'web/components/widgets/title'
import { SEO } from 'web/components/SEO'
import { Row } from 'web/components/layout/row'
import { AppBadgesOrGetAppButton } from 'web/components/buttons/app-badges-or-get-app-button'
import { updatePrivateUser } from 'web/lib/firebase/users'
import { XIcon } from '@heroicons/react/outline'
import { PrivateUser } from 'common/user'
import { useGroupedNotifications } from 'web/hooks/use-notifications'
import { NotificationsList } from 'web/pages/notifications'
import { notification_source_types } from 'common/notification'
import { LovePage } from 'love/components/love-page'
export const NOTIFICATIONS_TO_SELECT: notification_source_types[] = [
  'new_match',
  'comment_on_lover',
]
export default function NotificationsPage() {
  const privateUser = usePrivateUser()
  useRedirectIfSignedOut()

  const [navigateToSection, setNavigateToSection] = useState<string>()
  const router = useRouter()
  useEffect(() => {
    if (!router.isReady) return
    const query = { ...router.query }
    if (query.section) {
      setNavigateToSection(query.section as string)
    }
  }, [router.query])

  return (
    <LovePage trackPageView={'notifications page'}>
      <div className="w-full">
        <Title className="hidden lg:block">Notifications</Title>
        <SEO title="Notifications" description="Manifold user notifications" />
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

function _NotificationsAppBanner(props: { userId: string }) {
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
  const { privateUser } = props
  const { groupedNotifications, mostRecentNotification } =
    useGroupedNotifications(privateUser.id, NOTIFICATIONS_TO_SELECT)

  return (
    <div className="relative mt-2 h-full w-full">
      {privateUser && (
        <NotificationsList
          privateUser={privateUser}
          groupedNotifications={groupedNotifications}
          mostRecentNotification={mostRecentNotification}
        />
      )}
    </div>
  )
}
