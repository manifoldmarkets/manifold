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
import { ENV_CONFIG, isAdminId, isTrustworthy } from 'common/envs/constants'
import { Dashboard } from 'common/dashboard'
import { LinkPreviews } from 'common/link-preview'

export function NewsDashboard(props: {
  dashboard: Dashboard
  previews: LinkPreviews
}) {
  const { dashboard, previews } = props
  const user = useUser()
  const isCreator = user?.id === dashboard.creatorId
  const isOnlyMod =
    user && !isCreator && (isAdminId(user.id) || isTrustworthy(user.username))

  if (!dashboard) return <LoadingIndicator />

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Row className="mb-2 flex items-center justify-between">
        <h2 className="text-primary-700 text-2xl font-normal sm:text-3xl">
          {dashboard.title}
        </h2>
        <div className="flex items-center">
          {user !== undefined && (
            <CopyLinkOrShareButton
              eventTrackingName="share home news item"
              url={`https://${ENV_CONFIG.domain}/news?tab=${dashboard.slug}`}
              tooltip="Share"
            />
          )}

          <FollowDashboardButton
            dashboardId={dashboard.id}
            dashboardCreatorId={dashboard.creatorId}
            ttPlacement="bottom"
          />

          {(isCreator || isOnlyMod) && (
            <Tooltip
              text={isOnlyMod ? 'Edit as mod' : 'Edit'}
              placement="bottom"
              noTap
            >
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
      <DashboardContent
        items={dashboard.items}
        topics={dashboard.topics}
        previews={previews}
      />
    </div>
  )
}
