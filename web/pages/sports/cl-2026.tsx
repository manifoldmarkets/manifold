import { SportsDashboardPage } from 'web/components/sports/sports-dashboard-page'

export default function ChampionsLeagueDashboard() {
  return (
    <SportsDashboardPage
      sportsLeague="UEFA Champions League"
      title="UEFA Champions League 2025/26"
      emoji="🏆"
      trackPageView="champions league dashboard"
      competitionCode="CL"
      communityDashboardSlug="ms-community-cl-2026"
      officialGroupSlug="ms-official-cl-2026"
    />
  )
}
