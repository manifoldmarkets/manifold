import { SportsDashboardPage } from 'web/components/sports/sports-dashboard-page'

export default function NflDashboard() {
  return (
    <SportsDashboardPage
      sportsLeague="NFL"
      title="NFL 2026–27"
      emoji="🏈"
      trackPageView="nfl dashboard"
      communityDashboardSlug="ms-community-nfl2026"
    />
  )
}
