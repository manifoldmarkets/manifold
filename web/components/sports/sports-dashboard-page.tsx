import { useEffect, useRef, useState } from 'react'
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
import { useAdmin, useDev } from 'web/hooks/use-admin'
import { getContracts, getAnswersForContracts } from 'common/supabase/contracts'
import { db } from 'web/lib/supabase/db'
import { useUser } from 'web/hooks/use-user'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import type { DropResult } from '@hello-pangea/dnd'
import { Dashboard, DashboardItem } from 'common/dashboard'
import { Contract } from 'common/contract'
import { Answer } from 'common/answer'
import { TradesButton } from 'web/components/contract/trades-button'
import { ReactButton } from 'web/components/contract/react-button'
import { RepostButton } from 'web/components/comments/repost-modal'
import { Button } from 'web/components/buttons/button'
import { Tooltip } from 'web/components/widgets/tooltip'
import { shortFormatNumber } from 'common/util/format'
import { TbDroplet } from 'react-icons/tb'
import { getAnswerColor } from 'web/components/charts/contract/choice'
import { formatNumericProbability } from 'common/pseudo-numeric'
import { getCpmmProbability } from 'common/calculate-cpmm'
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
import clsx from 'clsx'

// ─── Types ────────────────────────────────────────────────────────────────────

type ApiMarket = {
  id: string
  question: string
  stageLabel: string
  closeTime: number
  sportsStartTimestamp: string | null
  resolution: string | null
  resolvedAnswer: string | null
  resolutionTime: number | null
  sportsHomeScore: number | null
  sportsAwayScore: number | null
  volume: number
  url: string
  needsAttention: boolean
  answers: Array<{ id: string; text: string; prob: number }>
}

type DateSection = { label: string; matches: SportsMatch[] }
type SortKey = 'manual' | 'date' | 'volume' | 'title'

// ─── Utilities ────────────────────────────────────────────────────────────────

const POLL_MS = 30_000
const RECENT_THRESHOLD_MS = 12 * 60 * 60 * 1000

function formatVolume(v: number): string {
  if (v >= 1000) return (v / 1000).toFixed(1) + 'k'
  return String(v)
}

function formatTime(isoOrMs: string | number): string {
  const d = new Date(isoOrMs)
  return (
    d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    }) + ' UTC'
  )
}

function formatDateLabel(isoOrMs: string | number): string {
  return new Date(isoOrMs).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function todayDateLabel(): string {
  return formatDateLabel(Date.now())
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

function toSportsMatch(m: ApiMarket): SportsMatch | null {
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
    volume: formatVolume(m.volume),
    status: resolved ? 'resolved' : 'upcoming',
    winner,
    marketUrl: m.url,
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
          filter: params[FILTER_KEY],
          sort: params[SORT_KEY],
          contractType: params[CONTRACT_TYPE_KEY],
          offset: 0,
          limit: 20,
          forYou: params[FOR_YOU_KEY],
          token: 'MANA',
          hasBets: params[HAS_BETS_KEY],
          liquidity: params[LIQUIDITY_KEY] ? parseInt(params[LIQUIDITY_KEY]) : undefined,
        } as any)
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
                  'items-center gap-3 rounded-lg px-2 py-2 transition-colors',
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

// ─── Community Market Card ─────────────────────────────────────────────────────

type MarketMeta = { label: string; badgeBg: string; badgeText: string; accentText: string }

function marketMeta(outcomeType: string): MarketMeta {
  switch (outcomeType) {
    case 'BINARY':
      return { label: 'Binary', badgeBg: 'bg-indigo-100', badgeText: 'text-indigo-700', accentText: 'text-indigo-500' }
    case 'MULTIPLE_CHOICE':
      return { label: 'Multiple choice', badgeBg: 'bg-violet-100', badgeText: 'text-violet-700', accentText: 'text-violet-600' }
    case 'PSEUDO_NUMERIC':
    case 'NUMBER':
    case 'MULTI_NUMERIC':
    case 'DATE':
      return { label: 'Numeric', badgeBg: 'bg-blue-100', badgeText: 'text-blue-700', accentText: 'text-blue-600' }
    case 'POLL':
      return { label: 'Poll', badgeBg: 'bg-teal-100', badgeText: 'text-teal-700', accentText: 'text-teal-600' }
    case 'BOUNTIED_QUESTION':
      return { label: 'Bounty', badgeBg: 'bg-amber-100', badgeText: 'text-amber-700', accentText: 'text-amber-600' }
    case 'STONK':
      return { label: 'Stock', badgeBg: 'bg-orange-100', badgeText: 'text-orange-700', accentText: 'text-orange-600' }
    default:
      return { label: 'Market', badgeBg: 'bg-gray-100', badgeText: 'text-gray-600', accentText: 'text-gray-500' }
  }
}

function CommunityMarketCard({ contract }: { contract: Contract }) {
  const user = useUser()
  const meta = marketMeta(contract.outcomeType)
  const isBinary = contract.outcomeType === 'BINARY'
  const isMulti = contract.outcomeType === 'MULTIPLE_CHOICE'
  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'
  const isNumericBuckets =
    contract.outcomeType === 'NUMBER' ||
    contract.outcomeType === 'MULTI_NUMERIC' ||
    contract.outcomeType === 'DATE'
  const isPoll = contract.outcomeType === 'POLL'
  const answers = (contract as any).answers as Answer[] | undefined
  const pollOptions = isPoll
    ? ((contract as any).options as Array<{ id: string; text: string }> | undefined)
    : undefined

  const binaryProb = isBinary ? Math.round((contract as any).prob * 100) : null
  const binaryResolution = contract.resolution

  const nonOtherAnswers = answers ? answers.filter((a) => !a.isOther) : []
  const otherAnswer = answers?.find((a) => a.isOther)
  const topThree = [...nonOtherAnswers].sort((a, b) => b.prob - a.prob).slice(0, 3)

  const contractUrl = `/${contract.creatorUsername}/${contract.slug}`
  const hasLiquidity = 'totalLiquidity' in contract

  return (
    <div className="bg-canvas-50 border-canvas-100 relative flex h-full flex-col overflow-hidden rounded-xl border">
      {/* Header */}
      <Row className="items-center justify-between gap-2 px-4 pt-4 pb-2">
        <a
          href={`/${contract.creatorUsername}`}
          className="flex min-w-0 items-center gap-2 hover:opacity-70"
        >
          <img
            src={contract.creatorAvatarUrl ?? '/default-avatar.png'}
            alt=""
            className="h-6 w-6 shrink-0 rounded-full object-cover"
          />
          <span className="text-ink-500 truncate text-[13px]">@{contract.creatorUsername}</span>
        </a>
        <span
          className={clsx(
            'shrink-0 rounded px-2 py-0.5 text-xs font-semibold',
            meta.badgeBg,
            meta.badgeText
          )}
        >
          {meta.label}
        </span>
      </Row>

      {/* Title */}
      <a href={contractUrl} className="px-4 pb-2 pt-0.5 hover:opacity-80">
        <p className="text-ink-900 line-clamp-2 text-[15px] font-semibold leading-snug">
          {contract.question}
        </p>
      </a>

      {/* Content — flex-1 so footer is always pinned to bottom */}
      <div className="min-h-0 flex-1 overflow-hidden px-4 pb-3 pt-1">
        {isBinary && (
          <Col className="gap-1 py-1">
            {binaryResolution && binaryResolution !== 'CANCEL' ? (
              <>
                <span
                  className={clsx(
                    'text-3xl font-bold',
                    binaryResolution === 'YES' ? 'text-teal-500' : 'text-rose-500'
                  )}
                >
                  {binaryResolution} ✓
                </span>
                <span className="text-ink-400 text-[13px]">resolved</span>
              </>
            ) : (
              <>
                <span className={clsx('text-4xl font-bold', meta.accentText)}>
                  {binaryProb}%
                </span>
                <span className="text-ink-400 text-[13px]">chance · yes</span>
              </>
            )}
          </Col>
        )}

        {isMulti && topThree.length > 0 && (
          <Col className="gap-2 py-1">
            {topThree.map((a) => {
              const pct = Math.round(a.prob * 100)
              const isWinner = a.resolution === 'YES'
              const barColor = getAnswerColor(a)
              return (
                <Row key={a.id} className="items-center gap-3">
                  <span className="text-ink-700 w-2/5 shrink-0 truncate text-[13px] leading-tight">
                    {a.text}
                  </span>
                  <div className="bg-ink-200 flex-1 overflow-hidden rounded-full" style={{ height: '8px' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: barColor }}
                    />
                  </div>
                  <span
                    className={clsx(
                      'w-8 shrink-0 text-right text-[13px] font-medium',
                      isWinner ? 'text-teal-500' : 'text-ink-500'
                    )}
                  >
                    {isWinner ? '✓' : `${pct}%`}
                  </span>
                </Row>
              )
            })}
            {(() => {
              const moreCount = Math.max(0, nonOtherAnswers.length - 3) + (otherAnswer ? 1 : 0)
              return moreCount > 0 ? (
                <a href={contractUrl} className="text-ink-400 hover:text-ink-600 text-[13px] transition-colors">
                  +{moreCount} more →
                </a>
              ) : null
            })()}
          </Col>
        )}

        {isPseudoNumeric && (() => {
          const c = contract as any
          // `prob` is stored on CPMM contracts; fall back to computing from pool+p
          const prob: number | undefined =
            c.prob ?? (c.pool && c.p != null ? getCpmmProbability(c.pool, c.p) : undefined)
          const hasRange = prob !== undefined && c.min !== undefined
          const resolveProb = contract.resolutionProbability ?? prob
          return (
            <Col className="gap-1 py-1">
              {contract.resolution ? (
                <>
                  <span className="text-ink-900 text-3xl font-bold">
                    {hasRange && resolveProb !== undefined
                      ? formatNumericProbability(resolveProb, c)
                      : contract.resolution}
                  </span>
                  <span className="text-ink-400 text-[13px]">resolved</span>
                </>
              ) : (
                <span className="text-ink-900 text-4xl font-bold">
                  {hasRange && prob !== undefined
                    ? formatNumericProbability(prob, c)
                    : prob !== undefined
                    ? `${Math.round(prob * 100)}%`
                    : '—'}
                </span>
              )}
            </Col>
          )
        })()}

        {isNumericBuckets && (() => {
          const topAnswer = nonOtherAnswers.length > 0
            ? [...nonOtherAnswers].sort((a, b) => b.prob - a.prob)[0]
            : null
          if (!topAnswer) return null
          const pct = Math.round(topAnswer.prob * 100)
          const isResolved = !!contract.resolution || topAnswer.resolution === 'YES'
          return (
            <Col className="gap-1 py-1">
              <span className={clsx('text-2xl font-bold leading-tight', meta.accentText)}>
                {topAnswer.text}
              </span>
              <span className="text-ink-400 text-[13px]">
                {isResolved ? 'resolved' : `${pct}% chance`}
              </span>
            </Col>
          )
        })()}

        {isPoll && pollOptions && pollOptions.length > 0 && (
          <Col className="gap-1.5 py-1">
            {pollOptions.slice(0, 3).map((o) => (
              <Row key={o.id} className="items-center gap-2">
                <div className="bg-ink-300 h-1.5 w-1.5 shrink-0 rounded-full" />
                <span className="text-ink-600 truncate text-[13px] leading-tight">{o.text}</span>
              </Row>
            ))}
            {pollOptions.length > 3 && (
              <a href={contractUrl} className="text-ink-400 hover:text-ink-600 text-[13px] transition-colors">
                +{pollOptions.length - 3} more →
              </a>
            )}
          </Col>
        )}
      </div>

      {/* Footer — always at bottom */}
      <Row className="border-canvas-100 items-center gap-0.5 border-t px-3 py-1.5">
        <TradesButton contract={contract} size="sm" />
        {hasLiquidity && (
          <Button disabled size="2xs" color="gray-white">
            <Tooltip text="Total liquidity" placement="top" noTap>
              <Row className="text-ink-500 items-center gap-1">
                <TbDroplet className="h-5 w-5 stroke-2" />
                <span className="text-ink-600 text-[13px]">
                  {shortFormatNumber((contract as any).totalLiquidity)}
                </span>
              </Row>
            </Tooltip>
          </Button>
        )}
        <RepostButton
          playContract={contract}
          size="2xs"
          iconClassName="text-ink-500"
        />
        <ReactButton
          contentId={contract.id}
          contentCreatorId={contract.creatorId}
          user={user}
          contentType="contract"
          contentText={contract.question}
          size="2xs"
          trackingLocation="community-tab"
          placement="top"
          contractId={contract.id}
          heartClassName="stroke-ink-500"
        />
      </Row>
    </div>
  )
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
  const [pastVisible, setPastVisible] = useState(false)
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
    await api('admin-sports-community-market', {
      competitionCode,
      contractId,
      action: 'add',
    })
    await fetchDashboard()
  }

  async function handleRemove(contract: Contract) {
    if (!dashboard) return
    await api('admin-sports-community-market', {
      competitionCode,
      contractId: contract.id,
      action: 'remove',
    })
    await fetchDashboard()
  }

  if (dashboard === undefined) return <LoadingIndicator />

  if (dashboard === null && !isAdmin) {
    return (
      <Col className="items-center gap-3 py-16">
        <p className="text-ink-400 text-sm">No community markets yet.</p>
      </Col>
    )
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
        <Col className="items-center gap-2 py-12">
          <p className="text-ink-400 text-sm">No community markets yet.</p>
        </Col>
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
                                'relative flex flex-col',
                                snapshot.isDragging && 'opacity-80 shadow-lg'
                              )}
                            >
                              <div
                                {...provided.dragHandleProps}
                                className="text-ink-300 hover:text-ink-500 absolute top-2 left-2 z-10 cursor-grab text-lg leading-none select-none"
                                title="Drag to reorder"
                              >
                                ⠿
                              </div>
                              <button
                                onClick={() => handleRemove(contract)}
                                className="absolute top-2 right-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-ink-200 text-[11px] font-bold text-ink-600 hover:bg-red-100 hover:text-red-600 transition-colors"
                              >
                                ✕
                              </button>
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
                  <div key={contract.id} className="relative flex flex-col">
                    {isAdmin && editMode && (
                      <button
                        onClick={() => handleRemove(contract)}
                        className="absolute top-2 right-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-ink-200 text-[11px] font-bold text-ink-600 hover:bg-red-100 hover:text-red-600 transition-colors"
                      >
                        ✕
                      </button>
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
                  <CommunityMarketCard key={contract.id} contract={contract} />
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
                  {pastVisible ? 'hide' : 'show'}
                </button>
              </Row>
              {pastVisible && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {pastResolved.map((contract) => (
                    <CommunityMarketCard key={contract.id} contract={contract} />
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
  officialGroupSlug: _officialGroupSlug,
}: {
  sportsLeague: string
  title: string
  emoji: string
  trackPageView: string
  communityDashboardSlug?: string
  competitionCode?: string
  officialGroupSlug?: string
}) {
  const [markets, setMarkets] = useState<SportsMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pastVisible, setPastVisible] = useState(false)
  const [activeTab, setActiveTab] = useState<'official' | 'community'>('official')
  const [communityCount, setCommunityCount] = useState<number | undefined>(undefined)

  useEffect(() => {
    if (!communityDashboardSlug) return
    api('get-dashboard-from-slug', { dashboardSlug: communityDashboardSlug } as any)
      .then((d: any) => {
        const count = (d?.items ?? []).filter((i: any) => i.type === 'question').length
        setCommunityCount(count)
      })
      .catch(() => setCommunityCount(0))
  }, [communityDashboardSlug])

  const isAdmin = useAdmin() || useDev()

  async function fetchMarkets() {
    try {
      const data = await api('admin-sports-markets', { sportsLeague })
      const mapped = (data.markets as ApiMarket[]).flatMap((m) => {
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
    const interval = setInterval(fetchMarkets, POLL_MS)
    return () => clearInterval(interval)
  }, [])

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
              onClick={() => setActiveTab('official')}
            >
              Official
            </SportsDashboardTabButton>
            <SportsDashboardTabButton
              active={activeTab === 'community'}
              count={communityCount}
              onClick={() => setActiveTab('community')}
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
              <p className="text-ink-400 text-sm">No markets found.</p>
            )}
          </>
        )}

      </Col>
    </Page>
  )
}
