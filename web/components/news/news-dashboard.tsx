import { useDashboardFromSlug } from 'web/hooks/use-dashboard'
import { DashboardContent } from '../dashboard/dashboard-content'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { DashboardDescription } from '../dashboard/dashboard-description'
import { CopyLinkOrShareButton } from '../buttons/copy-link-button'
import { Row } from '../layout/row'
import { FollowDashboardButton } from '../dashboard/follow-dashboard-button'
import { RelativeTimestamp } from '../relative-timestamp'
import { Avatar } from '../widgets/avatar'
import { UserLink } from '../widgets/user-link'
import Link from 'next/link'
import { PencilIcon } from '@heroicons/react/outline'
import { useUser } from 'web/hooks/use-user'
import { buttonClass } from '../buttons/button'
import { Tooltip } from '../widgets/tooltip'
import { isAdminId } from 'common/envs/constants'

export function NewsDashboard(props: { slug: string }) {
  const dashboard = useDashboardFromSlug(props.slug)
  const user = useUser()

  if (!dashboard) return <LoadingIndicator />

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Row className="mb-2 flex items-center justify-between">
        <h2 className="text-primary-700 text-2xl font-normal sm:text-3xl">
          {dashboard.title}
        </h2>
        <div className="flex items-center">
          <CopyLinkOrShareButton
            eventTrackingName="share home news item"
            url={window.location.href}
            tooltip="Share"
          />

          <FollowDashboardButton
            dashboardId={dashboard.id}
            dashboardCreatorId={dashboard.creatorId}
            ttPlacement="bottom"
          />

          {user?.id && (user.id === dashboard.creatorId || isAdminId(user.id)) && (
            <Tooltip text="Edit" placement="bottom" noTap>
              <Link
                href={`/dashboard/${dashboard.slug}?edit=true`}
                className={buttonClass('md', 'gray-white')}
              >
                <PencilIcon className="h-5 w-5 cursor-pointer" />
              </Link>
            </Tooltip>
          )}
        </div>
      </Row>
      <Row className="mb-8 items-center gap-2">
        <Avatar
          username={dashboard.creatorUsername}
          avatarUrl={dashboard.creatorAvatarUrl}
          size="2xs"
        />
        <UserLink
          username={dashboard.creatorUsername}
          name={dashboard.creatorName}
          className="text-ink-700"
        />
        <span className="text-ink-400 ml-4 text-sm">
          Created
          <RelativeTimestamp time={dashboard.createdTime} />
        </span>
      </Row>

      <DashboardDescription description={dashboard.description} />
      <DashboardContent items={dashboard.items} topics={dashboard.topics} />
    </div>
  )
}
