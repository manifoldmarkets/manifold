import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { SEO } from 'web/components/SEO'
import { Row } from 'web/components/layout/row'
import {
  ExclamationIcon,
  InformationCircleIcon,
  UserIcon,
} from '@heroicons/react/outline'
import { PrivateUser } from 'common/user'
import { useGroupedNotifications } from 'web/hooks/use-notifications'
import { NotificationsList } from 'web/pages/notifications'
import {
  notification_source_types,
  NotificationReason,
} from 'common/notification'
import { LovePage } from 'love/components/love-page'
import { Tabs } from 'web/components/layout/tabs'
import { ActivityLog } from 'web/components/activity-log'
import { ENV } from 'common/envs/constants'
import {
  NotificationSection,
  NotificationSectionData,
  optOutAll,
  PushNotificationsBanner,
  SectionRoutingContext,
} from 'web/components/notification-settings'
import { Col } from 'web/components/layout/col'
import { UserWatchedContractsButton } from 'web/components/notifications/watched-markets'
import { WatchMarketModal } from 'web/components/contract/watch-market-modal'

export const NOTIFICATION_TYPES_TO_SELECT: notification_source_types[] = [
  'new_match',
  'comment_on_lover',
]
export const NOTIFICATION_REASONS_TO_SELECT: NotificationReason[] = [
  'tagged_user',
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
        {/* <Title className="hidden lg:block">Notifications</Title> */}
        <SEO
          title="Notifications"
          description="Manifold.love user notifications"
        />
        <Tabs
          tabs={[
            {
              title: 'Notifications',
              content:
                privateUser && router.isReady ? (
                  <NotificationsContent
                    privateUser={privateUser}
                    section={navigateToSection}
                  />
                ) : null,
            },
            {
              title: 'Site activity',
              content: (
                <ActivityLog
                  className="mt-4"
                  count={100}
                  topicSlugs={['manifoldlove', 'manifoldlove-relationships']}
                  blockedUserIds={[manifoldLoveUserId]}
                  hideQuestions
                />
              ),
            },
            {
              title: 'Settings',
              content: <NotificationSettings navigateToSection={undefined} />,
            },
          ]}
        />
      </div>
    </LovePage>
  )
}

function NotificationsContent(props: {
  privateUser: PrivateUser
  section?: string
}) {
  const { privateUser } = props
  const { groupedNotifications, mostRecentNotification } =
    useGroupedNotifications(
      privateUser.id,
      NOTIFICATION_TYPES_TO_SELECT,
      NOTIFICATION_REASONS_TO_SELECT
    )

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

const manifoldLoveUserId =
  ENV === 'PROD'
    ? 'tRZZ6ihugZQLXPf6aPRneGpWLmz1'
    : 'RlXR2xa4EFfAzdCbSe45wkcdarh1'

const userInteractions: NotificationSectionData = {
  label: 'Users',
  subscriptionTypes: ['new_message', 'new_match'],
}
function NotificationSettings(props: {
  navigateToSection: string | undefined
}) {
  const { navigateToSection } = props
  const user = useUser()
  const [showWatchModal, setShowWatchModal] = useState(false)

  return (
    <SectionRoutingContext.Provider value={navigateToSection}>
      <Col className={'gap-6 p-2'}>
        <PushNotificationsBanner />
        <Row className={'text-ink-700 gap-2 text-xl'}>
          {user ? (
            <UserWatchedContractsButton user={user} />
          ) : (
            <span>Watched Questions</span>
          )}
          <InformationCircleIcon
            className="text-ink-500 -mb-1 h-5 w-5 cursor-pointer"
            onClick={() => setShowWatchModal(true)}
          />
        </Row>

        <NotificationSection
          icon={<UserIcon className={'h-6 w-6'} />}
          data={userInteractions}
        />

        <NotificationSection
          icon={<ExclamationIcon className={'h-6 w-6'} />}
          data={optOutAll}
        />
        <WatchMarketModal open={showWatchModal} setOpen={setShowWatchModal} />
      </Col>
    </SectionRoutingContext.Provider>
  )
}
