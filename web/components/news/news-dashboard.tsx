import { useDashboardFromSlug } from 'web/hooks/use-dashboard'
import { DashboardContent } from '../dashboard/dashboard-content'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { DashboardDescription } from '../dashboard/dashboard-description'
import { Title } from '../widgets/title'

export function NewsDashboard(props: { slug: string }) {
  const dashboard = useDashboardFromSlug(props.slug)

  if (!dashboard) return <LoadingIndicator />

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Title>{dashboard.title}</Title>
      <DashboardDescription description={dashboard.description} />
      <DashboardContent items={dashboard.items} />
    </div>
  )
}
