import {
  ExternalLinkIcon,
  HeartIcon as HeartOutline,
} from '@heroicons/react/outline'
import {
  ChevronDownIcon,
  HeartIcon as HeartSolid,
} from '@heroicons/react/solid'
import clsx from 'clsx'
import Link from 'next/link'
import { useState } from 'react'
import { uniq } from 'lodash'
import { Contract } from 'common/contract'
import {
  NEWS_CATEGORIES,
  NewsClaim,
  NewsSourceLink,
  NewsStory,
  wikiCurrentEventsUrl,
} from 'common/news-feed'
import { removeEmojis } from 'common/util/string'
import { DAY_MS } from 'common/util/time'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { LinkFavicon } from 'web/components/widgets/site-link'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'
import { ContextPanel } from './context-panel'
import { CreateFromClaimModal, SimulatedMarket } from './create-from-claim'
import { trackNews } from './news-events'
import { formatClose, namesDeadline, Price } from './news-market-row'

/**
 * One story, folded: the article (headline, picture, outlet, time), which
 * opens the publisher, and below it a separate Manifold bar, which opens
 * the forecasts and claims in place. The bar can carry one featured market
 * when one stands out; it sits in the bar, labelled, so it never reads as
 * the article's subtitle.
 */
export function StoryCard(props: {
  story: NewsStory
  contractsById: Record<string, Contract>
  storyCounts: Record<string, number>
  /** The top story: bigger headline and picture. */
  hero?: boolean
  className?: string
  /** False when the server reads no articles: the panel has no claims. */
  claimsEnabled?: boolean
  /** Arrived while the reader was here. */
  isNew?: boolean
  likeCount?: number
  liked?: boolean
  onLike?: (liked: boolean) => void
  open: boolean
  onToggle: () => void
  /** Markets the reader published from this story's claims. */
  published: SimulatedMarket[]
  onPublished: (market: SimulatedMarket) => void
  /** A reader linked an existing market; refetch. */
  onAttached: () => void
  /** The reader is leaving for the publisher; remember their place. */
  onLeave?: () => void
}) {
  const {
    story,
    contractsById,
    storyCounts,
    hero,
    className,
    claimsEnabled,
    isNew,
    likeCount = 0,
    liked = false,
    onLike,
    open,
    onToggle,
    published,
    onPublished,
    onAttached,
    onLeave,
  } = props
  const [creating, setCreating] = useState<NewsClaim>()
  const lead = leadOf(story)
  const others = otherOutlets(story.sources, lead)
  const panelId = `story-panel-${story.id}`

  const claims = story.claims ?? []
  const direct = new Set(claims.flatMap((c) => (c.matchId ? [c.matchId] : [])))
  const marketCount = uniq([
    ...story.contractIds,
    ...(story.readerContractIds ?? []),
  ]).filter((id) => contractsById[id] && !direct.has(id)).length
  const claimCount = claims.length
  const hasContext = marketCount > 0 || claimCount > 0
  const featured = story.featuredId
    ? contractsById[story.featuredId]
    : undefined

  const leave = () => {
    trackNews('news headline click', {
      storyId: story.id,
      publisher: lead.publisher,
      expanded: open,
    })
    onLeave?.()
  }

  return (
    <article
      data-story-id={story.id}
      className={clsx(
        'bg-canvas-0 border-ink-200 rounded-lg border transition-shadow',
        isNew && 'ring-primary-300 ring-2',
        hero && 'shadow-sm',
        className
      )}
    >
      <div className={clsx('px-4 pb-3 pt-3', hero && 'sm:px-5 sm:pt-4')}>
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

        <div className="mt-1.5 flex gap-3 sm:gap-4">
          <Col className="min-w-0 flex-1 gap-1.5">
            <a
              href={lead.url}
              target="_blank"
              rel="noreferrer"
              onClick={leave}
              className={clsx(
                'text-ink-1000 hover:text-primary-700 group font-bold leading-snug',
                hero ? 'text-xl sm:text-2xl' : 'text-base sm:text-lg'
              )}
            >
              {lead.title}
              <ExternalLinkIcon
                aria-label="(opens the publisher)"
                className="text-ink-400 ml-1 inline h-3.5 w-3.5 align-baseline sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100"
              />
            </a>
            <Outlets
              lead={lead}
              others={others}
              onLeave={leave}
              credit={
                story.origin === 'wikipedia'
                  ? wikiCurrentEventsUrl(story.publishedTime)
                  : undefined
              }
            />
          </Col>
          {story.image && (
            <a
              href={lead.url}
              target="_blank"
              rel="noreferrer"
              onClick={leave}
              tabIndex={-1}
              aria-hidden
              className="shrink-0"
            >
              <img
                src={story.image}
                alt=""
                referrerPolicy="no-referrer"
                loading="lazy"
                className={clsx(
                  'bg-canvas-50 rounded-md object-cover',
                  hero
                    ? 'h-20 w-24 sm:h-32 sm:w-48'
                    : 'h-16 w-16 sm:h-20 sm:w-28'
                )}
                onError={(e) => {
                  ;(
                    e.currentTarget.parentElement as HTMLElement
                  ).style.display = 'none'
                }}
              />
            </a>
          )}
        </div>
      </div>

      {hasContext ? (
        <ContextBar
          featured={featured}
          marketCount={marketCount}
          claimCount={claimCount}
          open={open}
          panelId={panelId}
          onToggle={onToggle}
        />
      ) : (
        <Row className="border-ink-100 bg-canvas-50 text-ink-500 items-center justify-between gap-2 rounded-b-lg border-t px-4 py-2.5 text-xs">
          <span>No markets on this story yet.</span>
          <Link
            href={createMarketHref(story)}
            className="hover:text-primary-700 font-medium"
          >
            Ask a question
          </Link>
        </Row>
      )}

      {open && hasContext && (
        <ContextPanel
          id={panelId}
          story={story}
          contractsById={contractsById}
          storyCounts={storyCounts}
          published={published}
          onCreate={(claim) => {
            trackNews('news create start', {
              storyId: story.id,
              claimId: claim.id,
            })
            setCreating(claim)
          }}
          createHref={createMarketHref(story)}
          claimsEnabled={claimsEnabled}
        />
      )}

      {creating && story.article && creating.draft && (
        <CreateFromClaimModal
          open
          setOpen={(o) => !o && setCreating(undefined)}
          storyId={story.id}
          article={story.article}
          claim={creating}
          draft={creating.draft}
          contractsById={contractsById}
          onPublished={onPublished}
          onAttached={onAttached}
        />
      )}
    </article>
  )
}

/** The control that opens Manifold's context, apart from the article. */
function ContextBar(props: {
  featured?: Contract
  marketCount: number
  claimCount: number
  open: boolean
  panelId: string
  onToggle: () => void
}) {
  const { featured, marketCount, claimCount, open, panelId, onToggle } = props
  const counts = [
    marketCount > 0 &&
      `${marketCount} ${marketCount === 1 ? 'forecast' : 'forecasts'}`,
    claimCount > 0 && `${claimCount} ${claimCount === 1 ? 'claim' : 'claims'}`,
  ]
    .filter(Boolean)
    .join(' · ')
  const chevron = (
    <ChevronDownIcon
      className={clsx(
        'text-ink-400 h-5 w-5 shrink-0 transition-transform',
        open && 'rotate-180'
      )}
    />
  )
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={panelId}
      onClick={onToggle}
      className={clsx(
        'border-ink-100 bg-canvas-50 hover:bg-canvas-100 flex w-full flex-col gap-1 border-t px-4 py-2.5 text-left transition-colors',
        !open && 'rounded-b-lg'
      )}
    >
      {/* Open, the featured market leads the list below; don't repeat it. */}
      {featured && !open ? (
        <>
          <Row className="w-full items-center justify-between gap-2">
            <span className="text-primary-700 text-[10px] font-bold uppercase tracking-wider">
              Top forecast
            </span>
            <Row className="text-ink-500 items-center gap-1 text-xs">
              {counts}
              {chevron}
            </Row>
          </Row>
          <Row className="w-full items-center gap-3">
            <span className="text-ink-800 line-clamp-2 min-w-0 flex-1 text-sm leading-snug">
              {removeEmojis(featured.question)}
              {!namesDeadline(featured.question) && featured.closeTime && (
                <span className="text-ink-500">
                  {' '}
                  · closes {formatClose(featured.closeTime)}
                </span>
              )}
            </span>
            <div className="shrink-0">
              <Price contract={featured} size="md" />
            </div>
          </Row>
        </>
      ) : (
        <Row className="w-full items-center justify-between gap-2">
          <span className="text-ink-800 text-sm font-medium">
            {claimCount > 0
              ? 'Forecasts and claims'
              : 'Forecasts on this story'}
          </span>
          <Row className="text-ink-500 items-center gap-1 text-xs">
            {counts}
            {chevron}
          </Row>
        </Row>
      )}
    </button>
  )
}

type Lead = { url: string; title: string; publisher: string; site: string }

/** The article the card leads with: the one we read for claims when there
 * is one, else the story's first outlet. */
const leadOf = (story: NewsStory): Lead => {
  if (story.article)
    return {
      url: story.article.url,
      title: story.article.title,
      publisher: story.article.publisher,
      site: story.article.site,
    }
  const first = story.sources[0]
  return {
    url: first?.url ?? '#',
    title: story.headline,
    publisher: first?.name ?? 'News',
    site: first?.site ?? first?.url ?? '',
  }
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

const otherOutlets = (sources: NewsSourceLink[], lead: Lead) =>
  sources.filter(
    (s) =>
      s.name !== lead.publisher &&
      hostOf(s.site ?? s.url) !== hostOf(lead.site || lead.url)
  )

/** The lead outlet, and the rest folded behind a count. */
function Outlets(props: {
  lead: Lead
  others: NewsSourceLink[]
  onLeave: () => void
  /** The Wikipedia portal page the summary is from (CC BY-SA). */
  credit?: string
}) {
  const { lead, others, onLeave, credit } = props
  const [expanded, setExpanded] = useState(false)
  return (
    <Row className="text-ink-500 flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
      <a
        href={lead.url}
        target="_blank"
        rel="noreferrer"
        onClick={onLeave}
        className="text-ink-700 hover:text-primary-700 inline-flex items-center whitespace-nowrap font-medium"
      >
        {lead.site && <LinkFavicon href={lead.site} />}
        {lead.publisher}
      </a>
      {others.length > 0 &&
        (expanded ? (
          others.map((s) => (
            <a
              key={s.url}
              href={s.url}
              target="_blank"
              rel="noreferrer"
              onClick={onLeave}
              className="hover:text-primary-700 inline-flex items-center whitespace-nowrap"
            >
              {(s.site || !/news\.google\.com/.test(s.url)) && (
                <LinkFavicon href={s.site ?? s.url} />
              )}
              {s.name}
            </a>
          ))
        ) : (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="hover:text-ink-700"
          >
            +{others.length} {others.length === 1 ? 'outlet' : 'outlets'}
          </button>
        ))}
      {credit && (
        <a
          href={credit}
          target="_blank"
          rel="noreferrer"
          className="text-ink-400 hover:text-primary-700 whitespace-nowrap"
          title="Summary from Wikipedia's Current Events portal, CC BY-SA 4.0"
        >
          via Wikipedia · CC BY-SA
        </a>
      )}
    </Row>
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

// /create reads its prefill from a JSON `params` query value (as the sports
// page does). The question starts as the headline for the creator to turn
// into a forecastable one.
export function createMarketHref(story: NewsStory) {
  const params = {
    q: story.article?.title ?? story.headline,
    closeTime: Date.now() + 30 * DAY_MS,
    visibility: 'public',
    rand: story.id.slice(0, 6),
  }
  return `/create?params=${encodeURIComponent(JSON.stringify(params))}`
}

export function StoryCardSkeleton(props: { hero?: boolean }) {
  return (
    <div className="bg-canvas-0 border-ink-200 animate-pulse rounded-lg border">
      <div className="flex gap-4 px-4 pb-3 pt-3">
        <div className="flex-1">
          <div className="bg-ink-100 h-4 w-24 rounded-full" />
          <div
            className={clsx(
              'bg-ink-100 mt-3 rounded',
              props.hero ? 'h-7 w-5/6' : 'h-5 w-3/4'
            )}
          />
          <div className="bg-ink-100 mt-2 h-5 w-1/2 rounded" />
          <div className="bg-ink-100 mt-3 h-3 w-32 rounded" />
        </div>
        <div className="bg-ink-100 h-16 w-16 shrink-0 rounded-md sm:h-20 sm:w-28" />
      </div>
      <div className="border-ink-100 bg-canvas-50 rounded-b-lg border-t px-4 py-3">
        <div className="bg-ink-100 h-4 w-48 rounded" />
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
