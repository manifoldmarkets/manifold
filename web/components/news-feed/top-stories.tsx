import clsx from 'clsx'
import { ComponentProps, useEffect, useRef, useState } from 'react'
import { Contract } from 'common/contract'
import { NewsSpotlight, NewsStory } from 'common/news-feed'
import { shortFormatNumber } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { trackNews } from './news-events'
import { Price } from './news-market-row'
import { CategoryChip, StoryCard } from './story-card'

type CardProps = Omit<ComponentProps<typeof StoryCard>, 'hero' | 'className'>

/**
 * The day's top stories: one in the wide hero slot, the others as small
 * tiles under it. Picking a tile swaps that story into the hero slot and
 * opens its forecasts there, so the wide layout always carries the detail
 * and the tiles stay easy to skim or ignore.
 */
export function TopStories(props: {
  /** Best first. */
  top: NewsSpotlight[]
  cardProps: (story: NewsStory, position: number) => CardProps
  contractsById: Record<string, Contract>
  /** The reader picked a tile; open that story's forecasts. */
  onSelect: (story: NewsStory) => void
}) {
  const { top, cardProps, contractsById, onSelect } = props
  const [selectedId, setSelectedId] = useState<string>()
  const heroRef = useRef<HTMLDivElement>(null)

  // A new set of top stories starts again from the first.
  const topKey = top.map((t) => t.story.id).join()
  useEffect(() => {
    if (selectedId && !top.some((t) => t.story.id === selectedId))
      setSelectedId(undefined)
  }, [topKey])

  const hero = top.find((t) => t.story.id === selectedId) ?? top[0]
  if (!hero) return null
  const tiles = top.filter((t) => t.story.id !== hero.story.id)

  const select = (t: NewsSpotlight, position: number) => {
    trackNews('news top story select', { storyId: t.story.id, position })
    setSelectedId(t.story.id)
    onSelect(t.story)
    // On a phone the hero sits above the tiles; bring it back into view.
    heroRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }

  return (
    <Col className="gap-1.5">
      <Label hero={hero} />
      <div ref={heroRef} className="scroll-mt-2">
        <StoryCard
          key={hero.story.id}
          {...cardProps(hero.story, top.indexOf(hero))}
          hero
        />
      </div>
      {tiles.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-3">
          {tiles.map((t) => (
            <Tile
              key={t.story.id}
              pick={t}
              contractsById={contractsById}
              onSelect={() => select(t, top.indexOf(t))}
            />
          ))}
        </div>
      )}
    </Col>
  )
}

/** The heading, and why the story in the hero slot ranks. */
function Label(props: { hero: NewsSpotlight }) {
  const { reason, value } = props.hero
  return (
    <Row className="items-baseline justify-between gap-2 px-1">
      <h2 className="text-primary-700 text-[11px] font-semibold uppercase tracking-wide">
        Top stories today
      </h2>
      <span className="text-ink-400 text-xs">
        {reason === 'likes'
          ? `${value} ${value === 1 ? 'like' : 'likes'}`
          : `Ṁ${shortFormatNumber(value)} traded on its markets today`}
      </span>
    </Row>
  )
}

/** A story waiting its turn in the hero slot: enough to decide whether it
 * is the one you came for, and its top forecast's price. */
function Tile(props: {
  pick: NewsSpotlight
  contractsById: Record<string, Contract>
  onSelect: () => void
}) {
  const { pick, contractsById, onSelect } = props
  const { story } = pick
  const headline = story.article?.title ?? story.headline
  const outlet = story.article?.publisher ?? story.sources[0]?.name ?? 'News'
  const featured = story.featuredId
    ? contractsById[story.featuredId]
    : undefined
  const count = story.contractIds.length
  return (
    <button
      type="button"
      onClick={onSelect}
      className={clsx(
        'bg-canvas-0 border-ink-200 hover:border-primary-400 hover:bg-primary-50',
        'focus-visible:ring-primary-300 group flex min-w-0 flex-col rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2'
      )}
    >
      <Row className="text-ink-500 w-full items-center gap-2 text-[11px]">
        <CategoryChip category={story.category} />
        <RelativeTimestamp
          time={story.updatedTime}
          shortened
          className="text-ink-400 ml-auto"
        />
      </Row>
      <span
        className="text-ink-900 group-hover:text-primary-800 mt-1.5 line-clamp-2 text-sm font-semibold leading-snug"
        title={headline}
      >
        {headline}
      </span>
      <Row className="text-ink-500 mt-auto w-full items-center justify-between gap-2 pt-1.5 text-xs">
        <span className="truncate">{outlet}</span>
        {featured ? (
          <Price contract={featured} size="sm" />
        ) : (
          <span className="shrink-0">
            {count} {count === 1 ? 'forecast' : 'forecasts'}
          </span>
        )}
      </Row>
    </button>
  )
}
