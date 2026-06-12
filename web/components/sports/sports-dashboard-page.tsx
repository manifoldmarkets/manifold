import { useEffect, useMemo, useRef, useState } from 'react'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { JSONContent } from '@tiptap/core'
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
import { Dashboard, DashboardItem, DashboardTextItem } from 'common/dashboard'
import { Contract } from 'common/contract'
import { shortFormatNumber } from 'common/util/format'
import { ContractRow } from 'web/components/contract/contracts-table'
import {
  traderColumn,
  liquidityColumn,
  probColumn,
} from 'web/components/contract/contract-table-col-formats'
import { DashboardMarketCard } from 'web/components/dashboard/dashboard-market-card'
import { DashboardAddContract } from 'web/components/dashboard/dashboard-add-contract'
import clsx from 'clsx'
import dayjs from 'dayjs'
import { SportsMarket } from 'common/sports'
import { formatJustTime } from 'client-common/lib/time'
import toast from 'react-hot-toast'

import { SortKey, sortContracts } from 'web/lib/sort-contracts'
import {
  Content,
  TextEditor,
  useTextEditor,
} from 'web/components/widgets/editor'
import { JSONEmpty } from 'web/components/contract/contract-description'
import { XCircleIcon } from '@heroicons/react/solid'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/outline'
import { BackButton } from 'web/components/contract/back-button'
import { CopyLinkOrShareButton } from 'web/components/buttons/copy-link-button'
import { ENV_CONFIG } from 'common/envs/constants'
import { referralQuery } from 'common/util/share'
import { useSaveReferral } from 'web/hooks/use-save-referral'

// ─── Types ────────────────────────────────────────────────────────────────────

type DateSection = { label: string; matches: SportsMatch[] }

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

// Placeholder cards matching DashboardMarketCard's shell (340px, 2-col grid),
// shown while the community markets are loading.
function MarketCardSkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Col
          key={i}
          className="bg-canvas-50 border-ink-200 h-[340px] animate-pulse gap-3 rounded-xl border p-5"
        >
          <div className="bg-ink-200 h-3 w-1/3 rounded" />
          <div className="bg-ink-200 h-5 w-3/4 rounded" />
          <div className="bg-ink-100 flex-1 rounded" />
          <div className="bg-ink-200 h-8 w-full rounded" />
        </Col>
      ))}
    </div>
  )
}

function parseAnswerText(text: string): { flag: string; name: string } {
  const chars = [...text.trim()]
  const isRegionalIndicator = (c?: string) => {
    const cp = c?.codePointAt(0)
    return cp !== undefined && cp >= 0x1f1e6 && cp <= 0x1f1ff
  }
  if (isRegionalIndicator(chars[0]) && isRegionalIndicator(chars[1])) {
    const flag = chars[0] + chars[1]
    return { flag, name: text.trim().slice(flag.length).trim() }
  }
  return { flag: '', name: text.trim() }
}

// football-data live statuses (no HALF_TIME exists — the break is PAUSED).
const LIVE_STATUSES = new Set(['IN_PLAY', 'PAUSED'])
// Poller runs ~every 10s and pushes a FINISHED status when a match ends; this
// staleness floor is just a backstop for the initial render so a match that
// ended while nobody was watching doesn't show as live.
const LIVE_STALE_MS = 10 * 60 * 1000

function liveScoreFromMarket(
  m: SportsMarket
):
  | { home: number | null; away: number | null; minute: string | null }
  | undefined {
  if (m.resolution) return undefined
  if (!m.sportsLiveStatus || !LIVE_STATUSES.has(m.sportsLiveStatus))
    return undefined
  if (
    m.sportsLiveUpdatedTime == null ||
    Date.now() - m.sportsLiveUpdatedTime > LIVE_STALE_MS
  )
    return undefined
  return {
    home: m.sportsHomeScore,
    away: m.sportsAwayScore,
    minute: m.sportsLiveMinute,
  }
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
  const closeTimeMs =
    typeof kickoff === 'number' ? kickoff : new Date(kickoff).getTime()

  return {
    id: m.id,
    question: m.question,
    teamA: {
      name: a0.name,
      flag: a0.flag,
      prob: Math.round(m.answers[0].prob * 100),
    },
    teamB: {
      name: a1.name,
      flag: a1.flag,
      prob: Math.round(m.answers[1].prob * 100),
    },
    draw: { prob: drawAnswer ? Math.round(drawAnswer.prob * 100) : 0 },
    hasDraw: !!drawAnswer,
    closeTime: formatTime(kickoff),
    closeDateLabel: formatDateLabel(kickoff),
    closeTimeMs,
    resolutionTime: m.resolutionTime ?? null,
    finalScore:
      resolved && m.sportsHomeScore != null && m.sportsAwayScore != null
        ? {
            home: m.sportsHomeScore,
            away: m.sportsAwayScore,
            duration: m.sportsScoreDuration ?? undefined,
            pens:
              m.sportsPenHome != null && m.sportsPenAway != null
                ? { home: m.sportsPenHome, away: m.sportsPenAway }
                : undefined,
          }
        : undefined,
    liveScore: liveScoreFromMarket(m),
    volume: shortFormatNumber(m.volume),
    status: resolved ? 'resolved' : 'upcoming',
    winner,
    // Build the in-app path from username + slug (not m.url, which is the full
    // absolute URL) so SPA navigation + preview deployments work.
    marketUrl: `/${m.creatorUsername}/${m.slug}`,
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
  return Array.from(map.entries()).map(([label, ms]) => ({
    label,
    matches: ms,
  }))
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
  const [dashboard, setDashboard] = useState<Dashboard | null | undefined>(
    undefined
  )
  const [items, setItems] = useState<DashboardItem[]>([])
  const [sort, setSort] = useState<SortKey>('manual')
  const [showAdd, setShowAdd] = useState(false)
  const [pastVisible, setPastVisible] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [pollsExpanded, setPollsExpanded] = usePersistentLocalState(
    false,
    'sports-polls-expanded'
  )

  async function fetchDashboard() {
    try {
      const d = await api('get-dashboard-from-slug', {
        dashboardSlug: communityDashboardSlug,
      })
      setDashboard(d as Dashboard)
      const dashItems = (d as Dashboard).items ?? []
      setItems(dashItems)
      onCountChange?.(dashItems.filter((i) => i.type === 'question').length)
    } catch {
      setDashboard(null)
    }
  }

  useEffect(() => {
    fetchDashboard()
  }, [communityDashboardSlug])

  const questionSlugs = items
    .filter(
      (i): i is { type: 'question'; slug: string } => i.type === 'question'
    )
    .map((i) => i.slug)

  // undefined = first fetch still in flight; later re-fetches (after
  // add/remove/reorder) keep showing the previous contracts instead.
  const [contracts, setContracts] = useState<Contract[] | undefined>(undefined)

  useEffect(() => {
    // Until the dashboard itself has loaded, the empty slug list just means
    // "unknown" — don't mark contracts as loaded ([]), or the no-markets
    // state flashes before the real fetch even starts.
    if (dashboard === undefined) return
    if (questionSlugs.length === 0) {
      setContracts([])
      return
    }
    let cancelled = false
    getContracts(db, questionSlugs, 'slug').then(async (fetched) => {
      const ids = fetched.map((c) => c.id)
      const answersByContractId = await getAnswersForContracts(db, ids)
      for (const c of fetched) {
        // Merge answers for all cpmm-multi-1 markets (MC, NUMBER, MULTI_NUMERIC, DATE)
        // regardless of whether 'answers' is already in the data blob
        if ((c as any).mechanism === 'cpmm-multi-1') {
          ;(c as any).answers =
            answersByContractId[c.id] ?? (c as any).answers ?? []
        }
      }
      // Ignore a stale fetch that resolves after a newer slug set (rapid
      // reorder/add/remove) or after unmount.
      if (!cancelled) setContracts(fetched)
    })
    return () => {
      cancelled = true
    }
  }, [questionSlugs.join(','), dashboard === undefined])

  // Returns resolution timestamp, or null if still open.
  // For cpmm-multi-1 sports markets, waits until all answers are resolved.
  function contractResolvedAt(c: Contract): number | null {
    if (c.resolution && c.resolutionTime) return c.resolutionTime
    const answers = (c as any).answers as
      | Array<{ resolution?: string; resolutionTime?: number }>
      | undefined
    if (answers && answers.length > 0 && answers.every((a) => a.resolution)) {
      const latest = Math.max(...answers.map((a) => a.resolutionTime ?? 0))
      return latest || c.closeTime || null
    }
    return null
  }

  const contractsLoading = contracts === undefined
  const loadedContracts = contracts ?? []

  const now = Date.now()
  const polls = loadedContracts.filter((c) => c.outcomeType === 'POLL')
  const open = loadedContracts.filter(
    (c) => contractResolvedAt(c) === null && c.outcomeType !== 'POLL'
  )
  const recentResolved = loadedContracts.filter((c) => {
    const t = contractResolvedAt(c)
    return (
      t !== null && now - t < RECENT_THRESHOLD_MS && c.outcomeType !== 'POLL'
    )
  })
  const pastResolved = loadedContracts.filter((c) => {
    const t = contractResolvedAt(c)
    return (
      t !== null && now - t >= RECENT_THRESHOLD_MS && c.outcomeType !== 'POLL'
    )
  })

  // Report total items in this tab (open + resolved), matching the parent's
  // mount-time prefetch so the badge doesn't jump when the tab is first opened.
  // Skip while loading so we don't overwrite the prefetched count with 0.
  useEffect(() => {
    if (contracts) onCountChange?.(contracts.length)
  }, [contracts?.length])

  const sortedOpen = sortContracts(open, questionSlugs, sort)
  // Apply the same sort to the resolved sections so the toggle isn't silently
  // open-markets-only.
  const sortedRecent = sortContracts(recentResolved, questionSlugs, sort)
  const sortedPast = sortContracts(pastResolved, questionSlugs, sort)
  const existingSlugs = new Set(questionSlugs)

  async function onDragEnd(result: DropResult) {
    if (!result.destination || !dashboard) return
    const prevItems = items
    const newItems = [...items]
    const [removed] = newItems.splice(result.source.index, 1)
    newItems.splice(result.destination.index, 0, removed)
    setItems(newItems)
    try {
      await updateDashboard({
        dashboardId: dashboard.id,
        title: dashboard.title,
        items: newItems,
        topics: dashboard.topics ?? [],
      })
    } catch {
      // Revert the optimistic reorder if the save failed (matches handleRemove).
      setItems(prevItems)
      toast.error('Failed to save new order')
    }
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

  if (dashboard === undefined) return <MarketCardSkeletonGrid />

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
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700"
            >
              + Add market
            </button>
          </Row>
        )}
      </Row>

      {/* Not initialized hint for admins */}
      {dashboard === null && isAdmin && (
        <p className="text-ink-400 text-xs">
          No community dashboard yet — adding the first market will create it
          automatically.
        </p>
      )}

      {/* Markets still loading — don't flash the empty state */}
      {dashboard !== null && contractsLoading && <MarketCardSkeletonGrid />}

      {/* Open markets */}
      {dashboard !== null &&
        !contractsLoading &&
        polls.length === 0 &&
        sortedOpen.length === 0 &&
        recentResolved.length === 0 &&
        pastResolved.length === 0 && <CommunityEmptyState />}

      {dashboard !== null && polls.length > 0 && (
        <Col className="border-ink-200 rounded-xl border">
          <Row className="border-ink-200 items-center justify-between border-b px-4 py-3">
            <Row className="items-center gap-2">
              <span className="text-ink-700 text-sm font-bold">Polls</span>
              {!pollsExpanded && (
                <span className="text-ink-400 text-xs">({polls.length})</span>
              )}
            </Row>
            <button
              onClick={() => setPollsExpanded((e) => !e)}
              className="text-ink-400 hover:text-ink-600 transition-colors"
            >
              {pollsExpanded ? (
                <ChevronUpIcon className="h-4 w-4" />
              ) : (
                <ChevronDownIcon className="h-4 w-4" />
              )}
            </button>
          </Row>
          {pollsExpanded && (
            <Col className="divide-ink-100 divide-y">
              {polls.map((contract) => (
                <div key={contract.id} className="relative px-4">
                  {isAdmin && editMode && (
                    <button
                      onClick={() => handleRemove(contract)}
                      className="text-ink-500 hover:text-ink-700 absolute -top-2 right-0 z-10 transition-colors"
                      title="Remove from community tab"
                    >
                      <XCircleIcon className="h-5 w-5" />
                    </button>
                  )}
                  <ContractRow
                    contract={contract}
                    columns={[traderColumn, liquidityColumn, probColumn]}
                  />
                </div>
              ))}
            </Col>
          )}
        </Col>
      )}

      {dashboard !== null && (
        <>
          {sortedOpen.length > 0 &&
            (sort === 'manual' && isAdmin && editMode ? (
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
                                className="border-ink-400 bg-canvas-50 text-ink-500 hover:border-ink-600 hover:text-ink-700 absolute -left-2 -top-2 z-10 flex cursor-grab select-none items-center rounded border px-1.5 py-1"
                                title="Drag to reorder"
                              >
                                <span className="text-[15px] leading-none">
                                  ⠿
                                </span>
                              </div>
                              <button
                                onClick={() => handleRemove(contract)}
                                className="text-ink-500 hover:text-ink-700 absolute -right-2 -top-2 z-10 transition-colors"
                                title="Remove from community tab"
                              >
                                <XCircleIcon className="h-5 w-5" />
                              </button>
                              <DashboardMarketCard contract={contract} />
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
                        className="text-ink-500 hover:text-ink-700 absolute -top-2 right-0 z-10 transition-colors"
                        title="Remove from community tab"
                      >
                        <XCircleIcon className="h-5 w-5" />
                      </button>
                    )}
                    <DashboardMarketCard contract={contract} />
                  </div>
                ))}
              </div>
            ))}

          {recentResolved.length > 0 && (
            <Col className="border-ink-300 gap-3 border-t-2 pt-6">
              <Row className="items-center gap-2.5">
                <span className="text-ink-1000 text-base font-medium">
                  Recent
                </span>
                <span className="text-ink-500 text-xs">
                  {recentResolved.length} resolved
                </span>
              </Row>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {sortedRecent.map((contract) => (
                  <div key={contract.id} className="relative flex flex-col">
                    {isAdmin && editMode && (
                      <button
                        onClick={() => handleRemove(contract)}
                        className="text-ink-500 hover:text-ink-700 absolute -top-2 right-0 z-10 transition-colors"
                        title="Remove from community tab"
                      >
                        <XCircleIcon className="h-5 w-5" />
                      </button>
                    )}
                    <DashboardMarketCard contract={contract} />
                  </div>
                ))}
              </div>
            </Col>
          )}

          {pastResolved.length > 0 && (
            <Col className="border-ink-300 gap-3 border-t-2 pt-6">
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
                  {sortedPast.map((contract) => (
                    <div key={contract.id} className="relative flex flex-col">
                      {isAdmin && editMode && (
                        <button
                          onClick={() => handleRemove(contract)}
                          className="text-ink-500 hover:text-ink-700 absolute -top-2 right-0 z-10 transition-colors"
                          title="Remove from community tab"
                        >
                          <XCircleIcon className="h-5 w-5" />
                        </button>
                      )}
                      <DashboardMarketCard contract={contract} />
                    </div>
                  ))}
                </div>
              )}
            </Col>
          )}
        </>
      )}

      {showAdd && (
        <Modal
          open
          setOpen={(o) => {
            if (!o) setShowAdd(false)
          }}
          size="lg"
        >
          <Col
            className={clsx(
              MODAL_CLASS,
              'flex h-[70vh] flex-col !items-stretch'
            )}
          >
            <DashboardAddContract
              addQuestions={async (qs) => {
                const fetched = await getContracts(
                  db,
                  qs.map((q) => q.slug),
                  'slug'
                )
                for (const contract of fetched) {
                  await handleAdd(contract.id)
                }
                setShowAdd(false)
              }}
            />
          </Col>
        </Modal>
      )}
    </Col>
  )
}

// ─── Official description editor ─────────────────────────────────────────────

function OfficialDescEditor({
  initialContent,
  onSave,
  onCancel,
  saving,
}: {
  initialContent: JSONContent | undefined
  onSave: (content: JSONContent) => void
  onCancel: () => void
  saving: boolean
}) {
  const editor = useTextEditor({
    size: 'sm',
    placeholder: 'Add a description for this tournament…',
    defaultValue: initialContent,
    autofocus: true,
  })

  return (
    <Col className="gap-2">
      <TextEditor editor={editor} simple />
      <Row className="justify-end gap-2">
        <button
          onClick={onCancel}
          className="text-ink-500 hover:text-ink-700 text-xs transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => {
            if (editor) onSave(editor.getJSON())
          }}
          disabled={saving || !editor}
          className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </Row>
    </Col>
  )
}

// ─── Official description ─────────────────────────────────────────────────────
// Stored as a DashboardTextItem with this ID inside the community dashboard.
// CommunityTab never renders it (it only processes type === 'question' items).
const OFFICIAL_DESC_ITEM_ID = '__official_description__'

function descFromDashboard(d: Dashboard): JSONContent | undefined {
  const item = d.items.find(
    (i): i is DashboardTextItem =>
      i.type === 'text' && i.id === OFFICIAL_DESC_ITEM_ID
  )
  return item?.content as JSONContent | undefined
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
  const [activeTab, setActiveTab] = useState<'official' | 'community'>(
    'official'
  )
  const [communityCount, setCommunityCount] = useState<number | undefined>(
    undefined
  )
  const [descDashboard, setDescDashboard] = useState<Dashboard | null>(null)
  const [editingDesc, setEditingDesc] = useState(false)
  const [savingDesc, setSavingDesc] = useState(false)

  // scrollIntoView (not window.scrollTo) so this also works inside the iOS
  // page-scroll-container.
  const topRef = useRef<HTMLDivElement>(null)
  const recentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (router.isReady) {
      setActiveTab(router.query.tab === 'community' ? 'community' : 'official')
    }
  }, [router.isReady, router.query.tab])

  function handleTabChange(tab: 'official' | 'community') {
    setActiveTab(tab)
    router.replace({ query: { ...router.query, tab } }, undefined, {
      shallow: true,
    })
  }

  const isAdminOrMod = useAdminOrMod()
  const isDev = useDev()
  const isAdmin = isAdminOrMod || isDev
  const user = useUser()
  useSaveReferral(user)

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
        const dashboard = d as Dashboard
        const items = dashboard.items ?? []
        setCommunityCount(items.filter((i) => i.type === 'question').length)
        setDescDashboard(dashboard)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [communityDashboardSlug])

  // Live odds and live scores now arrive over websockets (per-card
  // subscriptions), so we no longer poll the endpoint for those. This is just a
  // low-frequency safety refetch to pick up state transitions the live feed
  // doesn't push to this list view — a market resolving, or a newly-created
  // market appearing — while any match is live or within ~4h of kickoff. Idle
  // otherwise and paused when the tab is hidden.
  const hasActiveMatch = markets.some(
    (m) =>
      !!m.liveScore ||
      (m.status === 'upcoming' &&
        Math.abs(m.closeTimeMs - Date.now()) < 4 * 60 * 60 * 1000)
  )
  useEffect(() => {
    if (!hasActiveMatch) return
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && !document.hidden) fetchMarkets()
    }, 120_000)
    return () => clearInterval(id)
  }, [hasActiveMatch])

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

  const officialDescription = useMemo(
    () => (descDashboard ? descFromDashboard(descDashboard) : ''),
    [descDashboard]
  )

  async function handleSaveDesc(content: JSONContent) {
    if (!descDashboard) return
    setSavingDesc(true)
    try {
      const otherItems = descDashboard.items.filter(
        (i) =>
          !(
            i.type === 'text' &&
            (i as DashboardTextItem).id === OFFICIAL_DESC_ITEM_ID
          )
      )
      const newItems: DashboardItem[] = [
        ...otherItems,
        ...(JSONEmpty(content)
          ? []
          : [
              {
                type: 'text' as const,
                id: OFFICIAL_DESC_ITEM_ID,
                content,
              } as DashboardTextItem,
            ]),
      ]
      await updateDashboard({
        dashboardId: descDashboard.id,
        title: descDashboard.title,
        items: newItems,
        topics: descDashboard.topics ?? [],
      })
      setDescDashboard({ ...descDashboard, items: newItems })
      setEditingDesc(false)
      toast.success('Description saved')
    } catch {
      toast.error('Failed to save description')
    } finally {
      setSavingDesc(false)
    }
  }

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
      <Col
        ref={topRef}
        className="mx-auto w-full max-w-5xl gap-8 px-4 py-6 sm:px-6"
      >
        {/* On mobile the title takes its own full-width line above the
            buttons (back/share/tabs); on sm+ everything sits in one row. */}
        <div className="border-ink-200 bg-canvas-0 sticky top-0 z-20 -mt-6 flex flex-wrap items-center gap-x-2 gap-y-3 border-b pb-5 pt-6">
          <Row className="order-1 w-full items-center gap-2 sm:order-2 sm:w-auto">
            <span className="text-2xl">{emoji}</span>
            <h1 className="text-ink-1000 text-xl font-medium tracking-tight">
              {title}
            </h1>
          </Row>
          <BackButton size="xs" className="order-2 -ml-2 shrink-0 sm:order-1" />
          {/* CopyLinkOrShareButton's className lands on the inner Button (it's
              wrapped in a Tooltip), so the order class needs its own wrapper. */}
          <div className="order-3">
            <CopyLinkOrShareButton
              url={`https://${ENV_CONFIG.domain}${router.pathname}${
                user?.username ? referralQuery(user.username) : ''
              }`}
              eventTrackingName="copy sports dashboard link"
              tooltip="Share"
              size="xs"
              className="text-ink-500 hover:text-ink-600"
            />
          </div>
          <Row className="order-4 ml-auto items-center gap-2">
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
        </div>

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
              <span className="text-ink-400 text-sm">
                Community markets coming soon
              </span>
            </Col>
          )
        ) : (
          <>
            {/* Official description — visible to all, editable by admins */}
            {((!!officialDescription && !JSONEmpty(officialDescription)) ||
              (isAdmin && descDashboard)) && (
              <Col className="-mt-4 gap-2">
                {!editingDesc ? (
                  <Row className="items-start gap-3">
                    {officialDescription && !JSONEmpty(officialDescription) && (
                      <div className="flex-1">
                        <Content content={officialDescription} size="sm" />
                      </div>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => setEditingDesc(true)}
                        className="text-ink-400 hover:text-ink-600 shrink-0 text-xs transition-colors"
                      >
                        {officialDescription && !JSONEmpty(officialDescription)
                          ? 'edit'
                          : '+ add description'}
                      </button>
                    )}
                  </Row>
                ) : (
                  <OfficialDescEditor
                    initialContent={
                      officialDescription as JSONContent | undefined
                    }
                    onSave={handleSaveDesc}
                    onCancel={() => setEditingDesc(false)}
                    saving={savingDesc}
                  />
                )}
              </Col>
            )}

            {loading && <LoadingIndicator />}
            {error && <p className="text-sm text-red-500">{error}</p>}

            {upcomingSections.length > 0 && recentResolved.length > 0 && (
              // -mb-5 pulls the following date section to within gap-3 of
              // this row, despite the page column's gap-8.
              <Row className="-mb-5">
                <button
                  onClick={() =>
                    recentRef.current?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start',
                    })
                  }
                  className="border-ink-200 text-ink-500 hover:bg-canvas-50 rounded border px-2 py-0.5 text-xs transition-colors"
                >
                  see resolved matches
                </button>
              </Row>
            )}

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
                  style={{
                    gridTemplateColumns:
                      'repeat(auto-fill, minmax(320px, 1fr))',
                  }}
                >
                  {matches.map((match) => (
                    <SportsMatchCard key={match.id} match={match} />
                  ))}
                </div>
              </Col>
            ))}

            {recentResolved.length > 0 && (
              <Col
                ref={recentRef}
                // Clear the sticky header (taller on mobile, where it wraps
                // to two lines) when scrolled to via the "see recent" button.
                className="scroll-mt-32 gap-3 sm:scroll-mt-24"
              >
                <Row className="items-center gap-2.5">
                  <span className="text-ink-1000 text-base font-medium">
                    Recent
                  </span>
                  <span className="text-ink-500 text-xs">
                    {recentResolved.length} resolved
                  </span>
                  <button
                    onClick={() =>
                      topRef.current?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start',
                      })
                    }
                    className="border-ink-200 text-ink-500 hover:bg-canvas-50 ml-auto rounded border px-2 py-0.5 text-xs transition-colors"
                  >
                    back to top
                  </button>
                </Row>
                <div
                  className="grid gap-3"
                  style={{
                    gridTemplateColumns:
                      'repeat(auto-fill, minmax(320px, 1fr))',
                  }}
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
                  <span className="text-ink-500 text-sm font-medium">
                    Past games
                  </span>
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
                <p className="text-ink-400 max-w-xs text-xs">
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
