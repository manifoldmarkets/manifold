import { useDashboardFromSlug } from 'web/hooks/use-dashboard'
import { DashboardContent } from '../dashboard/dashboard-content'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { DashboardSidebar } from '../dashboard/dashboard-sidebar'
import { Title } from '../widgets/title'

export function NewsDashboard(props: { slug: string }) {
  const dashboard = useDashboardFromSlug(props.slug)

  if (!dashboard) return <LoadingIndicator />

  return (
    <div>
      <Title>{dashboard.title}</Title>
      <DashboardSidebar description={dashboard.description} />
      <DashboardContent items={dashboard.items} />
    </div>
  )
}

export function NewsSidebar(props: { slug: string }) {
  const dashboard = useDashboardFromSlug(props.slug)

  if (!dashboard) return null

  return <DashboardSidebar description={dashboard.description} inSidebar />
}
