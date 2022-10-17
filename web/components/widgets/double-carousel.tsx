import { Contract } from 'common/contract'
import { range } from 'lodash'
import { Carousel } from 'web/components/widgets/carousel'
import { ContractCard } from 'web/components/contract/contract-card'
import { ShowTime } from 'web/components/contract/contract-details'
import { Col } from 'web/components/layout/col'

export function DoubleCarousel(props: {
  contracts: Contract[]
  showTime?: ShowTime
  loadMore?: () => void
}) {
  const { contracts, showTime, loadMore } = props
  return (
    <Carousel className="-mx-4 mt-2 sm:-mx-10" loadMore={loadMore}>
      <div className="shrink-0 sm:w-6" />
      {contracts.length >= 6
        ? range(0, Math.floor(contracts.length / 2)).map((col) => {
            const i = col * 2
            return (
              <Col className="snap-start scroll-m-4" key={contracts[i].id}>
                <ContractCard
                  contract={contracts[i]}
                  className="mb-2 w-96 shrink-0"
                  questionClass="line-clamp-3"
                  trackingPostfix=" tournament"
                  showTime={showTime}
                />
                <ContractCard
                  contract={contracts[i + 1]}
                  className="mb-2 w-96 shrink-0"
                  questionClass="line-clamp-3"
                  trackingPostfix=" tournament"
                  showTime={showTime}
                />
              </Col>
            )
          })
        : contracts.map((c) => (
            <ContractCard
              key={c.id}
              contract={c}
              className="mb-2 max-h-[220px] w-96 shrink-0"
              questionClass="line-clamp-3"
              trackingPostfix=" tournament"
              showTime={showTime}
            />
          ))}
    </Carousel>
  )
}
