import clsx from 'clsx'
import { keyBy, sum } from 'lodash'
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
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'
import { CategoryRail } from './category-rail'
import { ResolvingSoon } from './resolving-soon'
import { StoryCard, StoryCardSkeleton } from './story-card'

const PAGE_SIZE = 40
/** The schema's ceiling for one request. */
const MAX_LIMIT = 200
const POLL_MS = 60_000
const BUILDING_POLL_MS = 8_000
const NEW_HIGHLIGHT_MS = 45_000

type LikeState = { liked: boolean; count: number }

/**
 * /news: the wire with markets. Newest first by default, with the day's top
 * story leading. Stories arrive at the top as the server's refresher finds
 * them; prices on the rows update live.
 */
export function NewsFeedPage() {
  const user = useUser()
  // Empty means every category.
  const [categories, setCategories] = useState<NewsCategory[]>([])
  const [sort, setSort] = useState<NewsSort>('newest')
  const [includeUnlinked, setIncludeUnlinked] = useState(false)
  const [limit, setLimit] = useState(PAGE_SIZE)
  const props = useMemo(
    () => ({
      categories: categories.length > 0 ? categories : undefined,
      sort,
      limit,
      includeUnlinked,
    }),
    [categories, sort, limit, includeUnlinked]
  )
  const { data, error, refresh } = useAPIGetter(
    'get-news-feed',
    props,
    undefined,
    'news-feed'
  )
  const building = !data || (data.refreshing && data.stories.length === 0)

  // Poll while the tab is visible; faster while the first build is running.
  const visible = useIsPageVisible()
  useEffect(() => {
    if (!visible) return
    const id = setInterval(
      () => refresh(),
      building ? BUILDING_POLL_MS : POLL_MS
    )
    return () => clearInterval(id)
  }, [visible, building, props])

  // Stories that arrive on a poll get a short highlight. A filter change
  // shows different stories, which is not an arrival.
  const seen = useRef<Set<string>>(new Set())
  const lastPropsKey = useRef<string | undefined>(undefined)
  const [fresh, setFresh] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    if (!data) return
    const key = JSON.stringify(props)
    const ids = data.stories.map((s) => s.id)
    const isPoll = lastPropsKey.current === key && seen.current.size > 0
    lastPropsKey.current = key
    const arrived = isPoll ? ids.filter((id) => !seen.current.has(id)) : []
    ids.forEach((id) => seen.current.add(id))
    if (arrived.length === 0) return
    setFresh(new Set(arrived))
    const t = setTimeout(() => setFresh(new Set()), NEW_HIGHLIGHT_MS)
    return () => clearTimeout(t)
  }, [data])

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

  const contractsById = useMemo(
    () => keyBy(data?.contracts ?? [], 'id'),
    [data?.contracts]
  )
  const storiesByContractId = useMemo(() => {
    const byId: Record<string, NewsStory> = {}
    for (const s of data?.stories ?? [])
      for (const id of s.contractIds) if (!byId[id]) byId[id] = s
    return byId
  }, [data?.stories])
  const spotlight =
    categories.length === 0 && !includeUnlinked ? data?.spotlight : undefined
  // The top story leads the page; it is not repeated in the list below.
  const stories = (data?.stories ?? []).filter(
    (s) => s.id !== spotlight?.story.id
  )
  const hasMore =
    !!data && data.total > data.stories.length && limit < MAX_LIMIT
  const linkedCount = data
    ? sum(Object.values(data.counts).map((n) => n ?? 0))
    : 0
  const resolvingSoon = (data?.resolvingSoon ?? [])
    .map((id) => contractsById[id])
    .filter((c): c is Contract => !!c)

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

  const cardProps = (s: NewsStory) => ({
    story: s,
    contractsById,
    isNew: fresh.has(s.id),
    likeCount: likeState(s.id).count,
    liked: likeState(s.id).liked,
    onLike: (liked: boolean) => onLike(s, liked),
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
              onClick={() => setIncludeUnlinked((v) => !v)}
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
            onToggle={(c) => {
              setCategories((prev) =>
                c === 'all'
                  ? []
                  : prev.includes(c)
                  ? prev.filter((k) => k !== c)
                  : [...prev, c]
              )
              setLimit(PAGE_SIZE)
            }}
            counts={data?.counts ?? {}}
          />
        </div>

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

        {spotlight && (
          <Col className="gap-1.5">
            <SpotlightLabel spotlight={spotlight} />
            <StoryCard {...cardProps(spotlight.story)} hero defaultOpen />
          </Col>
        )}
        {categories.length === 0 && resolvingSoon.length > 0 && (
          <ResolvingSoon
            contracts={resolvingSoon}
            storiesByContractId={storiesByContractId}
          />
        )}

        <Col className="gap-3">
          <SortControl
            sort={sort}
            onChange={(s) => {
              setSort(s)
              setLimit(PAGE_SIZE)
            }}
          />
          {building && stories.length === 0 ? (
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
                  onClick={() => setIncludeUnlinked(true)}
                >
                  Show unlinked stories too
                </button>
              )}
            </Notice>
          ) : (
            stories.map((s) => <StoryCard key={s.id} {...cardProps(s)} />)
          )}
        </Col>

        {hasMore && (
          <button
            type="button"
            onClick={() => setLimit((l) => Math.min(l + PAGE_SIZE, MAX_LIMIT))}
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
          Prototype. Stories come from Wikipedia's Current Events portal (CC
          BY-SA) and Google News; headlines link out to the outlets. Markets are
          matched by embedding similarity against every open market and verified
          by an AI pass before they appear.
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
    <Row
      className="items-center gap-1 px-1 pt-1"
      role="group"
      aria-label="Sort"
    >
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

/** Why this story leads the page today. */
function SpotlightLabel(props: { spotlight: NewsSpotlight }) {
  const { reason, value } = props.spotlight
  return (
    <Row className="items-baseline justify-between gap-2 px-1">
      <h2 className="text-primary-700 text-[11px] font-semibold uppercase tracking-wide">
        Top story today
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
