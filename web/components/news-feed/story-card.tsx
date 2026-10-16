import { HeartIcon as HeartOutline, PlusIcon } from '@heroicons/react/outline'
import {
  ChevronDownIcon,
  HeartIcon as HeartSolid,
} from '@heroicons/react/solid'
import clsx from 'clsx'
import Link from 'next/link'
import { useState } from 'react'
import { Contract } from 'common/contract'
import { NEWS_CATEGORIES, NewsSourceLink, NewsStory } from 'common/news-feed'
import { DAY_MS } from 'common/util/time'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { RelatedMarketRow } from 'web/components/sports/game-related-markets'
import { LinkFavicon } from 'web/components/widgets/site-link'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'

const ROWS = 3
const HERO_ROWS = 4
const SOURCES_SHOWN = 5

/** One story: what happened, who is reporting it, and the markets it moves. */
export function StoryCard(props: {
  story: NewsStory
  contractsById: Record<string, Contract>
  /** The top story: bigger headline, more rows. */
  hero?: boolean
  /** Arrived since the page loaded. */
  isNew?: boolean
  likeCount?: number
  liked?: boolean
  onLike?: (liked: boolean) => void
  /** Start with the markets open (the top story). */
  defaultOpen?: boolean
}) {
  const {
    story,
    contractsById,
    hero,
    isNew,
    likeCount = 0,
    liked = false,
    onLike,
    defaultOpen,
  } = props
  const [open, setOpen] = useState(!!defaultOpen)
  const [showAll, setShowAll] = useState(false)
  const contracts = story.contractIds
    .map((id) => contractsById[id])
    .filter((c): c is Contract => !!c)
  const hasMarkets = contracts.length > 0
  const toggle = () => {
    track('news feed toggle markets', { storyId: story.id, open: !open })
    setOpen((o) => !o)
  }
  const visible = showAll
    ? contracts
    : contracts.slice(0, hero ? HERO_ROWS : ROWS)
  const hidden = contracts.length - visible.length
  const primary = story.sources[0]
  const showSummary = !!story.summary && story.summary !== story.headline

  return (
    <article
      className={clsx(
        'bg-canvas-0 border-ink-200 rounded-lg border transition-shadow',
        isNew && 'ring-primary-300 ring-2',
        hero && 'shadow-sm'
      )}
    >
      <div
        className={clsx('px-4 pt-3', hero ? 'pb-3 sm:px-5 sm:pt-4' : 'pb-2.5')}
      >
        <Row className="text-ink-500 items-center gap-2 text-xs">
          <CategoryChip category={story.category} />
          {story.topic && (
            <span className="min-w-0 truncate" title={story.topic}>
              {story.topic}
            </span>
          )}
          <Row className="ml-auto shrink-0 items-center gap-2 whitespace-nowrap">
            {isNew && (
              <span className="bg-primary-100 text-primary-700 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                New
              </span>
            )}
            <RelativeTimestamp
              time={story.updatedTime}
              shortened
              className="text-ink-500"
            />
            <LikeButton count={likeCount} liked={liked} onToggle={onLike} />
          </Row>
        </Row>

        <div className="mt-1.5 flex gap-4">
          <Col className="min-w-0 flex-1 gap-1.5">
            <a
              href={primary?.url}
              target="_blank"
              rel="noreferrer"
              onClick={() =>
                track('news feed open story', { storyId: story.id })
              }
              className={clsx(
                'text-ink-1000 hover:text-primary-700 font-bold leading-snug',
                hero ? 'text-xl sm:text-2xl' : 'text-base sm:text-lg'
              )}
            >
              {story.headline}
            </a>
            {showSummary && (
              <p
                className={clsx(
                  'text-ink-600 text-sm leading-relaxed',
                  !hero && 'line-clamp-3'
                )}
              >
                {story.summary}
              </p>
            )}
            <SourcesRow sources={story.sources} />
          </Col>
          {story.image && (
            <img
              src={story.image}
              alt=""
              referrerPolicy="no-referrer"
              loading="lazy"
              className={clsx(
                'hidden shrink-0 rounded-md object-cover sm:block',
                hero ? 'h-36 w-56' : 'h-24 w-36'
              )}
              onError={(e) => {
                ;(e.currentTarget as HTMLImageElement).style.display = 'none'
              }}
            />
          )}
        </div>
      </div>

      {/* The markets sit under the story, folded away until asked for. The
          bar is the toggle; the link on its right keeps its own click. */}
      <div className="border-ink-100 bg-canvas-50 rounded-b-lg border-t">
        <div
          role={hasMarkets ? 'button' : undefined}
          tabIndex={hasMarkets ? 0 : undefined}
          aria-expanded={hasMarkets ? open : undefined}
          onClick={hasMarkets ? toggle : undefined}
          onKeyDown={(e) => {
            if (hasMarkets && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault()
              toggle()
            }
          }}
          className={clsx(
            'flex items-center justify-between gap-2 rounded-b-lg px-3 py-2.5',
            hasMarkets && 'hover:bg-canvas-100 cursor-pointer select-none',
            open && 'rounded-b-none'
          )}
        >
          <span className="text-ink-600 flex items-center gap-1 text-xs font-medium">
            {hasMarkets && (
              <ChevronDownIcon
                className={clsx(
                  'text-ink-400 h-4 w-4 transition-transform',
                  open && 'rotate-180'
                )}
              />
            )}
            Markets on this story
            <span className="text-ink-400 font-normal">
              {' · '}
              {hasMarkets ? contracts.length : 'none yet'}
            </span>
          </span>
          <Link
            href={createMarketHref(story)}
            onClick={(e) => {
              e.stopPropagation()
              track('news feed create market', { storyId: story.id })
            }}
            className="text-ink-500 hover:text-primary-700 flex items-center gap-1 text-xs font-medium"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Add a market
          </Link>
        </div>
        {open && hasMarkets && (
          <div className="px-3 pb-2.5">
            <Col className="divide-ink-100 border-ink-200 bg-canvas-0 divide-y rounded-md border">
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
          </div>
        )}
      </div>
    </article>
  )
}

export function CategoryChip(props: { category: NewsStory['category'] }) {
  const cat = NEWS_CATEGORIES.find((c) => c.key === props.category)
  return (
    <span className="bg-ink-100 text-ink-700 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold">
      {cat ? `${cat.emoji} ${cat.label}` : 'News'}
    </span>
  )
}

function SourcesRow(props: { sources: NewsSourceLink[] }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? props.sources : props.sources.slice(0, SOURCES_SHOWN)
  const more = props.sources.length - shown.length
  if (props.sources.length === 0) return null
  return (
    <Row className="flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {shown.map((s) => (
        <a
          key={s.url}
          href={s.url}
          target="_blank"
          rel="noreferrer"
          className="text-ink-500 hover:text-primary-700 inline-flex items-center whitespace-nowrap"
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

export function StoryCardSkeleton(props: { hero?: boolean }) {
  return (
    <div className="bg-canvas-0 border-ink-200 animate-pulse rounded-lg border">
      <div className="px-4 pb-3 pt-3">
        <div className="bg-ink-100 h-4 w-24 rounded-full" />
        <div
          className={clsx(
            'bg-ink-100 mt-3 rounded',
            props.hero ? 'h-7 w-5/6' : 'h-5 w-3/4'
          )}
        />
        <div className="bg-ink-100 mt-2 h-4 w-full rounded" />
        <div className="bg-ink-100 mt-1.5 h-4 w-2/3 rounded" />
        <div className="bg-ink-100 mt-3 h-3 w-40 rounded" />
      </div>
      <div className="border-ink-100 bg-canvas-50 rounded-b-lg border-t px-3 py-2.5">
        <div className="bg-ink-100 h-9 w-full rounded-md" />
      </div>
    </div>
  )
}

/** A like for the story itself, kept by the feed server. */
function LikeButton(props: {
  count: number
  liked: boolean
  onToggle?: (liked: boolean) => void
}) {
  const { count, liked, onToggle } = props
  const user = useUser()
  const Icon = liked ? HeartSolid : HeartOutline
  return (
    <button
      type="button"
      aria-pressed={liked}
      aria-label={liked ? 'Unlike this story' : 'Like this story'}
      onClick={() => {
        if (!user) {
          firebaseLogin()
          return
        }
        onToggle?.(!liked)
      }}
      className={clsx(
        'flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs transition-colors',
        liked
          ? 'text-scarlet-600 hover:bg-scarlet-50'
          : 'text-ink-400 hover:bg-canvas-100 hover:text-scarlet-600'
      )}
    >
      <Icon className="h-4 w-4" />
      {count > 0 && <span className="tabular-nums">{count}</span>}
    </button>
  )
}
