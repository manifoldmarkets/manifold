import { Dashboard } from 'common/dashboard'
import { Col } from '../layout/col'
import Link from 'next/link'
import { Row } from '../layout/row'
import { Avatar } from '../widgets/avatar'
import { UserLink } from '../widgets/user-link'
import { FollowDashboardButton } from './follow-dashboard-button'
import clsx from 'clsx'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { LoadMoreUntilNotVisible } from '../widgets/visibility-observer'

export function DashboardCards(props: {
  dashboards?: Dashboard[]
  loadMore?: () => Promise<boolean>
}) {
  const { dashboards, loadMore } = props
  if (!dashboards) {
    return <LoadingIndicator />
  }
  if (dashboards.length === 0) return null

  return (
    <>
      <Col className="gap-2">
        {dashboards.map((dashboard: Dashboard) => (
          <DashboardCard key={dashboard.id} dashboard={dashboard} />
        ))}
      </Col>
      {loadMore && <LoadMoreUntilNotVisible loadMore={loadMore} />}
    </>
  )
}

function DashboardCard(props: { dashboard: Dashboard }) {
  const {
    id,
    title,
    slug,
    creatorId,
    creatorAvatarUrl,
    creatorUsername,
    creatorName,
  } = props.dashboard
  return (
    <Link
      href={`/dashboard/${slug}`}
      className=" bg-canvas-0 border-canvas-0 hover:border-primary-300 flex flex-col gap-2 rounded-lg border px-4 py-2 transition-colors"
    >
      <Row className="w-full items-center justify-between">
        <Row className={'text-ink-500 items-center gap-1 text-sm'}>
          <Avatar
            size={'xs'}
            className={'mr-0.5'}
            avatarUrl={creatorAvatarUrl}
            username={creatorUsername}
          />
          <UserLink
            name={creatorName}
            username={creatorUsername}
            className={clsx(
              'w-full max-w-[10rem] text-ellipsis sm:max-w-[12rem]'
            )}
          />
        </Row>
        <FollowDashboardButton
          dashboardId={id}
          dashboardCreatorId={creatorId}
          ttPlacement="left"
        />
      </Row>
      <div className="text-lg">{title}</div>
    </Link>
  )
}
