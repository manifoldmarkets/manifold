'use client'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useState } from 'react'
import { Row } from 'web/components/layout/row'
import {
  ExclamationIcon,
  InformationCircleIcon,
  UserIcon,
} from '@heroicons/react/outline'
import { PrivateUser, User } from 'common/user'
import { useGroupedNotifications } from 'web/hooks/use-notifications'
import { NotificationsList } from 'web/pages/notifications'
import { PoliticsPage } from 'politics/components/politics-page'
import { Tabs } from 'web/components/layout/tabs'
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
import {
  NOTIFICATION_REASONS_TO_SELECT,
  NOTIFICATION_TYPES_TO_SELECT,
} from 'politics/app/notifications/constants'

export default function NotificationsPage() {
  const privateUser = usePrivateUser()
  const user = useUser()
  useRedirectIfSignedOut()

  return (
    <PoliticsPage trackPageView={'notifications page'}>
      <div>
        <Tabs
          tabs={[
            {
              title: 'Notifications',
              content:
                privateUser && user ? (
                  <NotificationsContent user={user} privateUser={privateUser} />
                ) : null,
            },
            {
              title: 'Settings',
              content: <NotificationSettings navigateToSection={undefined} />,
            },
          ]}
        />
      </div>
    </PoliticsPage>
  )
}

function NotificationsContent(props: { privateUser: PrivateUser; user: User }) {
  const { privateUser, user } = props
  const { groupedNotifications, mostRecentNotification } =
    useGroupedNotifications(
      user,
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

const notificationSectionData: NotificationSectionData = {
  label: 'General',
  subscriptionTypes: [
    'contract_from_followed_user',
    'trending_markets',
    'quest_payout',
    'betting_streaks',
    'profit_loss_updates',
    'tagged_user',
    'all_replies_to_my_comments_on_watched_markets',
    'all_replies_to_my_answers_on_watched_markets',
    'resolutions_on_watched_markets',
    'resolutions_on_watched_markets_with_shares_in',
  ],
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
          data={notificationSectionData}
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
