import { ChevronDownIcon } from '@heroicons/react/solid'
import { useEffect, useState } from 'react'
import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Title } from 'web/components/widgets/title'
import { Button } from 'web/components/buttons/button'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Table } from 'web/components/widgets/table'
import { AlertBox } from 'web/components/widgets/alert-box'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import ShortToggle from 'web/components/widgets/short-toggle'
import { NoSEO } from 'web/components/NoSEO'
import { useAdmin, useDev } from 'web/hooks/use-admin'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { api, getSimilarGroupsToContract } from 'web/lib/api/api'
import { APIResponse } from 'common/api/schema'
import { ENV, ENV_CONFIG } from 'common/envs/constants'
import { MAX_GROUPS_PER_MARKET } from 'common/group'
import { slugify } from 'common/util/slugify'
import { TOURNAMENT_CONFIGS, TournamentConfig } from 'common/sports'
import { Flag } from 'web/components/sports/sports-match-card'
import clsx from 'clsx'

// ─── Types ───────────────────────────────────────────────────────────────────

type Fixture = APIResponse<'admin-sports-fixtures'>['fixtures'][number]
type Market = APIResponse<'sports-markets'>['markets'][number]
type CreateResult =
  APIResponse<'admin-sports-create-markets'>['results'][number]
type ResolveLogEntry = APIResponse<'admin-sports-resolve'>['log'][number]

const TOURNAMENTS = Object.values(TOURNAMENT_CONFIGS)

const STAGE_LABELS: Record<string, string> = {
  REGULAR_SEASON: 'Regular Season',
  GROUP_STAGE: 'Group Stage',
  LEAGUE_PHASE: 'League Phase',
  LAST_32: 'Round of 32',
  LAST_16: 'Round of 16',
  ROUND_OF_16: 'Round of 16',
  QUARTER_FINALS: 'Quarterfinal',
  SEMI_FINALS: 'Semifinal',
  THIRD_PLACE: 'Third Place',
  FINAL: 'Final',
}

const STATUS_COLORS: Record<string, string> = {
  created: 'text-green-600',
  'dry-run': 'text-blue-600',
  skipped: 'text-ink-400',
  error: 'text-red-600',
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}
function plusDays(date: string, n: number) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section(props: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(props.defaultOpen ?? true)
  return (
    <div className="border-ink-200 mb-6 rounded-lg border">
      <button
        onClick={() => setOpen((o) => !o)}
        className="bg-ink-50 hover:bg-ink-100 flex w-full items-center justify-between rounded-t-lg px-4 py-3 text-left"
      >
        <span className="text-ink-800 font-semibold">{props.title}</span>
        <span className="text-ink-400 text-sm">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="p-4">{props.children}</div>}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SportsAdminPage() {
  useRedirectIfSignedOut()
  const isAdmin = useAdmin() || useDev()

  const [tournament, setTournament] = useState<TournamentConfig>(TOURNAMENTS[0])

  // Tournament settings (persist to localStorage)
  const settingsKey = `sports_settings_${tournament.footballDataCode}`
  // How many extra tags actually fit: markets allow MAX_GROUPS_PER_MARKET topics
  // total, and the official + configured groups already consume some slots.
  const baseGroupCount =
    1 +
    (ENV === 'DEV'
      ? tournament.additionalGroupIds.dev
      : tournament.additionalGroupIds.prod
    ).length
  const maxExtraTags = Math.max(0, MAX_GROUPS_PER_MARKET - baseGroupCount)
  const [groupSlug, setGroupSlug] = useState(tournament.officialGroupSlug)
  const [dashboardUrl, setDashboardUrl] = useState(
    `${ENV_CONFIG.domain}${tournament.dashboardPath}`
  )
  const [customNote, setCustomNote] = useState('')
  const [stageTiers, setStageTiers] = useState<Record<string, number>>(
    tournament.stageLiquidityTiers as Record<string, number>
  )
  // Extra topic-group slugs every created market gets tagged with, on top of the
  // tournament's configured groups. Added manually or via the AI suggester.
  const [extraTags, setExtraTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [suggesting, setSuggesting] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(settingsKey)
      if (saved) {
        const s = JSON.parse(saved)
        if (s.groupSlug) setGroupSlug(s.groupSlug)
        if (s.dashboardUrl) setDashboardUrl(s.dashboardUrl)
        if (s.customNote !== undefined) setCustomNote(s.customNote)
        if (s.stageTiers) setStageTiers(s.stageTiers)
        if (Array.isArray(s.extraTags)) setExtraTags(s.extraTags)
      }
    } catch {}
  }, [settingsKey])

  function saveSettings() {
    localStorage.setItem(
      settingsKey,
      JSON.stringify({
        groupSlug,
        dashboardUrl,
        customNote,
        stageTiers,
        extraTags,
      })
    )
    alert('Settings saved.')
  }

  function addTag(slug: string) {
    const s = slugify(slug)
    if (!s || extraTags.includes(s)) return
    if (extraTags.length >= maxExtraTags) {
      alert(
        `Only ${maxExtraTags} extra tag(s) fit — markets allow ${MAX_GROUPS_PER_MARKET} ` +
          `topics total and ${baseGroupCount} are used by the official/configured groups.`
      )
      return
    }
    setExtraTags((t) => [...t, s])
  }

  async function suggestTags() {
    setSuggesting(true)
    try {
      // Reuse Manifold's topic suggester (embedding similarity) on a
      // representative match question for this tournament.
      const sample = `${sampleTeams.home} vs ${sampleTeams.away} [${tournament.shortLabel}]`
      const res = (await getSimilarGroupsToContract({ question: sample })) as {
        groups?: Array<{ slug: string }>
        error?: string
      }
      if (res.error) {
        alert(`Suggester error: ${res.error}`)
        return
      }
      // Drop any suggestion that's already the official group, then merge/dedup
      // and cap to the slots that fit (the rest of the topic budget is reserved
      // for the official + configured groups).
      const slugs = (res.groups ?? [])
        .map((g) => g.slug)
        .filter((s) => s !== tournament.officialGroupSlug)
      if (slugs.length === 0) {
        alert(
          'No matching topics found. The suggester ranks by topic activity ' +
            '(importance score), which is ~0 on dev, so it generally only ' +
            'returns results on prod. Add tags manually here for now.'
        )
      } else {
        const merged = Array.from(new Set([...extraTags, ...slugs]))
        if (merged.length > maxExtraTags) {
          alert(
            `Added the first ${maxExtraTags} tag(s) that fit (markets allow ` +
              `${MAX_GROUPS_PER_MARKET} topics; ${baseGroupCount} already used). ` +
              `Some suggestions were dropped.`
          )
        }
        setExtraTags(merged.slice(0, maxExtraTags))
      }
    } catch (e) {
      alert(
        `Suggestion failed: ${e instanceof Error ? e.message : 'Unknown error'}`
      )
    } finally {
      setSuggesting(false)
    }
  }

  // Fixtures state
  const [dateFrom, setDateFrom] = useState(todayStr())
  const [dateTo, setDateTo] = useState(plusDays(todayStr(), 14))
  const [stageFilter, setStageFilter] = useState<string>('ALL')
  const [dryRun, setDryRun] = useState(true)
  const [fixtures, setFixtures] = useState<Fixture[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [fixturesLoading, setFixturesLoading] = useState(false)
  const [fixturesError, setFixturesError] = useState<string | null>(null)

  // Creation state
  const [dryRunReviewed, setDryRunReviewed] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createResults, setCreateResults] = useState<CreateResult[]>([])
  const [groupStatus, setGroupStatus] = useState<{
    id: string
    created: boolean
    restricted: boolean
  } | null>(null)

  // Markets state
  const [markets, setMarkets] = useState<Market[]>([])
  const [marketsLoading, setMarketsLoading] = useState(false)
  const [marketFilter, setMarketFilter] = useState<string>('ALL')

  // Community markets state
  const [communitySearch, setCommunitySearch] = useState('')
  const [communityAllMarkets, setCommunityAllMarkets] = useState<
    Array<{
      id: string
      question: string
      slug: string
      outcomeType: string
      sportsEventId?: string
    }>
  >([])
  const [communitySearching, setCommunitySearching] = useState(false)
  const [communityAdding, setCommunityAdding] = useState<string | null>(null)
  // A topic (slug) the admin browses to find community markets to add. We never
  // default to the official match group — ms-official markets are strictly the
  // fixtures, which live on the official dashboard and are excluded here.
  const [communityTopicDraft, setCommunityTopicDraft] = useState('')
  const [communityTopicSlug, setCommunityTopicSlug] = useState('')
  const [communityInitStatus, setCommunityInitStatus] = useState<{
    groupId: string
    groupCreated: boolean
    dashboardId: string
  } | null>(null)
  const [communityIniting, setCommunityIniting] = useState(false)

  // Load the chosen topic's markets; filter client-side for substring matching.
  useEffect(() => {
    if (!isAdmin) return
    const slug = communityTopicSlug.trim()
    if (!slug) {
      setCommunityAllMarkets([])
      return
    }
    let cancelled = false
    setCommunitySearch('')
    setCommunitySearching(true)
    ;(
      api('search-markets', {
        topicSlug: slug,
        limit: 200,
        filter: 'all',
        sort: 'newest',
      } as any) as Promise<any[]>
    )
      .then((data) => {
        // Exclude the official match markets (they carry sportsEventId): those
        // are strictly fixtures shown on the official dashboard and must never be
        // added to a community dashboard. What's left is community-eligible.
        if (!cancelled)
          setCommunityAllMarkets(
            (data ?? []).filter((m: any) => !m.sportsEventId)
          )
      })
      .catch(() => {
        if (!cancelled) setCommunityAllMarkets([])
      })
      .finally(() => {
        if (!cancelled) setCommunitySearching(false)
      })
    return () => {
      cancelled = true
    }
  }, [communityTopicSlug, isAdmin])

  // Resolution state
  const [resolveLog, setResolveLog] = useState<ResolveLogEntry[]>([])
  const [resolving, setResolving] = useState(false)
  const [lastResolved, setLastResolved] = useState<string | null>(null)

  // Alerts: markets needing attention
  const alertMarkets = markets.filter((m) => m.needsAttention)
  const [handledAlerts, setHandledAlerts] = useState<Set<string>>(new Set())

  if (!isAdmin) return <></>

  async function fetchFixtures() {
    setFixturesLoading(true)
    setFixturesError(null)
    setDryRunReviewed(false)
    try {
      const data = await api('admin-sports-fixtures', {
        competitionCode: tournament.footballDataCode,
        dateFrom,
        dateTo,
        stage: stageFilter === 'ALL' ? undefined : stageFilter,
      })
      setFixtures(data.fixtures)
      setSelectedIds(
        new Set(
          data.fixtures
            .filter(
              (f) =>
                !f.existingMarketId && ['SCHEDULED', 'TIMED'].includes(f.status)
            )
            .map((f) => f.id)
        )
      )
    } catch (e: unknown) {
      setFixturesError(
        e instanceof Error ? e.message : 'Failed to fetch fixtures'
      )
    } finally {
      setFixturesLoading(false)
    }
  }

  async function fetchMarkets() {
    setMarketsLoading(true)
    try {
      const data = await api('sports-markets', {
        sportsLeague: tournament.sportsLeague,
      })
      setMarkets(data.markets)
    } catch {}
    setMarketsLoading(false)
  }

  async function runCreate() {
    if (selectedIds.size === 0) return
    setCreating(true)
    setCreateResults([])
    try {
      const data = await api('admin-sports-create-markets', {
        competitionCode: tournament.footballDataCode,
        matchIds: [...selectedIds],
        dryRun,
        customNote: customNote || undefined,
        dashboardUrl: dashboardUrl || undefined,
        liquidityTierOverrides: stageTiers,
        extraGroupSlugs: extraTags.length > 0 ? extraTags : undefined,
      })
      setCreateResults(data.results)
      setGroupStatus({
        id: data.groupId,
        created: data.groupCreated,
        restricted: data.groupRestricted,
      })
      if (!dryRun) {
        setDryRunReviewed(false)
        await fetchMarkets()
      } else {
        setDryRunReviewed(true)
      }
    } catch (e: unknown) {
      alert(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`)
    } finally {
      setCreating(false)
    }
  }

  async function runResolve() {
    setResolving(true)
    try {
      const data = await api('admin-sports-resolve', {
        competitionCode: tournament.footballDataCode,
      })
      setResolveLog(data.log)
      setLastResolved(new Date().toLocaleString())
      await fetchMarkets()
    } catch (e: unknown) {
      alert(
        `Resolution error: ${e instanceof Error ? e.message : 'Unknown error'}`
      )
    } finally {
      setResolving(false)
    }
  }

  function onCommunitySearch(val: string) {
    setCommunitySearch(val)
  }

  const communityResults = communitySearch.trim()
    ? communityAllMarkets.filter((m) =>
        m.question.toLowerCase().includes(communitySearch.toLowerCase())
      )
    : communityAllMarkets

  async function addCommunityMarket(contractId: string) {
    setCommunityAdding(contractId)
    try {
      await api('admin-sports-community-market', {
        competitionCode: tournament.footballDataCode,
        contractId,
        action: 'add',
      })
      alert('Market added to community tab.')
    } catch (e: unknown) {
      alert(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`)
    } finally {
      setCommunityAdding(null)
    }
  }

  async function removeCommunityMarket(contractId: string) {
    if (!confirm('Remove this market from the community tab?')) return
    try {
      await api('admin-sports-community-market', {
        competitionCode: tournament.footballDataCode,
        contractId,
        action: 'remove',
      })
      alert('Market removed.')
    } catch (e: unknown) {
      alert(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`)
    }
  }

  async function initCommunity() {
    setCommunityIniting(true)
    try {
      const result = await api('admin-sports-init-community', {
        competitionCode: tournament.footballDataCode,
      })
      setCommunityInitStatus(result)
    } catch (e: unknown) {
      alert(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`)
    } finally {
      setCommunityIniting(false)
    }
  }

  // New, creatable fixtures — same predicate as the initial auto-select, so
  // "Select all" can't pick up POSTPONED/non-scheduled rows the user is shown
  // as greyed-out.
  const selectableFixtures = fixtures.filter(
    (f) => !f.existingMarketId && ['SCHEDULED', 'TIMED'].includes(f.status)
  )

  const filteredMarkets =
    marketFilter === 'ALL'
      ? markets
      : marketFilter === 'NEEDS_ATTENTION'
      ? markets.filter((m) => m.needsAttention)
      : marketFilter === 'RESOLVED'
      ? markets.filter((m) => m.resolution)
      : markets.filter((m) => !m.resolution)

  // Description preview — uses tournament-specific sample teams
  const sampleTeams =
    tournament.footballDataCode === 'CL'
      ? {
          home: 'Arsenal FC',
          away: 'Club Atlético de Madrid',
          stage: 'SF',
          date: 'Tue, 05 May 2026 19:00:00 UTC',
        }
      : {
          home: 'Brazil',
          away: 'Argentina',
          stage: 'Group E',
          date: 'Thu, 02 Jul 2026 19:00:00 UTC',
        }
  const sampleDashboardHref = dashboardUrl
    ? (() => {
        try {
          const u = new URL(
            dashboardUrl.startsWith('/') || dashboardUrl.startsWith('http')
              ? dashboardUrl
              : `https://${dashboardUrl}`
          )
          return u.pathname + u.search + u.hash
        } catch {
          return dashboardUrl.startsWith('/')
            ? dashboardUrl
            : `/${dashboardUrl}`
        }
      })()
    : null
  const sampleDesc = [
    `**${sampleTeams.home} vs ${sampleTeams.away} · ${sampleTeams.stage} · Kickoff ${sampleTeams.date}**`,
    `*Resolves to the winning team or draw (90 min regulation).*`,
    customNote || '[Your custom tournament note will appear here]',
    'This market resolves automatically after the match concludes based on official results.',
    sampleDashboardHref
      ? `[Visit the ${tournament.name} Dashboard](${sampleDashboardHref})`
      : '',
    `Created and managed by [@ManifoldSports](https://${ENV_CONFIG.domain}/ManifoldSports)`,
  ]
    .filter((l) => l !== undefined && l !== '')
    .join('\n\n\n')

  return (
    <Page trackPageView={'sports admin page'}>
      <NoSEO />
      <div className="mx-auto max-w-5xl px-4 pb-16">
        <Title>Sports Admin</Title>

        <div className="border-ink-200 bg-ink-50 text-ink-600 mb-6 rounded-lg border p-4 text-sm">
          <p className="text-ink-800 mb-1 font-medium">How this works</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              Markets are created <strong>automatically</strong> by the
              7&nbsp;AM&nbsp;UTC <code>sports-create-markets</code> cron (7-day
              lookahead), owned by <strong>@ManifoldSports</strong>. Use this
              panel to <strong>preview</strong> (dry-run), create on demand, or
              customize tags / tiers / the description.
            </li>
            <li>
              Odds and live scores update in real time on the dashboard; matches{' '}
              <strong>auto-resolve ~10s after full time</strong> (15-min
              backstop).
            </li>
            <li>
              Each market is tagged into the official group + any extra topics
              you set below, with all native columns populated (feed ranking,
              search, personalized feeds all work).
            </li>
          </ul>
        </div>

        {/* ── 1. Tournament Selector ── */}
        <Section title="1. Tournament" defaultOpen>
          <Row className="flex-wrap items-end gap-4">
            <Col className="gap-1">
              <label className="text-ink-600 text-xs font-medium">
                Tournament
              </label>
              <div className="relative">
                <select
                  value={tournament.footballDataCode}
                  onChange={(e) => {
                    const t = TOURNAMENTS.find(
                      (t) => t.footballDataCode === e.target.value
                    )
                    if (t) {
                      setTournament(t)
                      setGroupSlug(t.officialGroupSlug)
                      setDashboardUrl(`${ENV_CONFIG.domain}${t.dashboardPath}`)
                      setStageTiers(
                        t.stageLiquidityTiers as Record<string, number>
                      )
                      setCustomNote('')
                      setExtraTags([])
                      setFixtures([])
                      setMarkets([])
                      setCreateResults([])
                    }
                  }}
                  className="border-ink-300 bg-canvas-0 text-ink-900 w-full appearance-none rounded border px-3 py-2 pr-8 text-sm"
                >
                  {TOURNAMENTS.map((t) => (
                    <option key={t.footballDataCode} value={t.footballDataCode}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <ChevronDownIcon className="text-ink-400 pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2" />
              </div>
            </Col>
            <Col className="text-ink-500 gap-0.5 text-xs">
              <span>
                {tournament.startDate} → {tournament.endDate}
              </span>
              <span className="font-mono">{tournament.footballDataCode}</span>
            </Col>
          </Row>
        </Section>

        {/* ── 2. Tournament Settings ── */}
        <Section title="2. Tournament Settings">
          <Col className="gap-5">
            {/* Tag + group status */}
            <Col className="gap-1.5">
              <label className="text-ink-700 text-sm font-medium">
                Official group tag
              </label>
              <Row className="gap-2">
                <input
                  type="text"
                  value={groupSlug}
                  onChange={(e) => setGroupSlug(e.target.value)}
                  placeholder="ms-official-wc2026"
                  className="border-ink-300 bg-canvas-0 text-ink-900 w-72 rounded border px-3 py-1.5 font-mono text-sm"
                />
              </Row>
              <p className="text-ink-400 text-xs">
                Convention: <code>ms-official-[tournament]-[year]</code>. Group
                is auto-created as curated (admin-restricted) on first creation
                run.
              </p>
              {groupStatus && (
                <span
                  className={clsx(
                    'mt-1 text-xs font-medium',
                    groupStatus.restricted
                      ? 'text-green-600'
                      : 'text-yellow-600'
                  )}
                >
                  {groupStatus.created
                    ? `✅ Group created (${groupStatus.id}) — admin-restricted`
                    : groupStatus.restricted
                    ? `✅ Group exists and restricted (${groupStatus.id})`
                    : `⚠️ Group exists but will be restricted on next run`}
                </span>
              )}
            </Col>

            {/* Dashboard URL */}
            <Col className="gap-1.5">
              <label className="text-ink-700 text-sm font-medium">
                Dashboard URL
              </label>
              <input
                type="text"
                value={dashboardUrl}
                onChange={(e) => setDashboardUrl(e.target.value)}
                placeholder="manifold.markets/dashboard/ms-official-wc2026"
                className="border-ink-300 bg-canvas-0 text-ink-900 w-full max-w-lg rounded border px-3 py-1.5 text-sm"
              />
              <p className="text-ink-400 text-xs">
                Auto-appended to every market description.
              </p>
            </Col>

            {/* Custom note */}
            <Col className="gap-1.5">
              <label className="text-ink-700 text-sm font-medium">
                Custom tournament note
              </label>
              <p className="text-ink-400 text-xs">
                Tokens available:{' '}
                <code className="bg-ink-100 rounded px-1 text-xs">
                  {'{team1}'} {'{team2}'} {'{kickoff}'} {'{stage}'}{' '}
                  {'{dashboard_url}'}
                </code>
                . Written once, appears in all market descriptions.
              </p>
              <textarea
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                rows={3}
                placeholder="e.g. 48 teams, 104 matches, 3 host nations (USA, Canada, Mexico). This is the first ever World Cup with a 48-team format."
                className="border-ink-300 bg-canvas-0 text-ink-900 w-full rounded border px-3 py-2 text-sm"
              />
            </Col>

            {/* Description preview */}
            <Col className="gap-1.5">
              <label className="text-ink-700 text-sm font-medium">
                Description preview
              </label>
              <pre className="bg-ink-50 border-ink-200 text-ink-600 whitespace-pre-wrap rounded border p-3 text-xs leading-relaxed">
                {sampleDesc}
              </pre>
            </Col>

            {/* Extra topic tags */}
            <Col className="gap-1.5">
              <label className="text-ink-700 text-sm font-medium">
                Extra topic tags ({extraTags.length}/{maxExtraTags})
              </label>
              <p className="text-ink-400 text-xs">
                Markets are always tagged with the official group{' '}
                <code className="bg-ink-100 rounded px-1 text-xs">
                  {tournament.officialGroupSlug}
                </code>
                . Add extra topic slugs here (e.g.{' '}
                <code className="bg-ink-100 rounded px-1 text-xs">soccer</code>)
                to surface them in those feeds too. Unknown slugs are ignored.
                Markets allow {MAX_GROUPS_PER_MARKET} topics total, and{' '}
                {baseGroupCount} are used by the official/configured groups, so
                up to <strong>{maxExtraTags}</strong> extra tag(s) fit.
              </p>
              <Row className="flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addTag(tagInput)
                      setTagInput('')
                    }
                  }}
                  placeholder="add a topic slug…"
                  className="border-ink-300 bg-canvas-0 text-ink-900 w-56 rounded border px-3 py-1.5 font-mono text-sm"
                />
                <Button
                  size="sm"
                  color="gray-outline"
                  disabled={extraTags.length >= maxExtraTags}
                  onClick={() => {
                    addTag(tagInput)
                    setTagInput('')
                  }}
                >
                  Add
                </Button>
                <Button
                  size="sm"
                  color="indigo"
                  onClick={suggestTags}
                  disabled={suggesting || extraTags.length >= maxExtraTags}
                >
                  {suggesting ? 'Suggesting…' : '✨ Suggest with AI'}
                </Button>
              </Row>
              {extraTags.length > 0 && (
                <Row className="flex-wrap gap-1.5">
                  {extraTags.map((slug) => (
                    <span
                      key={slug}
                      className="bg-ink-100 text-ink-700 flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-xs"
                    >
                      {slug}
                      <button
                        onClick={() =>
                          setExtraTags((t) => t.filter((x) => x !== slug))
                        }
                        className="text-ink-400 font-bold leading-none hover:text-red-600"
                        title="Remove tag"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </Row>
              )}
            </Col>

            {/* Liquidity tiers per stage */}
            <Col className="gap-2">
              <label className="text-ink-700 text-sm font-medium">
                Liquidity tiers (mana)
              </label>
              <p className="text-ink-400 text-xs">
                Valid Manifold tiers: 100 · 1,000 · 10,000 · 100,000
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {Object.entries(STAGE_LABELS).map(([code, label]) => (
                  <Col key={code} className="gap-1">
                    <label className="text-ink-500 text-xs">{label}</label>
                    <input
                      type="number"
                      value={stageTiers[code] ?? 1000}
                      onChange={(e) =>
                        setStageTiers((t) => ({
                          ...t,
                          [code]: parseInt(e.target.value) || 1000,
                        }))
                      }
                      className="border-ink-300 bg-canvas-0 text-ink-900 w-full rounded border px-2 py-1 text-sm"
                    />
                  </Col>
                ))}
              </div>
            </Col>

            <Row>
              <Button size="sm" onClick={saveSettings}>
                Save settings
              </Button>
            </Row>
          </Col>
        </Section>

        {/* ── 3. Match Preview Panel ── */}
        <Section title="3. Match Preview &amp; Creation" defaultOpen>
          <Col className="gap-4">
            {/* Controls */}
            <Row className="flex-wrap items-end gap-4">
              <Col className="gap-1">
                <label className="text-ink-600 text-xs">Date from</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    const next = e.target.value
                    setDateFrom(next)
                    if (next > dateTo) setDateTo(plusDays(next, 7))
                  }}
                  className="border-ink-300 bg-canvas-0 text-ink-900 rounded border px-2 py-1.5 text-sm"
                />
              </Col>
              <Col className="gap-1">
                <label className="text-ink-600 text-xs">Date to</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="border-ink-300 bg-canvas-0 text-ink-900 rounded border px-2 py-1.5 text-sm"
                />
              </Col>
              <Col className="gap-1">
                <label className="text-ink-600 text-xs">Stage</label>
                <select
                  value={stageFilter}
                  onChange={(e) => setStageFilter(e.target.value)}
                  className="border-ink-300 bg-canvas-0 text-ink-900 rounded border px-2 py-1.5 text-sm"
                >
                  <option value="ALL">All stages</option>
                  {Object.entries(STAGE_LABELS).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              </Col>
              <Row className="items-center gap-2">
                <span className="text-ink-600 text-xs">Dry run</span>
                <ShortToggle
                  on={dryRun}
                  setOn={(v) => {
                    setDryRun(v)
                    setDryRunReviewed(false)
                  }}
                />
                {dryRun && (
                  <span className="text-xs font-medium text-blue-600">ON</span>
                )}
              </Row>
              <Button
                size="sm"
                onClick={fetchFixtures}
                disabled={fixturesLoading}
              >
                {fixturesLoading ? 'Fetching…' : 'Fetch games'}
              </Button>
            </Row>

            {fixturesError && (
              <AlertBox title="Error fetching games">{fixturesError}</AlertBox>
            )}

            {fixtures.length > 0 && (
              <>
                {/* Select all */}
                <Row className="items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={
                      selectableFixtures.length > 0 &&
                      selectableFixtures.every((f) => selectedIds.has(f.id))
                    }
                    onChange={(e) => {
                      setSelectedIds(
                        e.target.checked
                          ? new Set(selectableFixtures.map((f) => f.id))
                          : new Set()
                      )
                    }}
                  />
                  <span className="text-ink-600">
                    Select all ({selectedIds.size} selected /{' '}
                    {selectableFixtures.length} new)
                  </span>
                </Row>

                <div className="overflow-x-auto">
                  <Table>
                    <thead>
                      <tr>
                        <th />
                        <th>Home</th>
                        <th>Away</th>
                        <th>Kickoff (UTC)</th>
                        <th>Stage</th>
                        <th>Close</th>
                        <th>Liquidity</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fixtures.map((f) => (
                        <tr
                          key={f.id}
                          className={clsx(
                            f.existingMarketId && 'opacity-50',
                            f.status === 'POSTPONED' && 'opacity-40'
                          )}
                        >
                          <td>
                            <input
                              type="checkbox"
                              disabled={!!f.existingMarketId}
                              checked={selectedIds.has(f.id)}
                              onChange={(e) => {
                                setSelectedIds((prev) => {
                                  const next = new Set(prev)
                                  e.target.checked
                                    ? next.add(f.id)
                                    : next.delete(f.id)
                                  return next
                                })
                              }}
                            />
                          </td>
                          <td>
                            <span className="inline-flex items-center gap-1">
                              <Flag emoji={f.homeFlag} />
                              {f.homeTeam.name}
                            </span>
                          </td>
                          <td>
                            <span className="inline-flex items-center gap-1">
                              <Flag emoji={f.awayFlag} />
                              {f.awayTeam.name}
                            </span>
                          </td>
                          <td className="text-xs">
                            {new Date(f.utcDate).toLocaleString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                              timeZone: 'UTC',
                            })}{' '}
                            UTC
                          </td>
                          <td className="text-xs">{f.stageLabel}</td>
                          <td className="text-xs">
                            {new Date(f.closeTime).toLocaleString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                              timeZone: 'UTC',
                            })}{' '}
                            UTC
                          </td>
                          <td className="text-xs">
                            {f.liquidityTier.toLocaleString()}
                          </td>
                          <td className="text-xs">
                            {f.existingMarketId ? (
                              <span className="text-ink-400">exists</span>
                            ) : f.status === 'POSTPONED' ? (
                              <span className="text-yellow-600">postponed</span>
                            ) : (
                              <span className="text-green-600">
                                will create
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>

                {/* Create button */}
                <Row className="items-center gap-3">
                  <Button
                    color={dryRun ? 'blue' : 'green'}
                    disabled={
                      creating ||
                      selectedIds.size === 0 ||
                      (!dryRun && !dryRunReviewed)
                    }
                    onClick={runCreate}
                  >
                    {creating ? (
                      <Row className="gap-2">
                        <LoadingIndicator size="sm" /> Creating…
                      </Row>
                    ) : dryRun ? (
                      `Preview ${selectedIds.size} markets (dry run)`
                    ) : (
                      `Create ${selectedIds.size} markets`
                    )}
                  </Button>
                  {!dryRun && !dryRunReviewed && (
                    <span className="text-ink-500 text-xs">
                      Run a dry run first, then toggle dry run off to create.
                    </span>
                  )}
                </Row>
                <span className="text-ink-500 text-xs">
                  Markets are created and published as{' '}
                  <strong>@ManifoldSports</strong>.
                </span>

                {/* Creation log */}
                {createResults.length > 0 && (
                  <Col className="gap-1">
                    <p className="text-ink-600 text-sm font-medium">
                      {dryRun ? 'Dry run preview' : 'Creation log'} (
                      {createResults.length} items)
                    </p>
                    <div className="bg-ink-50 border-ink-200 max-h-64 overflow-y-auto rounded border p-3">
                      {createResults.map((r, i) => (
                        <Row key={i} className="gap-2 py-0.5 text-xs">
                          <span
                            className={clsx(
                              'w-16 shrink-0 font-medium',
                              STATUS_COLORS[r.status]
                            )}
                          >
                            {r.status}
                          </span>
                          <span className="text-ink-700 truncate">
                            {r.question}
                          </span>
                          {r.reason && (
                            <span className="text-ink-400 shrink-0">
                              — {r.reason}
                            </span>
                          )}
                        </Row>
                      ))}
                    </div>
                    {dryRun && (
                      <Row className="mt-2 items-center gap-2">
                        <Button
                          size="sm"
                          color="green"
                          onClick={() => {
                            setDryRunReviewed(true)
                            setDryRun(false)
                          }}
                        >
                          Looks good — switch to live mode
                        </Button>
                        <span className="text-ink-400 text-xs">
                          Toggle dry run off and click Create to proceed.
                        </span>
                      </Row>
                    )}
                  </Col>
                )}
              </>
            )}
          </Col>
        </Section>

        {/* ── 4. Market Status Monitor ── */}
        <Section title="4. Market Status">
          <Col className="gap-3">
            <Row className="items-center gap-3">
              <ChoicesToggleGroup
                currentChoice={marketFilter}
                choicesMap={{
                  All: 'ALL',
                  Open: 'OPEN',
                  Resolved: 'RESOLVED',
                  'Needs attention': 'NEEDS_ATTENTION',
                }}
                setChoice={(v) => setMarketFilter(v as string)}
                color="indigo-dark"
              />
              <Button size="sm" color="gray-outline" onClick={fetchMarkets}>
                {marketsLoading ? 'Loading…' : 'Refresh'}
              </Button>
            </Row>

            {alertMarkets.length > 0 && (
              <AlertBox
                title={`${alertMarkets.length} market(s) need attention`}
              >
                Past close time and unresolved — check the Alerts section below.
              </AlertBox>
            )}

            {marketsLoading ? (
              <LoadingIndicator />
            ) : filteredMarkets.length === 0 ? (
              <p className="text-ink-400 text-sm">
                {markets.length === 0
                  ? 'No markets found. Click Refresh to load.'
                  : 'No markets match this filter.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <thead>
                    <tr>
                      <th>Market</th>
                      <th>Close (UTC)</th>
                      <th>Status</th>
                      <th>Resolved to</th>
                      <th>Volume</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMarkets.map((m) => (
                      <tr
                        key={m.id}
                        className={clsx(m.needsAttention && 'bg-red-50')}
                      >
                        <td>
                          <a
                            href={m.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary-600 hover:underline"
                          >
                            {m.question}
                          </a>
                          {m.needsAttention && (
                            <span className="ml-2 text-xs font-medium text-red-600">
                              ⚠ overdue
                            </span>
                          )}
                        </td>
                        <td className="text-xs">
                          {new Date(m.closeTime).toLocaleString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZone: 'UTC',
                          })}
                        </td>
                        <td className="text-xs">
                          {m.resolution ? (
                            <span className="text-green-600">resolved</span>
                          ) : (
                            <span className="text-blue-600">open</span>
                          )}
                        </td>
                        <td className="text-xs">{m.resolvedAnswer ?? '—'}</td>
                        <td className="text-xs">{m.volume.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </Col>
        </Section>

        {/* ── 5. Resolution Monitor ── */}
        <Section title="5. Resolution Monitor">
          <Col className="gap-4">
            <Row className="flex-wrap items-center gap-4 text-sm">
              <Col className="gap-0.5">
                <span className="text-ink-500 text-xs">
                  Last manual resolve
                </span>
                <span className="font-medium">{lastResolved ?? 'Never'}</span>
              </Col>
              <Col className="gap-0.5">
                <span className="text-ink-500 text-xs">Auto-resolution</span>
                <span className="font-medium">
                  ~10s after full time (live poller) · 15-min backstop cron
                </span>
              </Col>
            </Row>

            <span className="text-ink-400 text-xs">
              Markets resolve automatically: the live poller resolves a match
              within ~10s of the final whistle, and the{' '}
              <code>sports-resolve</code> cron sweeps every 15 min as a
              backstop. Use the button below only to force a sweep now.
            </span>

            <Row className="items-center gap-3">
              <Button color="indigo" onClick={runResolve} disabled={resolving}>
                {resolving ? (
                  <Row className="gap-2">
                    <LoadingIndicator size="sm" /> Resolving…
                  </Row>
                ) : (
                  'Run resolver now'
                )}
              </Button>
              <span className="text-ink-400 text-xs">
                Fetches finished matches from football-data.org and resolves any
                matching open markets.
              </span>
            </Row>

            {resolveLog.length > 0 && (
              <Col className="gap-1">
                <p className="text-ink-600 text-sm font-medium">
                  Resolution log ({resolveLog.length} items)
                </p>
                <div className="bg-ink-50 border-ink-200 max-h-64 overflow-y-auto rounded border p-3">
                  {resolveLog.map((entry, i) => (
                    <Row key={i} className="gap-2 py-0.5 text-xs">
                      <span
                        className={clsx(
                          'w-16 shrink-0 font-medium',
                          entry.status === 'resolved'
                            ? 'text-green-600'
                            : entry.status === 'error'
                            ? 'text-red-600'
                            : 'text-ink-400'
                        )}
                      >
                        {entry.status}
                      </span>
                      <span className="text-ink-700 flex-1 truncate">
                        {entry.question}
                      </span>
                      <span className="text-ink-500 shrink-0">
                        {entry.result}
                      </span>
                    </Row>
                  ))}
                </div>
              </Col>
            )}
          </Col>
        </Section>

        {/* ── 6. Alerts ── */}
        <Section
          title={`6. Alerts${
            alertMarkets.length > 0
              ? ` (${
                  alertMarkets.filter((m) => !handledAlerts.has(m.id)).length
                } active)`
              : ''
          }`}
        >
          <Col className="gap-3">
            {alertMarkets.filter((m) => !handledAlerts.has(m.id)).length ===
            0 ? (
              <p className="text-sm text-green-600">✅ No active alerts.</p>
            ) : (
              alertMarkets
                .filter((m) => !handledAlerts.has(m.id))
                .map((m) => (
                  <Row
                    key={m.id}
                    className="items-start justify-between rounded border border-red-200 bg-red-50 p-3"
                  >
                    <Col className="gap-1">
                      <span className="text-sm font-medium text-red-700">
                        ⚠ Unresolved past close time
                      </span>
                      <a
                        href={m.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary-600 text-sm hover:underline"
                      >
                        {m.question}
                      </a>
                      <span className="text-ink-500 text-xs">
                        Closed:{' '}
                        {new Date(m.closeTime).toLocaleString('en-GB', {
                          timeZone: 'UTC',
                        })}{' '}
                        UTC
                      </span>
                    </Col>
                    <Button
                      size="xs"
                      color="gray-outline"
                      onClick={() =>
                        setHandledAlerts((prev) => new Set([...prev, m.id]))
                      }
                    >
                      Mark handled
                    </Button>
                  </Row>
                ))
            )}

            {/* Handled alerts (collapsed) */}
            {handledAlerts.size > 0 && (
              <details className="text-ink-400 text-xs">
                <summary className="cursor-pointer">
                  {handledAlerts.size} handled alert(s)
                </summary>
                <Col className="mt-2 gap-1">
                  {alertMarkets
                    .filter((m) => handledAlerts.has(m.id))
                    .map((m) => (
                      <span key={m.id} className="line-through">
                        {m.question}
                      </span>
                    ))}
                </Col>
              </details>
            )}
          </Col>
        </Section>

        {/* ── 7. Community Markets ── */}
        <Section title="7. Community Markets">
          <Col className="gap-4">
            <Row className="flex-wrap items-start justify-between gap-3">
              <p className="text-ink-500 text-sm">
                Browse a topic to find community markets to add to the{' '}
                <strong>{tournament.name}</strong> community dashboard (and tag
                with{' '}
                <code className="bg-ink-100 rounded px-1 text-xs">
                  {tournament.communityGroupSlug}
                </code>
                ). The official match markets are excluded — they live only on
                the official dashboard and are never added here.
              </p>
              <Col className="gap-1">
                <Button
                  size="sm"
                  color="gray-outline"
                  onClick={initCommunity}
                  disabled={communityIniting}
                >
                  {communityIniting
                    ? 'Setting up…'
                    : 'Set up community group + dashboard'}
                </Button>
                {communityInitStatus && (
                  <span className="text-xs text-green-600">
                    ✅{' '}
                    {communityInitStatus.groupCreated
                      ? 'Group created'
                      : 'Group already existed'}{' '}
                    · ID {communityInitStatus.groupId.slice(0, 8)}…
                  </span>
                )}
              </Col>
            </Row>

            <Row className="flex-wrap items-end gap-4">
              <Col className="gap-1">
                <label className="text-ink-600 text-xs">
                  Browse a topic (slug) for community markets
                </label>
                <Row className="gap-2">
                  <input
                    type="text"
                    value={communityTopicDraft}
                    onChange={(e) => setCommunityTopicDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        setCommunityTopicSlug(slugify(communityTopicDraft))
                      }
                    }}
                    placeholder="e.g. soccer, world-cup-predictions…"
                    className="border-ink-300 bg-canvas-0 text-ink-900 w-72 rounded border px-3 py-1.5 font-mono text-sm"
                  />
                  <Button
                    size="sm"
                    color="gray-outline"
                    onClick={() =>
                      setCommunityTopicSlug(
                        communityTopicDraft.trim().toLowerCase()
                      )
                    }
                  >
                    Browse
                  </Button>
                </Row>
              </Col>
              {communityTopicSlug && (
                <Col className="gap-1">
                  <label className="text-ink-600 text-xs">
                    Filter results by title
                  </label>
                  <input
                    type="text"
                    value={communitySearch}
                    onChange={(e) => onCommunitySearch(e.target.value)}
                    placeholder="Filter by title…"
                    className="border-ink-300 bg-canvas-0 text-ink-900 w-56 rounded border px-3 py-1.5 text-sm"
                  />
                </Col>
              )}
              {communitySearching && (
                <LoadingIndicator size="sm" className="self-end pb-2" />
              )}
            </Row>

            {communityResults.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <thead>
                    <tr>
                      <th>Market</th>
                      <th>Type</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {communityResults.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <a
                            href={`https://${ENV_CONFIG.domain}/${m.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary-600 hover:underline"
                          >
                            {m.question}
                          </a>
                        </td>
                        <td className="text-ink-500 text-xs">
                          {m.outcomeType}
                        </td>
                        <td>
                          <Row className="gap-2">
                            <Button
                              size="xs"
                              color="indigo"
                              disabled={communityAdding === m.id}
                              onClick={() => addCommunityMarket(m.id)}
                            >
                              {communityAdding === m.id ? 'Adding…' : 'Add'}
                            </Button>
                            <Button
                              size="xs"
                              color="gray-outline"
                              onClick={() => removeCommunityMarket(m.id)}
                            >
                              Remove
                            </Button>
                          </Row>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}

            {!communitySearching && !communityTopicSlug && (
              <p className="text-ink-400 text-sm">
                Enter a topic slug above and hit Browse to find community
                markets to add.
              </p>
            )}
            {!communitySearching &&
              communityTopicSlug &&
              communityResults.length === 0 && (
                <p className="text-ink-400 text-sm">
                  No community markets found in “{communityTopicSlug}” (official
                  match markets are excluded).
                </p>
              )}
          </Col>
        </Section>
      </div>
    </Page>
  )
}
