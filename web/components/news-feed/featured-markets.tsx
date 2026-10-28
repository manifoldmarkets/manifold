import Link from 'next/link'
import { Contract, contractPath } from 'common/contract'
import { NewsFeaturedMarket } from 'common/news-feed'
import { shortFormatNumber } from 'common/util/format'
import { removeEmojis } from 'common/util/string'
import { ContractStatusLabel } from 'web/components/contract/contracts-table'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Carousel } from 'web/components/widgets/carousel'
import { useLiveContract } from 'web/hooks/use-contract'
import { trackNews } from './news-events'

type FeaturedMarket = NewsFeaturedMarket & { contract: Contract }

/** After the top story, the markets in the news with the most trading today. */
export function FeaturedMarkets(props: { markets: FeaturedMarket[] }) {
  const { markets } = props
  if (markets.length === 0) return null
  return (
    <section>
      <Row className="items-baseline justify-between px-1">
        <h2 className="text-ink-900 text-sm font-semibold">
          Markets in the news
        </h2>
        <span className="text-ink-400 text-xs">Most traded today</span>
      </Row>
      <Carousel
        className="-mx-2 px-2 sm:-mx-4 sm:px-4"
        labelsParentClassName="gap-2 py-2"
        fadeEdges
        showArrowsOnHover
      >
        {markets.map((m) => (
          <FeaturedCard key={m.contractId} market={m} />
        ))}
      </Carousel>
    </section>
  )
}

function FeaturedCard(props: { market: FeaturedMarket }) {
  const contract = useLiveContract(props.market.contract)
  const { headline } = props.market
  const today = contract.volume24Hours ?? 0
  const traders = contract.uniqueBettorCount ?? 0
  return (
    <Link
      href={contractPath(contract)}
      onClick={() =>
        trackNews('news market click', {
          contractId: contract.id,
          from: 'featured',
        })
      }
      className="bg-canvas-0 border-ink-200 hover:border-primary-300 w-60 shrink-0 snap-start rounded-lg border p-3 transition-colors"
    >
      <Col className="h-full gap-1.5">
        <span className="text-ink-900 line-clamp-2 text-sm font-medium leading-snug">
          {removeEmojis(contract.question)}
        </span>
        <Row className="mt-auto items-center justify-between gap-2">
          <ContractStatusLabel
            contract={contract}
            className="text-sm font-semibold"
          />
          <span className="text-ink-500 text-xs">
            {Number.isFinite(today) && today > 0
              ? `Ṁ${shortFormatNumber(today)} today`
              : `${traders} traders`}
          </span>
        </Row>
        <span className="text-ink-400 line-clamp-1 text-[11px]">
          {headline}
        </span>
      </Col>
    </Link>
  )
}
