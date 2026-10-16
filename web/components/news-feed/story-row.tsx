import { PlusIcon } from '@heroicons/react/outline'
import { ChevronDownIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import Link from 'next/link'
import { useState } from 'react'
import { Contract } from 'common/contract'
import { NEWS_CATEGORIES, NewsSourceLink, NewsStory } from 'common/news-feed'
import { removeEmojis } from 'common/util/string'
import { DAY_MS, HOUR_MS, MINUTE_MS } from 'common/util/time'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { RelatedMarketRow } from 'web/components/sports/game-related-markets'
import { LinkFavicon } from 'web/components/widgets/site-link'
import { track } from 'web/lib/service/analytics'

const INITIAL_ROWS = 3
const SOURCES_SHOWN = 6

/** "14m", "3h", "2d" since the story's latest coverage. */
export function ageLabel(time: number, now = Date.now()) {
  const diff = Math.max(0, now - time)
  if (diff < HOUR_MS) return `${Math.max(1, Math.round(diff / MINUTE_MS))}m`
  if (diff < DAY_MS) return `${Math.round(diff / HOUR_MS)}h`
  return `${Math.round(diff / DAY_MS)}d`
}

const categoryLabel = (key: NewsStory['category']) =>
  NEWS_CATEGORIES.find((c) => c.key === key)?.label ?? 'News'

/** The price on the row: the strongest market's chance, or its leading answer. */
function topPrice(contract: Contract | undefined) {
  if (!contract) return undefined
  if (
    contract.outcomeType === 'BINARY' &&
    'prob' in contract &&
    Number.isFinite(contract.prob)
  ) {
    return { pct: Math.round(contract.prob * 100) }
  }
  if (
    'answers' in contract &&
    Array.isArray(contract.answers) &&
    contract.answers.length > 0
  ) {
    const top = [...contract.answers].sort((a, b) => b.prob - a.prob)[0]
    return { pct: Math.round(top.prob * 100), label: top.text }
  }
  return undefined
}

/**
 * One story in the feed, modelled on the sports rows: when and what on the
 * left, the headline and its strongest market in the middle, the price on
 * the right. The row opens to the outlets and every market on the story.
 */
export function StoryRow(props: {
  story: NewsStory
  contractsById: Record<string, Contract>
  /** Arrived since the page loaded. */
  isNew?: boolean
  defaultOpen?: boolean
}) {
  const { story, contractsById, isNew, defaultOpen } = props
  const [open, setOpen] = useState(!!defaultOpen)
  const [showAll, setShowAll] = useState(false)
  const contracts = story.contractIds
    .map((id) => contractsById[id])
    .filter((c): c is Contract => !!c)
  const top = contracts[0]
  const price = topPrice(top)
  const visible = showAll ? contracts : contracts.slice(0, INITIAL_ROWS)
  const hidden = contracts.length - visible.length

  const toggle = () => {
    track('news feed toggle story', { storyId: story.id, open: !open })
    setOpen((o) => !o)
  }

  return (
    <div className={clsx(isNew && 'bg-primary-50 dark:bg-primary-900/10')}>
      {/* The header is the toggle; everything inside the panel keeps its own
          clicks (bet buttons, links). */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggle()
          }
        }}
        className={clsx(
          'hover:bg-canvas-50 grid cursor-pointer grid-cols-[3.25rem_minmax(0,1fr)_auto] items-start gap-x-2 px-2 py-2.5 transition-colors sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:gap-x-3 sm:px-3',
          open && 'bg-canvas-50'
        )}
      >
        <Col className="items-start gap-0.5 pt-0.5">
          <span className="text-ink-900 text-sm font-medium tabular-nums">
            {ageLabel(story.updatedTime)}
          </span>
          <span className="text-ink-400 text-[10px] font-semibold uppercase tracking-wide">
            {categoryLabel(story.category)}
          </span>
          {isNew && (
            <span className="text-primary-700 text-[10px] font-semibold uppercase tracking-wide">
              New
            </span>
          )}
        </Col>
        <Col className="min-w-0 gap-1">
          <span
            className={clsx(
              'text-ink-900 text-sm font-medium leading-snug',
              !open && 'line-clamp-2'
            )}
          >
            {story.headline}
          </span>
          {top ? (
            <span className="text-ink-500 truncate text-xs">
              {removeEmojis(top.question)}
              {price?.label && (
                <span className="text-ink-700"> · {price.label}</span>
              )}
              {contracts.length > 1 && (
                <span className="text-ink-400">
                  {' '}
                  · +{contracts.length - 1} more
                </span>
              )}
            </span>
          ) : (
            <span className="text-ink-400 truncate text-xs">
              {story.sources
                .slice(0, 3)
                .map((s) => s.name)
                .join(' · ')}
            </span>
          )}
        </Col>
        <Col className="items-end gap-1 self-start">
          {price ? (
            <span
              className="bg-primary-50 text-primary-800 w-14 rounded-md py-1 text-center text-sm font-semibold tabular-nums sm:w-16"
              title={price.label}
            >
              {price.pct}%
            </span>
          ) : (
            <span className="text-ink-400 py-1 text-[11px]">no market</span>
          )}
          <Row className="items-center gap-0.5">
            {contracts.length > 0 && (
              <span className="text-ink-500 text-[11px] tabular-nums">
                {contracts.length}{' '}
                <span className="hidden sm:inline">
                  {contracts.length === 1 ? 'market' : 'markets'}
                </span>
              </span>
            )}
            <ChevronDownIcon
              className={clsx(
                'text-ink-400 h-4 w-4 transition-transform',
                open && 'rotate-180'
              )}
            />
          </Row>
        </Col>
      </div>

      {open && (
        <div className="border-ink-100 bg-canvas-50 border-t px-3 py-2.5">
          {story.summary && story.summary !== story.headline && (
            <p className="text-ink-600 mb-2 text-sm leading-relaxed">
              {story.summary}
            </p>
          )}
          <SourcesRow sources={story.sources} />
          <Row className="mt-2.5 items-center justify-between gap-2">
            <span className="text-ink-600 text-xs font-medium">
              Markets on this story
              <span className="text-ink-400 font-normal">
                {' · '}
                {contracts.length > 0 ? contracts.length : 'none yet'}
              </span>
            </span>
            <Link
              href={createMarketHref(story)}
              onClick={() =>
                track('news feed create market', { storyId: story.id })
              }
              className="text-ink-500 hover:text-primary-700 flex items-center gap-1 text-xs font-medium"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add a market
            </Link>
          </Row>
          {contracts.length > 0 && (
            <Col className="divide-ink-100 border-ink-200 bg-canvas-0 mt-2 divide-y rounded-md border">
              {visible.map((c) => (
                <RelatedMarketRow key={c.id} contract={c} />
              ))}
              {hidden > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="text-primary-700 hover:bg-canvas-50 w-full px-2.5 py-1.5 text-left text-xs font-medium"
                >
                  Show {hidden} more
                </button>
              )}
            </Col>
          )}
        </div>
      )}
    </div>
  )
}

/** Who is reporting it, each a link out. */
function SourcesRow(props: { sources: NewsSourceLink[] }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? props.sources : props.sources.slice(0, SOURCES_SHOWN)
  const more = props.sources.length - shown.length
  if (props.sources.length === 0) return null
  return (
    <Row className="flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span className="text-ink-400">Read at</span>
      {shown.map((s) => (
        <a
          key={s.url}
          href={s.url}
          target="_blank"
          rel="noreferrer"
          onClick={() => track('news feed open story', { url: s.url })}
          className="text-ink-600 hover:text-primary-700 inline-flex items-center whitespace-nowrap font-medium"
        >
          {/* Aggregator redirects would show the aggregator's icon. */}
          {(s.site || !/news\.google\.com/.test(s.url)) && (
            <LinkFavicon href={s.site ?? s.url} />
          )}
          {s.name}
        </a>
      ))}
      {more > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-ink-400 hover:text-ink-600"
        >
          +{more} more
        </button>
      )}
    </Row>
  )
}

// /create reads its prefill from a JSON `params` query value (as the sports
// page does). The question starts as the headline for the creator to turn
// into a forecastable one.
function createMarketHref(story: NewsStory) {
  const params = {
    q: story.headline,
    closeTime: Date.now() + 30 * DAY_MS,
    visibility: 'public',
    rand: story.id.slice(0, 6),
  }
  return `/create?params=${encodeURIComponent(JSON.stringify(params))}`
}

export function StoryRowSkeleton() {
  return (
    <div className="animate-pulse px-3 py-2.5">
      <div className="grid grid-cols-[4rem_minmax(0,1fr)_4rem] gap-3">
        <div className="bg-ink-100 h-4 w-8 rounded" />
        <Col className="gap-2">
          <div className="bg-ink-100 h-4 w-5/6 rounded" />
          <div className="bg-ink-100 h-3 w-1/2 rounded" />
        </Col>
        <div className="bg-ink-100 ml-auto h-6 w-12 rounded-md" />
      </div>
    </div>
  )
}
