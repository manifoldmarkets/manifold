import { DASHBOARD_ENABLED } from 'common/envs/constants'
import { CreateDashboardButton } from 'web/components/dashboard/create-dashboard-button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useIsAuthorized, useUser } from 'web/hooks/use-user'
import Custom404 from '../404'
import { useEffect, useState } from 'react'
import { getYourDashboards } from 'web/lib/firebase/api'
import { Dashboard } from 'common/dashboard'
import Link from 'next/link'
import { Avatar } from 'web/components/widgets/avatar'
import { UserLink } from 'web/components/widgets/user-link'
import clsx from 'clsx'

export default function DashboardPage() {
  useRedirectIfSignedOut()
  const user = useUser()

  const isAuth = useIsAuthorized()

  const [yourDashboards, setYourDashboards] = useState<Dashboard[]>([])

  useEffect(() => {
    if (!isAuth) return
    getYourDashboards().then((results) => {
      setYourDashboards(results.dashboards as Dashboard[])
    })
  }, [isAuth])

  if (!DASHBOARD_ENABLED) {
    return <Custom404 />
  }
  return (
    <Page trackPageView={'dashboards page'}>
      <Col className="items-center">
        <Col className="w-full max-w-2xl px-4 sm:px-2">
          <Row className="mt-1 mb-3 items-start justify-between">
            <span className={'text-primary-600 text-2xl'}>Dashboards</span>
            {user && <CreateDashboardButton />}
          </Row>
          <DashboardPreviews dashboards={yourDashboards} />
        </Col>
      </Col>
    </Page>
  )
}

function DashboardPreviews(props: { dashboards?: Dashboard[] }) {
  const { dashboards } = props
  if (!dashboards || dashboards.length === 0) return null

  return (
    <Col className="gap-2">
      {dashboards.map((dashboard: Dashboard) => (
        <DashboardPreview key={dashboard.id} dashboard={dashboard} />
      ))}
    </Col>
  )
}

function DashboardPreview(props: { dashboard: Dashboard }) {
  const { dashboard } = props
  const { slug, creator_avatar_url, creator_username, creator_name } = dashboard
  return (
    <Link
      href={`/dashboard/${slug}`}
      className=" bg-canvas-0 border-canvas-0 hover:border-primary-300 flex flex-col gap-2 rounded-lg border px-4 py-2 transition-colors"
    >
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
      <div className="text-lg">{dashboard.title}</div>
    </Link>
  )
}
