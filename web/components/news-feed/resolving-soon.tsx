import Link from 'next/link'
import { Contract, contractPath } from 'common/contract'
import { NewsStory } from 'common/news-feed'
import { DAY_MS, HOUR_MS } from 'common/util/time'
import { removeEmojis } from 'common/util/string'
import { ContractStatusLabel } from 'web/components/contract/contracts-table'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { RelatedMarketRow } from 'web/components/sports/game-related-markets'
import { Carousel } from 'web/components/widgets/carousel'
import { useLiveContract } from 'web/hooks/use-contract'

/** Linked markets that close within the week, soonest first. */
export function ResolvingSoon(props: {
  contracts: Contract[]
  storiesByContractId: Record<string, NewsStory>
}) {
  const { contracts, storiesByContractId } = props
  if (contracts.length === 0) return null
  return (
    <section>
      <Row className="items-baseline justify-between px-1">
        <h2 className="text-ink-900 text-sm font-semibold">Resolving soon</h2>
        <span className="text-ink-400 text-xs">
          Markets in the news that close this week
        </span>
      </Row>
      <Carousel
        className="-mx-2 px-2 sm:-mx-4 sm:px-4"
        labelsParentClassName="gap-2 py-2"
        fadeEdges
        showArrowsOnHover
      >
        {contracts.map((c) => (
          <ResolvingCard
            key={c.id}
            contract={c}
            story={storiesByContractId[c.id]}
          />
        ))}
      </Carousel>
    </section>
  )
}

function ResolvingCard(props: { contract: Contract; story?: NewsStory }) {
  const contract = useLiveContract(props.contract)
  const { story } = props
  return (
    <Link
      href={contractPath(contract)}
      className="bg-canvas-0 border-ink-200 hover:border-primary-300 w-60 shrink-0 snap-start rounded-lg border p-3 transition-colors"
    >
      <Col className="h-full gap-1.5">
        <span className="text-ink-800 line-clamp-2 text-sm font-medium leading-snug">
          {removeEmojis(contract.question)}
        </span>
        <Row className="mt-auto items-center justify-between gap-2">
          <ContractStatusLabel
            contract={contract}
            className="text-sm font-semibold"
          />
          <span className="text-ink-500 text-xs">
            closes in {closesIn(contract.closeTime)}
          </span>
        </Row>
        {story && (
          <span className="text-ink-400 line-clamp-1 text-[11px]">
            {story.headline}
          </span>
        )}
      </Col>
    </Link>
  )
}

const closesIn = (closeTime: number | undefined) => {
  if (!closeTime) return '—'
  const ms = closeTime - Date.now()
  if (ms <= 0) return 'now'
  if (ms >= DAY_MS) return `${Math.round(ms / DAY_MS)}d`
  if (ms >= HOUR_MS) return `${Math.round(ms / HOUR_MS)}h`
  return `${Math.max(1, Math.round(ms / 60_000))}m`
}

/** The most-traded market in the news right now, with the story behind it. */
export function SpotlightQuestion(props: {
  contract: Contract
  story?: NewsStory
}) {
  const { contract, story } = props
  return (
    <section className="border-primary-300 bg-canvas-0 rounded-lg border">
      <div className="px-3 pt-2.5">
        <Row className="items-baseline justify-between gap-2">
          <span className="text-primary-700 text-[11px] font-semibold uppercase tracking-wide">
            Today's question
          </span>
          {story && (
            <a
              href={story.sources[0]?.url}
              target="_blank"
              rel="noreferrer"
              className="text-ink-500 hover:text-primary-700 line-clamp-1 min-w-0 text-xs"
            >
              {story.headline}
            </a>
          )}
        </Row>
      </div>
      <div className="px-0.5 pb-0.5">
        <RelatedMarketRow contract={contract} />
      </div>
    </section>
  )
}
