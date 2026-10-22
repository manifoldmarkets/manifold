import { Contract } from 'common/contract'
import { HorizontalDashboardCard } from 'web/components/dashboard/horizontal-dashboard-card'
import { Carousel } from 'web/components/widgets/carousel'

// Automated replacement for the old hand-curated politicsheadline dashboard
// carousel: the server selects the hottest open midterm markets by daily
// score (see getTrendingMidtermContracts in web/lib/politics/home.ts), and
// each card keeps its odds live via useLiveContract inside the card.
export function TrendingMidtermsCarousel(props: { contracts: Contract[] }) {
  const { contracts } = props

  if (contracts.length === 0) return null

  return (
    <Carousel className="w-full">
      {contracts.map((contract) => (
        <HorizontalDashboardCard
          key={contract.id}
          contract={contract}
          showGraph
          trackingPostfix="election trending"
          className="mb-8 min-w-[332px] shadow-xl shadow-indigo-500/20"
        />
      ))}
    </Carousel>
  )
}
