import { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/layout/page'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import {
  SportsMatchCard,
  PastMatchCard,
  SportsMatch,
  MatchOutcome,
  SportsDashboardTabButton,
} from 'web/components/sports/sports-match-card'
import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import { api, updateDashboard } from 'web/lib/api/api'
import { useAdminOrMod, useDev } from 'web/hooks/use-admin'
import { getContracts, getAnswersForContracts } from 'common/supabase/contracts'
import { db } from 'web/lib/supabase/db'
import { useUser } from 'web/hooks/use-user'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import type { DropResult } from '@hello-pangea/dnd'
import { Dashboard, DashboardItem } from 'common/dashboard'
import { Contract } from 'common/contract'
import { Answer } from 'common/answer'
import { Button } from 'web/components/buttons/button'
import { shortFormatNumber } from 'common/util/format'
import { SearchInput } from 'web/components/search/search-input'
import { ContractFilters } from 'web/components/search/contract-filters'
import {
  SearchParams,
  QUERY_KEY,
  SORT_KEY,
  FILTER_KEY,
  CONTRACT_TYPE_KEY,
  SEARCH_TYPE_KEY,
  PRIZE_MARKET_KEY,
  FOR_YOU_KEY,
  TOPIC_FILTER_KEY,
  SWEEPIES_KEY,
  GROUP_IDS_KEY,
  LIQUIDITY_KEY,
  HAS_BETS_KEY,
} from 'web/components/search'
import { ContractStatusLabel } from 'web/components/contract/contracts-table'
import { FeedContractCard } from 'web/components/contract/feed-contract-card'
import clsx from 'clsx'
import dayjs from 'dayjs'
import { APIParams } from 'common/api/schema'
import { SportsMarket } from 'common/sports'
import { formatJustTime } from 'client-common/lib/time'
import toast from 'react-hot-toast'

// ─── Types ────────────────────────────────────────────────────────────────────

type DateSection = { label: string; matches: SportsMatch[] }
type SortKey = 'manual' | 'date' | 'volume' | 'title'

// ─── Utilities ────────────────────────────────────────────────────────────────

const RECENT_THRESHOLD_MS = 12 * 60 * 60 * 1000

function formatTime(isoOrMs: string | number): string {
  const t = typeof isoOrMs === 'number' ? isoOrMs : new Date(isoOrMs).getTime()
  return formatJustTime(t)
}

function formatDateLabel(isoOrMs: string | number): string {
  return dayjs(isoOrMs).format('MMM D')
}

function todayDateLabel(): string {
  return formatDateLabel(Date.now())
}

function CommunityEmptyState() {
  return (
    <Col className="items-center gap-4 py-20">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        strokeWidth=".6"
        stroke="currentColor"
        className="text-ink-200 h-16 w-16"
      >
        <path
          d="M5.24854 17.0952L18.7175 6.80301L14.3444 20M5.24854 17.0952L9.79649 18.5476M5.24854 17.0952L4.27398 6.52755M14.3444 20L9.79649 18.5476M14.3444 20L22 12.638L16.3935 13.8147M9.79649 18.5476L12.3953 15.0668M4.27398 6.52755L10.0714 13.389M4.27398 6.52755L2 9.0818L4.47389 8.85643M12.9451 11.1603L10.971 5L8.65369 11.6611"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p className="text-ink-300 text-sm">No markets yet</p>
    </Col>
  )
}

function parseAnswerText(text: string): { flag: string; name: string } {
  const chars = [...text.trim()]
  if (
    chars[0] &&
    chars[1] &&
    chars[0].codePointAt(0)! >= 0x1f1e6 &&
    chars[1].codePointAt(0)! >= 0x1f1e6
  ) {
    const flag = chars[0] + chars[1]
    return { flag, name: text.trim().slice(flag.length).trim() }
  }
  return { flag: '', name: text.trim() }
}

function toSportsMatch(m: SportsMarket): SportsMatch | null {
  if (!m.answers || m.answers.length < 2) return null

  const a0 = parseAnswerText(m.answers[0].text)
  const a1 = parseAnswerText(m.answers[1].text)
  const drawAnswer = m.answers.find((a) => a.text === 'Draw')

  const resolved = !!m.resolution
  let winner: MatchOutcome | undefined
  if (resolved && m.resolvedAnswer) {
    if (m.resolvedAnswer === m.answers[0].text) winner = 'teamA'
    else if (m.resolvedAnswer === m.answers[1].text) winner = 'teamB'
    else if (m.resolvedAnswer === 'Draw') winner = 'draw'
  }

  const kickoff = m.sportsStartTimestamp ?? m.closeTime
  const closeTimeMs = typeof kickoff === 'number' ? kickoff : new Date(kickoff).getTime()

  return {
    id: m.id,
    teamA: { name: a0.name, flag: a0.flag, prob: Math.round(m.answers[0].prob * 100) },
    teamB: { name: a1.name, flag: a1.flag, prob: Math.round(m.answers[1].prob * 100) },
    draw: { prob: drawAnswer ? Math.round(drawAnswer.prob * 100) : 0 },
    hasDraw: !!drawAnswer,
    closeTime: formatTime(kickoff),
    closeDateLabel: formatDateLabel(kickoff),
    closeTimeMs,
    resolutionTime: m.resolutionTime ?? null,
    finalScore:
      m.sportsHomeScore != null && m.sportsAwayScore != null
        ? { home: m.sportsHomeScore, away: m.sportsAwayScore }
        : undefined,
    volume: shortFormatNumber(m.volume),
    status: resolved ? 'resolved' : 'upcoming',
    winner,
    marketUrl: m.url,
    contractId: m.id,
    teamAAnswerId: m.answers[0].id,
    teamBAnswerId: m.answers[1].id,
    drawAnswerId: drawAnswer?.id,
  }
}

function groupByDate(matches: SportsMatch[]): DateSection[] {
  const map = new Map<string, SportsMatch[]>()
  for (const m of matches) {
    if (!map.has(m.closeDateLabel)) map.set(m.closeDateLabel, [])
    map.get(m.closeDateLabel)!.push(m)
  }
  return Array.from(map.entries()).map(([label, ms]) => ({ label, matches: ms }))
}

function sortContracts(
  contracts: Contract[],
  slugOrder: string[],
  sort: SortKey
): Contract[] {
  if (sort === 'manual') {
    return slugOrder
      .map((slug) => contracts.find((c) => c.slug === slug))
      .filter((c): c is Contract => !!c)
  }
  const sorted = [...contracts]
  if (sort === 'date') sorted.sort((a, b) => (a.closeTime ?? 0) - (b.closeTime ?? 0))
  else if (sort === 'volume') sorted.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
  else if (sort === 'title') sorted.sort((a, b) => a.question.localeCompare(b.question))
  return sorted
}

// ─── Add Market Modal ─────────────────────────────────────────────────────────

const DEFAULT_SEARCH_PARAMS: SearchParams = {
  [QUERY_KEY]: '',
  [SORT_KEY]: 'score',
  [FILTER_KEY]: 'open',
  [CONTRACT_TYPE_KEY]: 'ALL',
  [SEARCH_TYPE_KEY]: undefined,
  [PRIZE_MARKET_KEY]: '0',
  [FOR_YOU_KEY]: '0',
  [TOPIC_FILTER_KEY]: '',
  [SWEEPIES_KEY]: '0',
  [GROUP_IDS_KEY]: '',
  [LIQUIDITY_KEY]: '',
  [HAS_BETS_KEY]: '0',
}

function AddMarketModal({
  existingSlugs,
  onAdd,
  onClose,
}: {
  existingSlugs: Set<string>
  onAdd: (contractId: string) => Promise<void>
  onClose: () => void
}) {
  const [params, setParams] = useState<SearchParams>(DEFAULT_SEARCH_PARAMS)
  const [results, setResults] = useState<Contract[]>([])
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function updateParams(changes: Partial<SearchParams>) {
    setParams((prev) => ({ ...prev, ...changes }))
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const data = await api('search-markets-full', {
          term: params[QUERY_KEY],
          filter: params[FILTER_KEY] as APIParams<'search-markets-full'>['filter'],
          sort: params[SORT_KEY] as APIParams<'search-markets-full'>['sort'],
          contractType: params[CONTRACT_TYPE_KEY] as APIParams<'search-markets-full'>['contractType'],
          offset: 0,
          limit: 20,
          forYou: (params[FOR_YOU_KEY] ?? '0') as '1' | '0',
          token: 'MANA',
          hasBets: params[HAS_BETS_KEY] as '1' | '0' | undefined,
          liquidity: params[LIQUIDITY_KEY] ? parseInt(params[LIQUIDITY_KEY]) : undefined,
        })
        setResults((data as Contract[]) ?? [])
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 200)
  }, [
    params[QUERY_KEY],
    params[FILTER_KEY],
    params[SORT_KEY],
    params[CONTRACT_TYPE_KEY],
    params[FOR_YOU_KEY],
    params[HAS_BETS_KEY],
    params[LIQUIDITY_KEY],
  ])

  // Client-side substring filter to catch hyphen/partial misses
  const query = params[QUERY_KEY]
  const displayed = query.trim()
    ? results.filter((m) => m.question.toLowerCase().includes(query.toLowerCase()))
    : results

  async function handleAdd(contract: Contract) {
    setAdding(contract.id)
    try {
      await onAdd(contract.slug)
    } finally {
      setAdding(null)
    }
  }

  return (
    <Modal open setOpen={(o) => { if (!o) onClose() }} size="md">
      <Col className={clsx(MODAL_CLASS, 'gap-3')}>
        <p className="text-ink-1000 text-base font-semibold">Add market to community tab</p>

        <SearchInput
          value={params[QUERY_KEY]}
          setValue={(q) => updateParams({ [QUERY_KEY]: q })}
          placeholder="Search questions"
          autoFocus
          loading={searching}
        />

        <ContractFilters
          params={params}
          updateParams={updateParams}
          hideSweepsToggle
        />

        <Col className="max-h-80 gap-0.5 overflow-y-auto">
          {displayed.length > 0 ? displayed.map((contract) => {
            const already = existingSlugs.has(contract.slug)
            return (
              <Row
                key={contract.id}
                className={clsx(
                  'min-w-0 items-center gap-3 rounded-lg px-2 py-2 transition-colors',
                  already ? 'opacity-50' : 'hover:bg-canvas-50 cursor-pointer'
                )}
                onClick={() => !already && !adding && handleAdd(contract)}
              >
                <img
                  src={contract.creatorAvatarUrl ?? '/default-avatar.png'}
                  alt=""
                  className="h-7 w-7 shrink-0 rounded-full object-cover"
                />
                <span className="text-ink-900 min-w-0 flex-1 truncate text-sm">
                  {contract.question}
                </span>
                <ContractStatusLabel contract={contract} className="shrink-0 text-sm" />
                <span
                  className={clsx(
                    'shrink-0 rounded px-2 py-0.5 text-xs font-medium',
                    already
                      ? 'text-ink-400'
                      : adding === contract.id
                      ? 'text-ink-400'
                      : 'text-indigo-500 hover:text-indigo-700'
                  )}
                >
                  {adding === contract.id ? '…' : already ? 'Added' : 'Add'}
                </span>
              </Row>
            )
          }) : (
            !searching && (
              <p className="text-ink-400 py-2 text-sm">
                {query.trim() ? 'No markets found.' : 'Loading…'}
              </p>
            )
          )}
        </Col>

        <button onClick={onClose} className="text-ink-500 hover:text-ink-700 self-end text-sm">
          Done
        </button>
      </Col>
    </Modal>
  )
}

function CommunityMarketCard({ contract }: { contract: Contract }) {
  return <FeedContractCard contract={contract} />
}

// ─── Community Tab ────────────────────────────────────────────────────────────

function CommunityTab({
  communityDashboardSlug,
  competitionCode,
  isAdmin,
  onCountChange,
}: {
  communityDashboardSlug: string
  competitionCode: string
  isAdmin: boolean
  onCountChange?: (n: number) => void
}) {
  const [dashboard, setDashboard] = useState<Dashboard | null | undefined>(undefined)
  const [items, setItems] = useState<DashboardItem[]>([])
  const [sort, setSort] = useState<SortKey>('manual')
  const [showAdd, setShowAdd] = useState(false)
  const [pastVisible, setPastVisible] = useState(true)
  const [editMode, setEditMode] = useState(false)

  async function fetchDashboard() {
    try {
      const d = await api('get-dashboard-from-slug', { dashboardSlug: communityDashboardSlug })
      setDashboard(d as Dashboard)
      const dashItems = (d as Dashboard).items ?? []
      setItems(dashItems)
      onCountChange?.(dashItems.filter((i) => i.type === 'question').length)
    } catch {
      setDashboard(null)
    }
  }

  useEffect(() => { fetchDashboard() }, [communityDashboardSlug])

  const questionSlugs = items
    .filter((i): i is { type: 'question'; slug: string } => i.type === 'question')
    .map((i) => i.slug)

  const [contracts, setContracts] = useState<Contract[]>([])

  useEffect(() => {
    if (questionSlugs.length === 0) { setContracts([]); return }
    getContracts(db, questionSlugs, 'slug').then(async (fetched) => {
      const ids = fetched.map((c) => c.id)
      const answersByContractId = await getAnswersForContracts(db, ids)
      for (const c of fetched) {
        // Merge answers for all cpmm-multi-1 markets (MC, NUMBER, MULTI_NUMERIC, DATE)
        // regardless of whether 'answers' is already in the data blob
        if ((c as any).mechanism === 'cpmm-multi-1') {
          ;(c as any).answers = answersByContractId[c.id] ?? (c as any).answers ?? []
        }
      }
      setContracts(fetched)
    })
  }, [questionSlugs.join(',')])

  // Returns resolution timestamp, or null if still open.
  // For cpmm-multi-1 sports markets, waits until all answers are resolved.
  function contractResolvedAt(c: Contract): number | null {
    if (c.resolution && c.resolutionTime) return c.resolutionTime
    const answers = (c as any).answers as Array<{ resolution?: string; resolutionTime?: number }> | undefined
    if (answers && answers.length > 0 && answers.every((a) => a.resolution)) {
      const latest = Math.max(...answers.map((a) => a.resolutionTime ?? 0))
      return latest || c.closeTime || null
    }
    return null
  }

  const now = Date.now()
  const open = contracts.filter((c) => contractResolvedAt(c) === null)
  const recentResolved = contracts.filter((c) => {
    const t = contractResolvedAt(c)
    return t !== null && now - t < RECENT_THRESHOLD_MS
  })
  const pastResolved = contracts.filter((c) => {
    const t = contractResolvedAt(c)
    return t !== null && now - t >= RECENT_THRESHOLD_MS
  })

  // Report total items in this tab (open + resolved), matching the parent's
  // mount-time prefetch so the badge doesn't jump when the tab is first opened.
  useEffect(() => { onCountChange?.(contracts.length) }, [contracts.length])

  const sortedOpen = sortContracts(open, questionSlugs, sort)
  const existingSlugs = new Set(questionSlugs)

  async function onDragEnd(result: DropResult) {
    if (!result.destination || !dashboard) return
    const newItems = [...items]
    const [removed] = newItems.splice(result.source.index, 1)
    newItems.splice(result.destination.index, 0, removed)
    setItems(newItems)
    await updateDashboard({
      dashboardId: dashboard.id,
      title: dashboard.title,
      items: newItems,
      topics: dashboard.topics ?? [],
    })
  }

  async function handleAdd(contractId: string) {
    try {
      await api('admin-sports-community-market', {
        competitionCode,
        contractId,
        action: 'add',
      })
      await fetchDashboard()
      toast.success('Market added to community tab')
    } catch (e) {
      toast.error('Failed to add market')
    }
  }

  async function handleRemove(contract: Contract) {
    if (!dashboard) return
    // Optimistic: drop the item from local state immediately so the card
    // disappears even while the request and re-fetch are in flight. Revert
    // on error.
    const prevItems = items
    setItems((cur) =>
      cur.filter((i) => !(i.type === 'question' && i.slug === contract.slug))
    )
    try {
      await api('admin-sports-community-market', {
        competitionCode,
        contractId: contract.id,
        action: 'remove',
      })
      await fetchDashboard()
      toast.success('Market removed from community tab')
    } catch (e) {
      setItems(prevItems)
      toast.error('Failed to remove market')
    }
  }

  if (dashboard === undefined) return <LoadingIndicator />

  if (dashboard === null && !isAdmin) {
    return <CommunityEmptyState />
  }

  const sortLabels: { key: SortKey; label: string }[] = [
    { key: 'manual', label: 'Manual' },
    { key: 'date', label: 'Close date' },
    { key: 'volume', label: 'Volume' },
    { key: 'title', label: 'Title' },
  ]

  return (
    <Col className="gap-6">
      {/* Controls row */}
      <Row className="flex-wrap items-center justify-between gap-3">
        {/* Sort toggles */}
        <Row className="gap-1.5">
          {sortLabels.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={clsx(
                'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                sort === key
                  ? 'bg-ink-200 text-ink-900'
                  : 'text-ink-500 hover:text-ink-700'
              )}
            >
              {label}
            </button>
          ))}
        </Row>

        {/* Admin controls */}
        {isAdmin && (
          <Row className="items-center gap-2">
            <button
              onClick={() => setEditMode((v) => !v)}
              className="border-ink-200 text-ink-500 hover:bg-canvas-50 rounded border px-2 py-0.5 text-xs transition-colors"
            >
              {editMode ? 'done' : 'edit'}
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="bg-indigo-600 hover:bg-indigo-700 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors"
            >
              + Add market
            </button>
          </Row>
        )}
      </Row>

      {/* Not initialized hint for admins */}
      {dashboard === null && isAdmin && (
        <p className="text-ink-400 text-xs">
          No community dashboard yet — adding the first market will create it automatically.
        </p>
      )}

      {/* Open markets */}
      {dashboard !== null && sortedOpen.length === 0 && recentResolved.length === 0 && pastResolved.length === 0 && (
        <CommunityEmptyState />
      )}

      {dashboard !== null && (
        <>
          {sortedOpen.length > 0 && (
            sort === 'manual' && isAdmin && editMode ? (
              <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="community">
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                    >
                      {sortedOpen.map((contract, index) => (
                        <Draggable
                          key={contract.id}
                          draggableId={contract.id}
                          index={index}
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={clsx(
                                'flex flex-col gap-1.5',
                                snapshot.isDragging && 'opacity-80 shadow-lg'
                              )}
                            >
                              <Row className="items-center justify-between px-1">
                                <div
                                  {...provided.dragHandleProps}
                                  className="text-ink-400 hover:text-ink-700 cursor-grab text-lg leading-none select-none"
                                  title="Drag to reorder"
                                >
                                  ⠿
                                </div>
                                <button
                                  onClick={() => handleRemove(contract)}
                                  className="bg-ink-100 text-ink-600 hover:bg-red-100 hover:text-red-600 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold transition-colors"
                                  title="Remove from community tab"
                                >
                                  ✕
                                </button>
                              </Row>
                              <CommunityMarketCard contract={contract} />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {sortedOpen.map((contract) => (
                  <div key={contract.id} className="flex flex-col gap-1.5">
                    {isAdmin && editMode && (
                      <Row className="items-center justify-end px-1">
                        <button
                          onClick={() => handleRemove(contract)}
                          className="bg-ink-100 text-ink-600 hover:bg-red-100 hover:text-red-600 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold transition-colors"
                          title="Remove from community tab"
                        >
                          ✕
                        </button>
                      </Row>
                    )}
                    <CommunityMarketCard contract={contract} />
                  </div>
                ))}
              </div>
            )
          )}

          {recentResolved.length > 0 && (
            <Col className="gap-3">
              <Row className="items-center gap-2.5">
                <span className="text-ink-1000 text-base font-medium">Recent</span>
                <span className="text-ink-500 text-xs">{recentResolved.length} resolved</span>
              </Row>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {recentResolved.map((contract) => (
                  <div key={contract.id} className="flex flex-col gap-1.5">
                    {isAdmin && editMode && (
                      <Row className="items-center justify-end px-1">
                        <button
                          onClick={() => handleRemove(contract)}
                          className="bg-ink-100 text-ink-600 hover:bg-red-100 hover:text-red-600 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold transition-colors"
                          title="Remove from community tab"
                        >
                          ✕
                        </button>
                      </Row>
                    )}
                    <CommunityMarketCard contract={contract} />
                  </div>
                ))}
              </div>
            </Col>
          )}

          {pastResolved.length > 0 && (
            <Col className="border-ink-200 gap-3 border-t pt-6">
              <Row className="items-center gap-2.5">
                <span className="text-ink-500 text-sm font-medium">Past</span>
                <button
                  onClick={() => setPastVisible((v) => !v)}
                  className="border-ink-200 text-ink-500 hover:bg-canvas-50 rounded border px-2 py-0.5 text-xs transition-colors"
                >
                  {pastVisible ? 'hide' : `show (${pastResolved.length})`}
                </button>
              </Row>
              {pastVisible && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {pastResolved.map((contract) => (
                    <div key={contract.id} className="flex flex-col gap-1.5">
                      {isAdmin && editMode && (
                        <Row className="items-center justify-end px-1">
                          <button
                            onClick={() => handleRemove(contract)}
                            className="bg-ink-100 text-ink-600 hover:bg-red-100 hover:text-red-600 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold transition-colors"
                            title="Remove from community tab"
                          >
                            ✕
                          </button>
                        </Row>
                      )}
                      <CommunityMarketCard contract={contract} />
                    </div>
                  ))}
                </div>
              )}
            </Col>
          )}
        </>
      )}

      {showAdd && (
        <AddMarketModal
          existingSlugs={existingSlugs}
          onAdd={handleAdd}
          onClose={() => setShowAdd(false)}
        />
      )}
    </Col>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function SportsDashboardPage({
  sportsLeague,
  title,
  emoji,
  trackPageView,
  communityDashboardSlug,
  competitionCode,
}: {
  sportsLeague: string
  title: string
  emoji: string
  trackPageView: string
  communityDashboardSlug?: string
  competitionCode?: string
}) {
  const router = useRouter()
  const [markets, setMarkets] = useState<SportsMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pastVisible, setPastVisible] = useState(true)
  const [activeTab, setActiveTab] = useState<'official' | 'community'>('official')
  const [communityCount, setCommunityCount] = useState<number | undefined>(undefined)

  useEffect(() => {
    if (router.isReady) {
      setActiveTab(router.query.tab === 'community' ? 'community' : 'official')
    }
  }, [router.isReady, router.query.tab])

  function handleTabChange(tab: 'official' | 'community') {
    setActiveTab(tab)
    router.replace({ query: { ...router.query, tab } }, undefined, { shallow: true })
  }

  const isAdmin = useAdminOrMod() || useDev()

  async function fetchMarkets() {
    try {
      const data = await api('sports-markets', { sportsLeague })
      const mapped = data.markets.flatMap((m) => {
        const s = toSportsMatch(m)
        return s ? [s] : []
      })
      setMarkets(mapped)
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load markets')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMarkets()
  }, [])

  // Fetch community-tab market count on mount so the badge is correct before
  // the user clicks into the tab. CommunityTab will re-fetch on mount and
  // overwrite via onCountChange — that's intentional and cheap.
  useEffect(() => {
    if (!communityDashboardSlug) return
    let cancelled = false
    api('get-dashboard-from-slug', { dashboardSlug: communityDashboardSlug })
      .then((d) => {
        if (cancelled) return
        const items = (d as Dashboard).items ?? []
        setCommunityCount(items.filter((i) => i.type === 'question').length)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [communityDashboardSlug])

  const now = Date.now()
  const upcoming = markets.filter((m) => m.status === 'upcoming')
  const recentResolved = markets.filter(
    (m) =>
      m.status === 'resolved' &&
      now - (m.resolutionTime ?? m.closeTimeMs) < RECENT_THRESHOLD_MS
  )
  const pastResolved = markets.filter(
    (m) =>
      m.status === 'resolved' &&
      now - (m.resolutionTime ?? m.closeTimeMs) >= RECENT_THRESHOLD_MS
  )
  const upcomingSections = groupByDate(upcoming)
  const today = todayDateLabel()

  const hasCommunity = !!communityDashboardSlug && !!competitionCode

  return (
    <Page trackPageView={trackPageView}>
      <style>{`
        :root {
          --sports-team-a: #1A7A9A;
          --sports-team-a-vibrant: #0A8FAD;
          --sports-team-b: #8B3A52;
          --sports-team-b-vibrant: #C4436E;
          --sports-draw: #6B7A8E;
          --sports-draw-vibrant: #7A8CA0;
        }
        .dark {
          --sports-team-a-vibrant: #25C4E8;
          --sports-team-b-vibrant: #E85A8A;
          --sports-draw: #7A8A9E;
          --sports-draw-vibrant: #A8AABF;
        }
      `}</style>
      <Head>
        <title>{title} | Manifold</title>
      </Head>
      <Col className="mx-auto w-full max-w-5xl gap-8 px-4 py-6 sm:px-6">

        <Row className="border-ink-200 bg-canvas-0 sticky top-0 z-10 -mt-6 items-center justify-between border-b pt-6 pb-5">
          <Row className="items-center gap-3">
            <span className="text-2xl">{emoji}</span>
            <h1 className="text-ink-1000 text-xl font-medium tracking-tight">{title}</h1>
          </Row>
          <Row className="items-center gap-2">
            <SportsDashboardTabButton
              active={activeTab === 'official'}
              count={upcoming.length}
              onClick={() => handleTabChange('official')}
            >
              Official
            </SportsDashboardTabButton>
            <SportsDashboardTabButton
              active={activeTab === 'community'}
              count={communityCount}
              onClick={() => handleTabChange('community')}
            >
              Community
            </SportsDashboardTabButton>
          </Row>
        </Row>

        {activeTab === 'community' ? (
          hasCommunity ? (
            <CommunityTab
              communityDashboardSlug={communityDashboardSlug!}
              competitionCode={competitionCode!}
              isAdmin={isAdmin}
              onCountChange={setCommunityCount}
            />
          ) : (
            <Col className="items-center gap-3 py-16">
              <span className="text-ink-400 text-sm">Community markets coming soon</span>
            </Col>
          )
        ) : (
          <>
            {loading && <LoadingIndicator />}
            {error && <p className="text-sm text-red-500">{error}</p>}

            {upcomingSections.map(({ label, matches }, i) => (
              <Col key={label} className="gap-3">
                <Row className="items-center gap-2.5">
                  <span className="text-ink-1000 text-base font-medium">
                    {i === 0 && label === today ? `Today — ${label}` : label}
                  </span>
                  <span className="text-ink-500 text-xs">
                    {matches.length} match{matches.length !== 1 ? 'es' : ''}
                  </span>
                </Row>
                <div
                  className="grid gap-3"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}
                >
                  {matches.map((match) => (
                    <SportsMatchCard key={match.id} match={match} />
                  ))}
                </div>
              </Col>
            ))}

            {recentResolved.length > 0 && (
              <Col className="gap-3">
                <Row className="items-center gap-2.5">
                  <span className="text-ink-1000 text-base font-medium">Recent</span>
                  <span className="text-ink-500 text-xs">
                    {recentResolved.length} resolved
                  </span>
                </Row>
                <div
                  className="grid gap-3"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}
                >
                  {recentResolved.map((match) => (
                    <SportsMatchCard key={match.id} match={match} />
                  ))}
                </div>
              </Col>
            )}

            {pastResolved.length > 0 && (
              <Col className="border-ink-200 gap-3 border-t pt-6">
                <Row className="items-center gap-2.5">
                  <span className="text-ink-500 text-sm font-medium">Past games</span>
                  <button
                    onClick={() => setPastVisible((v) => !v)}
                    className="border-ink-200 text-ink-500 hover:bg-canvas-50 rounded border px-2 py-0.5 text-xs transition-colors"
                  >
                    {pastVisible ? 'hide' : 'show'}
                  </button>
                </Row>
                {pastVisible && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {pastResolved.map((match) => (
                      <PastMatchCard key={match.id} match={match} />
                    ))}
                  </div>
                )}
              </Col>
            )}

            {!loading && markets.length === 0 && !error && (
              <Col className="items-center gap-2 py-16 text-center">
                <span className="text-3xl">{emoji}</span>
                <p className="text-ink-700 text-sm font-medium">
                  No markets yet
                </p>
                <p className="text-ink-400 text-xs max-w-xs">
                  Markets are created automatically a few days before each
                  match. Check back soon.
                </p>
              </Col>
            )}
          </>
        )}

      </Col>
    </Page>
  )
}
