import { ArrowUpIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { sum } from 'lodash'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Contract } from 'common/contract'
import {
  NEWS_SORTS,
  NewsCategory,
  NewsSort,
  NewsSpotlight,
  NewsStory,
} from 'common/news-feed'
import { shortFormatNumber } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { SEO } from 'web/components/SEO'
import { Carousel } from 'web/components/widgets/carousel'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'
import { CategoryRail } from './category-rail'
import type { SimulatedMarket } from './create-from-claim'
import {
  useScrollAnchor,
  useSessionState,
  useStableOrder,
} from './feed-view-state'
import { trackNews } from './news-events'
import { StoryCard, StoryCardSkeleton } from './story-card'

const PAGE_SIZE = 40
/** The schema's ceiling for one request. */
const MAX_LIMIT = 200
const POLL_MS = 60_000
const BUILDING_POLL_MS = 8_000
const NEW_HIGHLIGHT_MS = 45_000

type LikeState = { liked: boolean; count: number }

type View = {
  categories: NewsCategory[]
  sort: NewsSort
  includeUnlinked: boolean
  limit: number
}

const DEFAULT_VIEW: View = {
  categories: [],
  sort: 'newest',
  includeUnlinked: false,
  limit: PAGE_SIZE,
}

/**
 * /news: the wire with markets. Newest first by default, with the day's top
 * story leading. Each card is the article plus a bar that opens Manifold's
 * context for it: the related outlook, and the claims quoted from the
 * article with the markets that test them.
 *
 * The page keeps the reader's place: the view, open panels and published
 * markets live in session storage, stories hold their order while the
 * reader is here, and new ones wait behind a button.
 */
export function NewsFeedPage() {
  const user = useUser()
  const [view, setView, viewReady] = useSessionState<View>('view', DEFAULT_VIEW)
  const { categories, sort, includeUnlinked, limit } = view
  const [expanded, setExpanded] = useSessionState<Record<string, boolean>>(
    'expanded',
    {}
  )
  const [published, setPublished] = useSessionState<SimulatedMarket[]>(
    'published',
    []
  )

  const props = useMemo(
    () => ({
      categories: categories.length > 0 ? categories : undefined,
      sort,
      limit,
      includeUnlinked,
    }),
    [categories, sort, limit, includeUnlinked]
  )
  // Wait for the stored view so the first request is the right one.
  const { data, error, refresh } = useAPIGetter(
    'get-news-feed',
    viewReady ? props : undefined,
    undefined,
    'news-feed'
  )
  const building = !data || (data.refreshing && data.stories.length === 0)

  // Poll while the tab is visible; faster while the first build is running.
  const visible = useIsPageVisible()
  useEffect(() => {
    if (!visible || !viewReady) return
    const id = setInterval(
      () => refresh(),
      building ? BUILDING_POLL_MS : POLL_MS
    )
    return () => clearInterval(id)
  }, [visible, building, props, viewReady])

  // Likes: the server's counts, with the reader's own taps applied at once.
  const [likeOverrides, setLikeOverrides] = useState<Record<string, LikeState>>(
    {}
  )
  useEffect(() => setLikeOverrides({}), [data])
  const likeState = (storyId: string): LikeState =>
    likeOverrides[storyId] ?? {
      liked: data?.likedStoryIds.includes(storyId) ?? false,
      count: data?.likes[storyId] ?? 0,
    }
  const onLike = async (story: NewsStory, liked: boolean) => {
    const before = likeState(story.id)
    setLikeOverrides((o) => ({
      ...o,
      [story.id]: {
        liked,
        count: Math.max(0, before.count + (liked ? 1 : -1)),
      },
    }))
    track('news feed like story', { storyId: story.id, liked })
    try {
      const { likeCount } = await api('like-news-story', {
        storyId: story.id,
        liked,
      })
      setLikeOverrides((o) => ({
        ...o,
        [story.id]: { liked, count: likeCount },
      }))
    } catch (e) {
      console.error(e)
      setLikeOverrides((o) => ({ ...o, [story.id]: before }))
    }
  }

  // Stories held on screen can drop out of the latest response; keep the
  // markets they show, with the freshest copy of each.
  const seenContracts = useRef(new Map<string, Contract>())
  const contractsById = useMemo(() => {
    for (const c of data?.contracts ?? []) seenContracts.current.set(c.id, c)
    return Object.fromEntries(seenContracts.current) as Record<string, Contract>
  }, [data?.contracts])
  const storyCounts = data?.storyCounts ?? {}
  // The top stories hold still too: a new set waits with the new stories.
  const showTop = categories.length === 0 && !includeUnlinked
  const topRef = useRef<NewsSpotlight[]>()
  const idsOf = (top: NewsSpotlight[]) => top.map((t) => t.story.id).join()
  if (
    data?.topStories &&
    (!topRef.current?.length ||
      idsOf(topRef.current) === idsOf(data.topStories))
  )
    topRef.current = data.topStories
  const top = showTop ? topRef.current ?? [] : []
  const topKey = idsOf(top)
  const hero = top[0]
  const minis = top.slice(1)

  const viewKey = JSON.stringify([
    [...categories].sort(),
    sort,
    includeUnlinked,
  ])
  const dataViewKey = data?.view
    ? JSON.stringify([
        [...data.view.categories].sort(),
        data.view.sort,
        data.view.includeUnlinked,
      ])
    : undefined
  const loadingView = !!data && dataViewKey !== viewKey

  // The top stories lead the page; they are not repeated in the list below.
  const listed = useMemo(() => {
    if (loadingView) return undefined
    const topIds = new Set(topKey.split(',').filter(Boolean))
    return data?.stories.filter((s) => !topIds.has(s.id))
  }, [data?.stories, topKey, loadingView])
  const order = useStableOrder(listed, viewKey)
  const topIds = new Set(topKey.split(',').filter(Boolean))
  const stories = order.visible.filter((s) => !topIds.has(s.id))
  const pending = order.pending

  const [fresh, setFresh] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    if (fresh.size === 0) return
    const t = setTimeout(() => setFresh(new Set()), NEW_HIGHLIGHT_MS)
    return () => clearTimeout(t)
  }, [fresh])
  const pendingCount = pending.length
  useEffect(() => {
    if (pendingCount > 0) trackNews('news new stories shown', { pendingCount })
  }, [pendingCount > 0])
  const showNewStories = () => {
    trackNews('news new stories show', { pendingCount })
    setFresh(new Set(pending.map((s) => s.id)))
    // The new top stories lead; take them out of the list order explicitly.
    topRef.current = data?.topStories
    const nextTop = new Set(
      showTop ? (data?.topStories ?? []).map((t) => t.story.id) : []
    )
    order.showPending(
      (data?.stories ?? []).filter((s) => !nextTop.has(s.id)).map((s) => s.id)
    )
    const box = document.querySelector<HTMLElement>('.page-scroll-container')
    ;(box ?? window).scrollTo({ top: 0, behavior: 'smooth' })
  }

  const saveAnchor = useScrollAnchor(stories.map((s) => s.id))

  const hasMore =
    !!data && data.total > data.stories.length && limit < MAX_LIMIT
  const linkedCount = data
    ? sum(Object.values(data.counts).map((n) => n ?? 0))
    : 0

  const [refreshBusy, setRefreshBusy] = useState(false)
  const manualRefresh = async () => {
    setRefreshBusy(true)
    track('news feed manual refresh')
    try {
      await api('refresh-news-feed', {})
    } catch (e) {
      console.error(e)
    } finally {
      setRefreshBusy(false)
      refresh()
    }
  }

  const { data: headlines } = useAPIGetter(
    'headlines',
    {},
    undefined,
    'news-feed-headlines'
  )

  const cardProps = (s: NewsStory, position: number) => ({
    story: s,
    contractsById,
    storyCounts,
    isNew: fresh.has(s.id),
    likeCount: likeState(s.id).count,
    liked: likeState(s.id).liked,
    onLike: (liked: boolean) => onLike(s, liked),
    open: !!expanded[s.id],
    onToggle: () => {
      const open = !expanded[s.id]
      trackNews(open ? 'news panel expand' : 'news panel collapse', {
        storyId: s.id,
        position,
        featured: !!s.featuredId,
        markets: s.contractIds.length,
        claims: s.claims?.length ?? 0,
      })
      setExpanded((e) => {
        const next = { ...e }
        if (open) next[s.id] = true
        else delete next[s.id]
        return next
      })
    },
    published: published.filter((m) => m.storyId === s.id),
    onPublished: (m: SimulatedMarket) => setPublished((p) => [...p, m]),
    onAttached: () => refresh(),
    onLeave: saveAnchor,
  })

  return (
    <Page trackPageView="news feed">
      <SEO
        title="News"
        description="Every story on the wire, with the markets it moves."
        url="/news"
      />
      <Col className="w-full gap-3 px-2 pt-3 sm:px-4">
        <Row className="items-end justify-between gap-3 px-1">
          <Col className="min-w-0 gap-0.5">
            <h1 className="text-ink-1000 text-2xl font-bold tracking-tight">
              Manifold News
            </h1>
            <p className="text-ink-500 text-sm">
              Every story on the wire, with the markets it moves.
            </p>
          </Col>
          <Row className="shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setView((v) => ({
                  ...v,
                  includeUnlinked: !v.includeUnlinked,
                  limit: PAGE_SIZE,
                }))
              }
              aria-pressed={includeUnlinked}
              title="Stories without a market are hidden unless you ask for them"
              className={clsx(
                'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                includeUnlinked
                  ? 'border-ink-900 bg-ink-900 text-ink-0'
                  : 'border-ink-200 text-ink-600 hover:bg-canvas-50'
              )}
            >
              {includeUnlinked ? 'All stories' : 'With markets'}
            </button>
            <LiveBadge
              updatedTime={data?.updatedTime ?? null}
              refreshing={!!data?.refreshing}
              onRefresh={user ? manualRefresh : undefined}
              busy={refreshBusy}
            />
          </Row>
        </Row>

        <div className="bg-canvas-0 border-ink-100 sticky top-0 z-20 -mx-2 border-b px-2 sm:-mx-4 sm:px-4">
          <CategoryRail
            selected={categories}
            onToggle={(c) =>
              setView((v) => ({
                ...v,
                categories:
                  c === 'all'
                    ? []
                    : v.categories.includes(c)
                    ? v.categories.filter((k) => k !== c)
                    : [...v.categories, c],
                limit: PAGE_SIZE,
              }))
            }
            counts={data?.counts ?? {}}
          />
        </div>

        {/* Arrivals wait here rather than pushing the page down. */}
        {pendingCount > 0 && (
          <div className="sticky top-14 z-30 flex h-0 justify-center">
            <button
              type="button"
              onClick={showNewStories}
              className="bg-primary-600 hover:bg-primary-700 text-ink-0 flex h-8 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold shadow-lg transition-colors"
            >
              <ArrowUpIcon className="h-3.5 w-3.5" />
              {pendingCount} new {pendingCount === 1 ? 'story' : 'stories'}
            </button>
          </div>
        )}

        {data && !data.enabled && (
          <Notice>
            This server is not running the news feed. Start the API with{' '}
            <code>NEWS_FEED_ENABLED=true</code>.
          </Notice>
        )}
        {error && <Notice tone="error">Couldn't load the feed.</Notice>}
        {data?.lastError && (
          <Notice tone="error">Last refresh failed: {data.lastError}</Notice>
        )}

        {hero && (
          <Col className="gap-1.5">
            <TopStoriesLabel hero={hero} />
            <StoryCard {...cardProps(hero.story, 0)} hero />
            {minis.length > 0 && (
              <Carousel
                className="-mx-2 px-2 sm:-mx-4 sm:px-4"
                labelsParentClassName="gap-2 py-1"
                fadeEdges
                showArrowsOnHover
              >
                {minis.map((t, i) => (
                  <StoryCard
                    key={t.story.id}
                    {...cardProps(t.story, i + 1)}
                    mini
                    className="w-72 shrink-0 snap-start"
                  />
                ))}
              </Carousel>
            )}
          </Col>
        )}

        <Col className="gap-3">
          <Row className="items-center justify-between gap-2 px-1">
            <h2 className="text-ink-900 text-sm font-semibold">
              {sort === 'newest'
                ? 'Just in'
                : NEWS_SORTS.find((o) => o.key === sort)?.label}
            </h2>
            <SortControl
              sort={sort}
              onChange={(s) =>
                setView((v) => ({ ...v, sort: s, limit: PAGE_SIZE }))
              }
            />
          </Row>
          {(building || loadingView) && stories.length === 0 ? (
            <>
              <Notice>
                Gathering the wire and matching markets. The first build takes a
                couple of minutes; this page updates itself.
              </Notice>
              <StoryCardSkeleton hero />
              <StoryCardSkeleton />
              <StoryCardSkeleton />
            </>
          ) : stories.length === 0 ? (
            <Notice>
              No stories with a market in this section yet.{' '}
              {!includeUnlinked && (
                <button
                  type="button"
                  className="text-primary-700 underline"
                  onClick={() =>
                    setView((v) => ({ ...v, includeUnlinked: true }))
                  }
                >
                  Show unlinked stories too
                </button>
              )}
            </Notice>
          ) : (
            stories.map((s, i) => (
              <StoryCard key={s.id} {...cardProps(s, i + top.length)} />
            ))
          )}
        </Col>

        {hasMore && (
          <button
            type="button"
            onClick={() =>
              setView((v) => ({
                ...v,
                limit: Math.min(v.limit + PAGE_SIZE, MAX_LIMIT),
              }))
            }
            className="border-ink-200 text-ink-700 hover:bg-canvas-50 mx-auto rounded-full border px-4 py-1.5 text-sm font-medium"
          >
            Show more stories
          </button>
        )}

        {headlines && headlines.length > 0 && (
          <Row className="text-ink-500 flex-wrap items-center gap-x-3 gap-y-1 px-1 pt-4 text-xs">
            <span className="font-medium">Curated collections</span>
            {headlines.slice(0, 8).map((h) => (
              <Link
                key={h.id}
                href={`/news/${h.slug}`}
                className="hover:text-primary-700 underline-offset-2 hover:underline"
              >
                {h.title}
              </Link>
            ))}
          </Row>
        )}

        <p className="text-ink-400 px-1 pb-2 pt-4 text-[11px]">
          Prototype.{' '}
          {data?.config?.sources.includes('google-news')
            ? "Stories come from Wikipedia's Current Events portal (CC BY-SA) and Google News; "
            : "Stories come from Wikipedia's Current Events portal (CC BY-SA); "}
          headlines link out to the outlets. Markets are matched by embedding
          similarity against every open market and verified by an AI pass before
          they appear.{' '}
          {data?.config?.articles !== 'none' &&
            "Claims are short quotes from the article's full text (a stand-in for a licensed full-text feed), checked word for word against it. "}
          Publishing a market here is simulated.
          {linkedCount > 0 &&
            ` ${linkedCount} stories currently have a market.`}
        </p>
      </Col>
    </Page>
  )
}

/** Newest (the default), the ranking, or the readers' likes. */
function SortControl(props: {
  sort: NewsSort
  onChange: (sort: NewsSort) => void
}) {
  const { sort, onChange } = props
  return (
    <Row className="items-center gap-1" role="group" aria-label="Sort">
      {NEWS_SORTS.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={sort === o.key}
          onClick={() => {
            track('news feed sort', { sort: o.key })
            onChange(o.key)
          }}
          className={clsx(
            'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
            sort === o.key
              ? 'bg-ink-900 text-ink-0'
              : 'text-ink-600 hover:bg-canvas-50'
          )}
        >
          {o.label}
        </button>
      ))}
    </Row>
  )
}

/** The day's top stories, and why the first one leads. */
function TopStoriesLabel(props: { hero: NewsSpotlight }) {
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

function LiveBadge(props: {
  updatedTime: number | null
  refreshing: boolean
  onRefresh?: () => void
  busy?: boolean
}) {
  const { updatedTime, refreshing, onRefresh, busy } = props
  return (
    <Row className="shrink-0 items-center gap-2">
      <Row className="text-ink-600 items-center gap-1.5 text-xs">
        <span className="relative flex h-2 w-2">
          <span
            className={clsx(
              'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
              refreshing ? 'bg-amber-400' : 'bg-teal-500'
            )}
          />
          <span
            className={clsx(
              'relative inline-flex h-2 w-2 rounded-full',
              refreshing ? 'bg-amber-400' : 'bg-teal-500'
            )}
          />
        </span>
        <span className="font-medium">
          {refreshing ? 'Refreshing' : 'Live'}
        </span>
        {updatedTime && (
          <span className="text-ink-400 hidden sm:inline">
            · updated{' '}
            <RelativeTimestamp
              time={updatedTime}
              shortened
              className="text-ink-400"
            />
          </span>
        )}
      </Row>
      {onRefresh && (
        <button
          type="button"
          disabled={busy || refreshing}
          onClick={onRefresh}
          className="border-ink-200 text-ink-600 hover:bg-canvas-50 rounded-full border px-2.5 py-1 text-xs disabled:opacity-50"
        >
          Refresh
        </button>
      )}
    </Row>
  )
}

function Notice(props: { children: React.ReactNode; tone?: 'info' | 'error' }) {
  return (
    <div
      className={clsx(
        'rounded-lg border px-4 py-3 text-sm',
        props.tone === 'error'
          ? 'border-scarlet-300 bg-scarlet-50 text-scarlet-700 dark:bg-scarlet-900/20'
          : 'border-ink-200 bg-canvas-50 text-ink-600'
      )}
    >
      {props.children}
    </div>
  )
}
