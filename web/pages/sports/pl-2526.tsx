import { SportsDashboardPage } from 'web/components/sports/sports-dashboard-page'

export default function PremierLeagueDashboard() {
  return (
    <SportsDashboardPage
      sportsLeague="Premier League"
      title="Premier League 2025/26"
      emoji="⚽"
      trackPageView="premier league dashboard"
      competitionCode="PL"
      communityDashboardSlug="ms-community-pl-2526"
      officialGroupSlug="ms-official-pl-2526"
    />
  )
}
