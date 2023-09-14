import { Dashboard } from 'common/dashboard'
import { Col } from '../layout/col'
import Link from 'next/link'
import { Row } from '../layout/row'
import { Avatar } from '../widgets/avatar'
import { UserLink } from '../widgets/user-link'
import { FollowDashboardButton } from './follow-dashboard-button'
import clsx from 'clsx'
import { LoadingIndicator } from '../widgets/loading-indicator'

export function DashboardCards(props: { dashboards?: Dashboard[] }) {
  const { dashboards } = props
  if (!dashboards) {
    return <LoadingIndicator />
  }
  if (dashboards.length === 0) return null

  return (
    <Col className="gap-2">
      {dashboards.map((dashboard: Dashboard) => (
        <DashboardCard key={dashboard.id} dashboard={dashboard} />
      ))}
    </Col>
  )
}

function DashboardCard(props: { dashboard: Dashboard }) {
  const { dashboard } = props
  const { slug, creator_avatar_url, creator_username, creator_name } = dashboard
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
            avatarUrl={creator_avatar_url}
            username={creator_username}
          />
          <UserLink
            name={creator_name}
            username={creator_username}
            className={clsx(
              'w-full max-w-[10rem] text-ellipsis sm:max-w-[12rem]'
            )}
          />
        </Row>
        <FollowDashboardButton
          dashboardId={dashboard.id}
          dashboardCreatorId={dashboard.creator_id}
          size={'sm'}
        />
      </Row>
      <div className="text-lg">{dashboard.title}</div>
    </Link>
  )
}
