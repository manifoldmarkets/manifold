import clsx from 'clsx'
import { Contract } from 'common/contract'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { HorizontalDashboardCard } from './dashboard/horizontal-dashboard-card'
import { Carousel } from './widgets/carousel'

export function HorizontalContractsCarousel(props: {
  contracts: Contract[]
  title?: string
  className?: string
}) {
  const { contracts, title, className } = props

  if (contracts.length === 0) return null

  return (
    <Col className={clsx('px-1', className)}>
      {title && (
        <Row className="items-center gap-1 font-semibold sm:text-lg">
          <div className="relative">
            <div className="h-4 w-4 animate-pulse rounded-full bg-indigo-500/40" />
            <div className="absolute left-1 top-1 h-2 w-2 rounded-full bg-indigo-500" />
          </div>
          <span>{title}</span>
        </Row>
      )}

      {/* If there's only one contract, just show it */}
      {contracts.length === 1 && (
        <HorizontalDashboardCard
          key={contracts[0].id}
          contract={contracts[0]}
          showGraph
          className="mb-8 w-full shadow-xl shadow-indigo-500/20"
        />
      )}

      {/* If there are two contracts, show them side by side on desktop, or as a carousel on mobile */}
      {contracts.length === 2 && (
        <>
          <Row className="hidden gap-2 sm:flex">
            {contracts.map((contract) => (
              <HorizontalDashboardCard
                key={contract.id}
                contract={contract}
                showGraph
                className="mb-8 w-1/2 shadow-xl shadow-indigo-500/20"
              />
            ))}
          </Row>
          <Carousel className="w-full max-w-3xl sm:hidden">
            {contracts.map((contract) => (
              <HorizontalDashboardCard
                key={contract.id}
                contract={contract}
                showGraph
                className="mb-8 min-w-[332px] shadow-xl shadow-indigo-500/20"
              />
            ))}
          </Carousel>
        </>
      )}

      {/* If there are more than two contracts, show them all in a carousel */}
      {contracts.length > 2 && (
        <Carousel className="w-full">
          {contracts.map((contract) => (
            <HorizontalDashboardCard
              key={contract.id}
              contract={contract}
              showGraph
              className="mb-8 min-w-[332px] shadow-xl shadow-indigo-500/20"
            />
          ))}
        </Carousel>
      )}
    </Col>
  )
}
