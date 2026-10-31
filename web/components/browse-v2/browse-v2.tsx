import {
  SearchIcon,
  ViewGridIcon,
  ViewListIcon,
  XIcon,
} from '@heroicons/react/outline'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { useRouter } from 'next/router'
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'

import { LoadMoreUntilNotVisible } from 'web/components/widgets/visibility-observer'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'
import { listGroupsBySlug } from 'web/lib/supabase/groups'
import { BrowseTopicsProvider, useBrowseTopics } from './browse-topics'
import { HubCards } from './hub-cards'
import { isHubMarket } from './hub-fold'
import {
  ALL_TOPICS,
  BrowseFilters,
  BrowseLayout,
  CONTRACT_TYPES,
  DEFAULT_FILTERS,
  LIQUIDITY_TIERS,
  Lens,
  LensBar,
  MAIN_LENSES,
  MORE_SORTS,
  sortForLens,
  STATUSES,
  TopicChoice,
} from './lens-bar'
import {
  MarketCard,
  MarketCardSkeleton,
  MarketListRow,
  MarketRowSkeleton,
} from './market-card'
import { ClosingSoonList, MoversStrip, NewMarketsList } from './market-shelves'
import { BrowseMarketsQuery, useBrowseMarkets } from './use-browse-markets'
import { YourTopicsModal } from './your-topics-modal'
import { useScrollReveal } from './use-scroll-reveal'

// Same page size as the classic page; most browse lists never load a
// second page.
const PAGE_SIZE = 40

export function BrowseV2() {
  const user = useUser()
  // Remount when the account changes (sign in, out, or switch) so no
  // optimistic topic state or cached results carry over. The first resolved
  // account keeps the initial mount, so a normal page load mounts once.
  const firstAccount = useRef<string>()
  const account = user === undefined ? undefined : user?.id ?? 'anon'
  if (account !== undefined && firstAccount.current === undefined)
    firstAccount.current = account
  const mountKey =
    account === undefined || account === firstAccount.current
      ? 'initial'
      : account
  return (
    <BrowseTopicsProvider key={mountKey}>
      <BrowseV2Inner />
    </BrowseTopicsProvider>
  )
}

function BrowseV2Inner() {
  const user = useUser()
  const signedIn = !!user
  const topics = useBrowseTopics()

  // Sort and layout are habits, so both are remembered on this device.
  const [savedLens, setSavedLens, lensReady] = usePersistentLocalState<Lens>(
    'best',
    'browse-v2-lens'
  )
  // Most browse clicks land several markets down the list, so phones default
  // to the denser list view. A choice either way is remembered.
  const isMobile = useIsMobile()
  const searchRef = useRef<HTMLDivElement>(null)
  const filtersRef = useRef<HTMLDivElement>(null)
  useScrollReveal(searchRef, filtersRef, isMobile)
  const [savedLayout, setLayout] = usePersistentLocalState<
    BrowseLayout | undefined
  >(undefined, 'browse-v2-layout')
  const layout: BrowseLayout = savedLayout ?? (isMobile ? 'list' : 'cards')
  const [topicChoice, setTopicChoice] = usePersistentInMemoryState<TopicChoice>(
    ALL_TOPICS,
    'browse-v2-topic'
  )
  const [filters, setFilters] = usePersistentInMemoryState<BrowseFilters>(
    DEFAULT_FILTERS,
    'browse-v2-filters'
  )
  const [input, setInput] = usePersistentInMemoryState('', 'browse-v2-term')
  const [term, setTerm] = useState(input.trim())
  useEffect(() => {
    const t = setTimeout(() => setTerm(input.trim()), 300)
    return () => clearTimeout(t)
  }, [input])
  const [yourTopicsOpen, setYourTopicsOpen] = useState(false)
  const [retry, setRetry] = useState(0)

  // Links into browse (/browse?q=..., ?tf=<topic>, ?s=, ?f=, ?fy=1, ?ct=,
  // ?li=) keep working: apply them once before the first fetch.
  const router = useRouter()
  const urlApplied = useRef(false)
  const [urlReady, setUrlReady] = useState(false)
  useEffect(() => {
    if (!router.isReady || urlApplied.current) return
    urlApplied.current = true
    const param = (k: string) => {
      const v = router.query[k]
      return typeof v === 'string' ? v : undefined
    }
    const q = param('q')
    if (q !== undefined) {
      setInput(q)
      setTerm(q.trim())
    }
    const tf = param('tf')
    if (tf && /^[a-zA-Z0-9_-]+$/.test(tf)) {
      setTopicChoice({
        key: `url:${tf}`,
        label: tf.replace(/-/g, ' '),
        topicSlug: tf,
      })
      listGroupsBySlug([tf]).then(([g]) => {
        if (g)
          setTopicChoice({ key: `url:${tf}`, label: g.name, topicSlug: tf })
      })
    }
    const sort = param('s')
    const lensFromSort: Record<string, Lens> = {
      score: 'best',
      'freshness-score': 'hot',
      newest: 'new',
    }
    if (param('fy') === '1') setSavedLens('for-you')
    else if (sort && lensFromSort[sort]) setSavedLens(lensFromSort[sort])
    else if (sort && MORE_SORTS.some((m) => m.key === sort))
      setSavedLens(sort as Lens)
    const status = STATUSES.find((x) => x.key === param('f'))?.key
    const type = CONTRACT_TYPES.find((x) => x.key === param('ct'))?.key
    const li = param('li')
    const liquidity = LIQUIDITY_TIERS.find(
      (x) => li && x.key === Number(li)
    )?.key
    if (status || type || liquidity)
      setFilters({
        ...DEFAULT_FILTERS,
        ...(status ? { status } : {}),
        ...(type ? { contractType: type } : {}),
        ...(liquidity ? { liquidity } : {}),
      })
    setUrlReady(true)
  }, [router.isReady])

  const followedChoices: TopicChoice[] = (topics.followed ?? []).map((g) => ({
    key: `topic:${g.slug}`,
    label: g.name,
    topicSlug: g.slug,
  }))
  const knownLens =
    MAIN_LENSES.some((l) => l.key === savedLens) ||
    MORE_SORTS.some((s) => s.key === savedLens)
  // A topic the user no longer follows, or a signed-out visitor's followed
  // filter, falls back to All.
  const topic =
    topicChoice.key.startsWith('topic:') &&
    topics.followed &&
    !followedChoices.some((t) => t.key === topicChoice.key)
      ? ALL_TOPICS
      : !signedIn &&
        (topicChoice.key === 'followed' || topicChoice.key.startsWith('topic:'))
      ? ALL_TOPICS
      : topicChoice
  const lens: Lens = !knownLens
    ? 'best'
    : savedLens === 'for-you' && (!signedIn || topic.key !== 'all')
    ? 'best'
    : savedLens
  const searching = term.length > 0

  const scope = useMemo(
    () => ({
      gids: topic.gids,
      topicSlug: topic.topicSlug as BrowseMarketsQuery['topicSlug'],
    }),
    [topic.key]
  )

  const query: BrowseMarketsQuery | undefined =
    lensReady && urlReady
      ? {
          term: searching ? term : undefined,
          sort: searching ? 'score' : sortForLens(lens),
          filter: lens === 'close-date' && !searching ? 'open' : filters.status,
          contractType: filters.contractType,
          liquidity: filters.liquidity,
          forYou: lens === 'for-you' && !searching ? '1' : '0',
          token: 'MANA',
          ...scope,
        }
      : undefined
  const { contracts, hasMore, loadMore, error } = useBrowseMarkets(
    query,
    PAGE_SIZE,
    `${topics.version}-${retry}`
  )
  // Fold hub markets out of the general feed only; a search, a topic or a
  // type filter means the person is looking for something specific.
  const fold =
    !filters.showHubMarkets &&
    !searching &&
    topic.key === 'all' &&
    filters.contractType === 'ALL'
  const allowed = contracts?.filter((c: Contract) => !topics.isExcluded(c))
  // Hidden topics, blocked markets and blocked creators drop out right away.
  const visible = fold ? allowed?.filter((c) => !isHubMarket(c)) : allowed
  const folded = (allowed?.length ?? 0) - (visible?.length ?? 0)

  const showMovers =
    !searching &&
    filters.status === 'open' &&
    (lens === 'for-you' || lens === 'best' || lens === 'hot')
  const lensLabel =
    MAIN_LENSES.find((l) => l.key === lens)?.label ??
    MORE_SORTS.find((s) => s.key === lens)?.label ??
    ''
  const heading = searching
    ? `Results for “${term}”`
    : `${lensLabel}${topic.key === 'all' ? '' : ` · ${topic.label}`}`
  const noFollows = topic.key === 'followed' && topics.followed?.length === 0

  const onLens = (next: Lens) => {
    track('browse v2 lens', { lens: next })
    if (next === 'for-you') setTopicChoice(ALL_TOPICS)
    setSavedLens(next)
    setInput('')
  }
  const onTopic = (next: TopicChoice) => {
    track('browse v2 topic', { topic: next.key })
    setTopicChoice(next)
  }
  const onFilters = (next: BrowseFilters) => {
    track('browse v2 filters', { ...next })
    setFilters(next)
  }
  const onLayout = (next: BrowseLayout) => {
    track('browse v2 layout', { layout: next })
    setLayout(next)
  }
  const openYourTopics = () => {
    if (!signedIn) {
      firebaseLogin()
      return
    }
    track('browse v2 your topics open')
    setYourTopicsOpen(true)
  }
  const resetFilters = () => {
    setTopicChoice(ALL_TOPICS)
    setFilters(DEFAULT_FILTERS)
    setInput('')
  }
  const section = `browse-v2 ${searching ? 'search' : lens} ${layout}`

  return (
    <div className="flex w-full flex-col gap-2 px-3 pb-10 lg:px-0">
      <div
        ref={searchRef}
        className="bg-canvas-0 sticky top-0 z-30 -mx-3 flex h-[44px] shrink-0 items-center gap-2 px-3 py-0.5 will-change-transform sm:static sm:mx-0 sm:h-auto sm:px-0 sm:py-0 sm:will-change-auto"
      >
        <h1 className="text-ink-1000 hidden text-base font-semibold sm:block">
          Browse
        </h1>
        <label className="border-ink-300 focus-within:border-primary-500 bg-canvas-0 flex min-w-0 flex-1 items-center gap-2 rounded-full border px-3 py-1.5 transition-colors">
          <SearchIcon className="text-ink-400 h-5 w-5 shrink-0" />
          <span className="sr-only">Search markets</span>
          <input
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search markets"
            className="text-ink-1000 placeholder:text-ink-400 min-w-0 flex-1 border-0 bg-transparent p-0 text-base focus:outline-none focus:ring-0 sm:text-sm"
          />
          {input && (
            <button
              type="button"
              onClick={() => setInput('')}
              aria-label="Clear search"
              className="text-ink-400 hover:text-ink-700"
            >
              <XIcon className="h-4 w-4" />
            </button>
          )}
        </label>
        {/* Phones: one button that flips between cards and list, so the
            layout switch isn't hidden at the end of the scrolling row. */}
        <button
          type="button"
          onClick={() => onLayout(layout === 'list' ? 'cards' : 'list')}
          aria-label={layout === 'list' ? 'Show cards' : 'Show list'}
          title={layout === 'list' ? 'Show cards' : 'Show list'}
          className="border-ink-300 text-ink-600 hover:text-ink-900 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border sm:hidden"
        >
          {layout === 'list' ? (
            <ViewGridIcon className="h-4 w-4" />
          ) : (
            <ViewListIcon className="h-4 w-4" />
          )}
        </button>
      </div>

      {!searching && <HubCards />}

      <div
        ref={filtersRef}
        className="bg-canvas-0 sticky top-[44px] z-20 -mx-3 px-3 py-0.5 will-change-transform sm:top-0 sm:will-change-auto lg:mx-0 lg:px-0"
      >
        <LensBar
          lens={lens}
          onLens={onLens}
          signedIn={signedIn}
          topic={topic}
          followedTopics={followedChoices}
          onTopic={onTopic}
          filters={filters}
          onFilters={onFilters}
          layout={layout}
          onLayout={onLayout}
          onYourTopics={openYourTopics}
          searching={searching}
        />
      </div>

      <div className="flex gap-4 xl:gap-8">
        <div className="flex w-full min-w-0 shrink-0 flex-col gap-4">
          {urlReady && showMovers && !isMobile && lens !== 'best' && (
            <MoversStrip scope={scope} fold={fold} layout={layout} />
          )}

          <section
            aria-labelledby="browse-results"
            className="flex flex-col gap-2"
          >
            <h2
              id="browse-results"
              className={clsx(
                'text-ink-900 text-xs font-semibold',
                !searching && topic.key === 'all' && 'sr-only'
              )}
            >
              {heading}
            </h2>
            {fold && folded > 0 && (
              <p className="text-ink-500 text-xs leading-4">
                {folded} {folded === 1 ? 'market' : 'markets'} in hubs.{' '}
                <button
                  type="button"
                  onClick={() =>
                    onFilters({ ...filters, showHubMarkets: true })
                  }
                  className="text-primary-700 font-medium"
                >
                  Show them here
                </button>
              </p>
            )}
            <Results
              layout={layout}
              contracts={visible}
              section={section}
              hasMore={hasMore}
              loadMore={loadMore}
              interlude={
                urlReady && showMovers && (isMobile || lens === 'best') ? (
                  <MoversStrip scope={scope} fold={fold} layout={layout} />
                ) : undefined
              }
            />
            {visible && visible.length === 0 && (
              <EmptyState
                message={
                  error
                    ? 'Markets failed to load. Try again in a moment.'
                    : noFollows
                    ? "You don't follow any topics yet."
                    : 'No markets match these filters.'
                }
                action={
                  error
                    ? {
                        label: 'Try again',
                        onClick: () => setRetry((r) => r + 1),
                      }
                    : noFollows
                    ? {
                        label: 'Pick topics to follow',
                        onClick: openYourTopics,
                      }
                    : {
                        label: 'Clear search and filters',
                        onClick: resetFilters,
                      }
                }
              />
            )}
          </section>
        </div>

        {/* Keep the feed at the standard Page width. The rail uses the
            three unused columns to its right, within Page's 1440px cap. */}
        <aside
          aria-label="More markets"
          className="hidden w-[calc(25vw-2rem)] shrink-0 flex-col gap-6 lg:flex xl:w-72"
        >
          {urlReady && (
            <>
              <ClosingSoonList scope={scope} fold={fold} />
              <NewMarketsList scope={scope} fold={fold} />
            </>
          )}
        </aside>
      </div>

      {yourTopicsOpen && (
        <YourTopicsModal open={yourTopicsOpen} setOpen={setYourTopicsOpen} />
      )}
    </div>
  )
}

// Give Best and mobile feeds a full set of markets before the first break.
const INTERLUDE_AT = 8

function Results(props: {
  layout: BrowseLayout
  contracts: Contract[] | undefined
  section: string
  hasMore: boolean
  loadMore: () => Promise<boolean>
  interlude?: ReactNode
}) {
  const { layout, contracts, section, hasMore, loadMore, interlude } = props
  const split = !!interlude && !!contracts && contracts.length > INTERLUDE_AT
  const head = split ? contracts.slice(0, INTERLUDE_AT) : contracts
  const tail = split ? contracts.slice(INTERLUDE_AT) : []

  if (layout === 'list') {
    const list = (items: Contract[] | undefined, more: boolean) => (
      <div className="bg-canvas-0 flex flex-col">
        {items
          ? items.map((c) => (
              <MarketListRow key={c.id} contract={c} section={section} />
            ))
          : Array.from({ length: 8 }).map((_, i) => (
              <MarketRowSkeleton key={i} />
            ))}
        {more && (
          <>
            <LoadMoreUntilNotVisible loadMore={loadMore} />
            <MarketRowSkeleton />
          </>
        )}
      </div>
    )
    return (
      <>
        {list(head, !split && !!contracts && hasMore)}
        {split && (
          <>
            {interlude}
            {list(tail, hasMore)}
          </>
        )}
      </>
    )
  }
  const grid = (items: Contract[] | undefined) => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items
        ? items.map((c) => (
            <MarketCard key={c.id} contract={c} section={section} />
          ))
        : Array.from({ length: 6 }).map((_, i) => (
            <MarketCardSkeleton key={i} />
          ))}
    </div>
  )
  return (
    <>
      {grid(head)}
      {split && (
        <>
          {interlude}
          {grid(tail)}
        </>
      )}
      {contracts && hasMore && (
        <>
          <LoadMoreUntilNotVisible loadMore={loadMore} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MarketCardSkeleton />
            <MarketCardSkeleton />
          </div>
        </>
      )}
    </>
  )
}

function EmptyState(props: {
  message: string
  action: { label: string; onClick: () => void }
}) {
  const { message, action } = props
  return (
    <div
      className={clsx(
        'border-ink-200 dark:border-ink-300 flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-10 text-center'
      )}
    >
      <p className="text-ink-600 m-0">{message}</p>
      <button
        type="button"
        onClick={action.onClick}
        className="text-primary-700 hover:text-primary-800 text-sm font-medium"
      >
        {action.label}
      </button>
    </div>
  )
}
