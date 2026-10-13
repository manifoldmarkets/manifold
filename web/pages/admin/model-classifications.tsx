import { useId, useState } from 'react'
import { toast } from 'react-hot-toast'
import clsx from 'clsx'
import type { APIResponse } from 'common/api/schema'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { NoSEO } from 'web/components/NoSEO'
import { Input } from 'web/components/widgets/input'
import { Title } from 'web/components/widgets/title'
import { useAdmin, useAdminOrMod } from 'web/hooks/use-admin'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { api } from 'web/lib/api/api'

// The review queue for the open-weight index.
//
// Everything here is a model the nightly watcher could not confirm by itself.
// It only ever auto-decides `open`, and only against public weight files — so
// what lands on this page is the judgement calls: API-only models, and models
// whose weights exist somewhere the publisher never declared.
//
// Three answers to every row, not two. "Open" and "closed" are findings; the
// third, "unknown", is for the rows that used to be most of the cost of this
// page — stealth models and weights that are announced but not shipped, where
// there is nothing to find yet. Unknown takes the index's default side with no
// evidence to type and puts the row on a watch list the research agent
// re-checks weekly, so a default can never silently become permanent.

type ModelClassificationData = APIResponse<'get-model-classifications'>
type WatchedModel = ModelClassificationData['provisional'][number]

const HOUR_MS = 3_600_000

const relativeTime = (timestamp: number) => {
  const hours = Math.max(0, Math.floor((Date.now() - timestamp) / HOUR_MS))
  return hours < 48 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`
}

const untilTime = (timestamp: number) => {
  const hours = Math.ceil((timestamp - Date.now()) / HOUR_MS)
  if (hours <= 0) return 'due now'
  return hours < 48 ? `in ${hours}h` : `in ${Math.ceil(hours / 24)}d`
}

export default function AdminModelClassificationsPage() {
  useRedirectIfSignedOut()
  const isAdmin = useAdmin()
  const isAdminOrMod = useAdminOrMod()
  const { data, refresh } = useAPIGetter(
    'get-model-classifications',
    {},
    undefined,
    undefined,
    isAdmin
  )
  const { data: labData, refresh: refreshLabData } = useAPIGetter(
    'get-openrouter-lab-classifications',
    {},
    undefined,
    undefined,
    isAdminOrMod
  )

  if (!isAdminOrMod)
    return (
      <Page trackPageView={false}>
        <NoSEO />
        <Title>Mods and admins only</Title>
      </Page>
    )

  const pending = data?.pending ?? []
  const expired = pending.filter((p) => p.graceExpired)
  // Ranked models are the ones actually affecting the index; the rest are
  // backlog that can wait. Sorting by it puts the real work at the top.
  const ranked = pending.filter((p) => p.rankedAgeMs !== null)
  const backlog = pending.filter((p) => p.rankedAgeMs === null)
  const watched = data?.provisional ?? []
  const contradicted = watched.filter((m) => m.contradicted)
  const recheckDays = data
    ? Math.round(data.provisionalRecheckIntervalMs / (24 * HOUR_MS))
    : 7

  return (
    <Page trackPageView={false}>
      <NoSEO />
      <Col className="mx-auto w-full max-w-5xl gap-4 p-4">
        <Title>OpenRouter classifications</Title>

        <HowThisWorks isAdmin={isAdmin} />

        <LabClassificationSection data={labData} onDone={refreshLabData} />

        {isAdmin && (
          <Col className="gap-4 border-t pt-6">
            <div className="text-ink-800 text-lg font-semibold">
              Open-weight models
            </div>

            <Col className="bg-canvas-50 gap-1 rounded p-3 text-sm">
              <div className="text-ink-700">
                The open-weight index scores OpenRouter's top 50 on one test:{' '}
                <b>are the weights publicly downloadable?</b> Downloadable is
                open; API-only is closed. Unknown models are excluded from both
                sides of the index, so a wrong call here moves a market people
                trade.
              </div>
              <div className="text-ink-500">
                Seed list version {data?.seedVersion ?? '—'} · grace window{' '}
                {data ? Math.round(data.graceWindowMs / HOUR_MS) : '—'}h
              </div>
            </Col>

            {expired.length > 0 && (
              <div className="bg-scarlet-100 text-scarlet-700 rounded p-3 text-sm">
                <b>{expired.length} past the grace window.</b> The index is
                halting on these right now — the feed is not publishing until
                they are classified.
              </div>
            )}

            {contradicted.length > 0 && (
              <div className="bg-scarlet-100 text-scarlet-700 rounded p-3 text-sm">
                <b>
                  {contradicted.length} provisional verdict
                  {contradicted.length === 1 ? '' : 's'} contradicted.
                </b>{' '}
                The weekly re-check found public weights for a model the index
                is publishing as closed — see “Under watch” below.
              </div>
            )}

            <Col className="gap-2">
              <div className="text-ink-700 font-semibold">
                In the index right now ({ranked.length})
              </div>
              {ranked.length === 0 && (
                <div className="text-ink-500 text-sm">
                  Nothing unclassified is currently ranked — the index is
                  scoring a complete denominator.
                </div>
              )}
              {ranked.map((model) => (
                <PendingRow
                  key={model.permaslug}
                  model={model}
                  onDone={refresh}
                />
              ))}
            </Col>

            {backlog.length > 0 && (
              <Col className="gap-2 pt-2">
                <div className="text-ink-700 font-semibold">
                  Not yet ranked ({backlog.length})
                </div>
                <div className="text-ink-500 text-sm">
                  In OpenRouter's catalog but outside the top 50, so they are
                  not affecting the index. Classifying them ahead of time is
                  what stops the next one becoming an outage.
                </div>
                {backlog.map((model) => (
                  <PendingRow
                    key={model.permaslug}
                    model={model}
                    onDone={refresh}
                  />
                ))}
              </Col>
            )}

            {watched.length > 0 && (
              <Col className="gap-2 pt-2">
                <div className="text-ink-700 font-semibold">
                  Under watch ({watched.length})
                </div>
                <div className="text-ink-500 text-sm">
                  Closed by default because nobody could find weights: stealth
                  models, and weights announced but not shipped. The index
                  counts them as closed. The watcher re-researches each one
                  every {recheckDays} days. It flips a row open on its own only
                  when the publisher declares a repo that verifies with weight
                  files; anything the research agent finds comes back here for a
                  click. Confirm a verdict to stop watching it.
                </div>
                {watched.map((model) => (
                  <WatchedModelRow
                    key={model.permaslug}
                    model={model}
                    onDone={refresh}
                  />
                ))}
              </Col>
            )}

            {!!data?.recent.length && (
              <Col className="gap-1 pt-4">
                <div className="text-ink-700 font-semibold">
                  Recently decided
                </div>
                <div className="text-ink-500 text-xs">
                  A verdict can go stale without anything here changing: a
                  publisher may ship weights after launch, which the methodology
                  treats as a reclassification from the release date forward.
                  The nightly audit flags those, so these stay editable.
                </div>
                {data.recent.map((r) => (
                  <DecidedRow key={r.permaslug} model={r} onDone={refresh} />
                ))}
              </Col>
            )}
          </Col>
        )}
      </Col>
    </Page>
  )
}

// Without this the page is a wall of unlabelled boxes. It holds two unrelated
// review queues that happen to share a data source: one asks where a publisher
// is headquartered, the other asks whether a model's weights are downloadable.
// Different questions, different evidence bars, both feeding live markets.
//
// Collapsible and persisted, because it is scaffolding for the first few
// visits and noise after that.
function HowThisWorks(props: { isAdmin: boolean }) {
  const { isAdmin } = props
  const [open, setOpen] = usePersistentLocalState(
    true,
    'model-classifications-guide-open'
  )

  return (
    <Col className="border-primary-200 bg-primary-50 gap-3 rounded-lg border p-4">
      <Row className="items-center justify-between gap-2">
        <div className="text-ink-900 font-semibold">How this page works</div>
        <button
          className="text-primary-600 text-sm hover:underline"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? 'hide' : 'show'}
        </button>
      </Row>

      {open && (
        <>
          <div className="text-ink-700 text-sm">
            Two independent review queues. Each one resolves a question the
            nightly watcher could not answer on its own, and each one feeds a
            live market — so a wrong call here moves a number people traded on.
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Col className="bg-canvas-0 gap-1 rounded border-l-4 border-l-amber-400 p-3 text-sm">
              <div className="text-ink-900 font-semibold">
                Chinese-lab publishers
              </div>
              <div className="text-ink-700">
                <b>Where is this publisher headquartered?</b> Most are decided
                once per author; anonymous or shared namespaces are decided per
                exact model instead.
              </div>
              <div className="text-ink-600">
                A firm verdict needs a one-line evidence summary <i>and</i> a
                public source URL — the verdict buttons stay disabled until both
                are filled in. <i>Unknown</i> needs neither. Mods and admins.
              </div>
            </Col>

            {isAdmin && (
              <Col className="bg-canvas-0 border-l-primary-400 gap-1 rounded border-l-4 p-3 text-sm">
                <div className="text-ink-900 font-semibold">
                  Open-weight models
                </div>
                <div className="text-ink-700">
                  <b>Are the weights publicly downloadable?</b> Downloadable is
                  open, API-only is closed. Anything still unknown is dropped
                  from both sides of the index.
                </div>
                <div className="text-ink-600">
                  An open call needs the HuggingFace repo that proves it. A
                  closed call needs nothing. <i>Unknown</i> is closed for now,
                  re-checked weekly. Admins only.
                </div>
              </Col>
            )}
          </div>

          <Col className="gap-1.5 text-sm">
            <div className="text-ink-900 font-semibold">Working a row</div>
            <ol className="text-ink-700 ml-5 list-decimal space-y-1">
              <li>
                <b>Start at the top.</b> The first list in each section is
                ranked — those models are in the index right now. A red border
                means the grace window has run out and the feed is paused until
                you decide.
              </li>
              <li>
                <b>Read “Research says”, then distrust it.</b> It is a
                recommendation; nothing has been applied. Expand the searches it
                ran — a search returning nothing is the actual evidence, the
                prose describing it is not.
              </li>
              <li>
                <b>Open the link and confirm it.</b> “check repo ↗” and
                “Evidence source ↗” open in a new tab. Verification proves a
                repo is public and holds weights, not that it is <i>this</i>{' '}
                model — a sibling in the same family passes the same checks.
              </li>
              <li>
                <b>Click the verdict.</b> It saves immediately and the queue
                refreshes.
              </li>
              <li>
                <b>Can’t tell yet?</b> Click <i>Unknown</i> instead of inventing
                evidence. The row takes the index’s default side — closed, or
                non-Chinese — and joins the “Under watch” list, where the
                research agent re-checks it weekly. Anything it finds comes back
                here with a red border, and a publisher-declared repo that
                verifies flips an open-weight row open on its own. Firm it up
                whenever you like.
              </li>
            </ol>
          </Col>

          <div className="text-ink-600 text-sm">
            <b>Changed your mind?</b> Every decided row keeps a “change” link.
            Verdicts do go stale — a publisher can ship weights weeks after
            launch — so correcting one is a normal part of this page, not an
            escape hatch.
          </div>
        </>
      )}
    </Col>
  )
}

type LabClassificationData = APIResponse<'get-openrouter-lab-classifications'>
type PendingLabClassification = LabClassificationData['pending'][number]
type DecidedLabClassification = LabClassificationData['decided'][number]
type WatchedLabClassification = LabClassificationData['provisional'][number]
type LabAgentFindings = Pick<
  PendingLabClassification,
  | 'agentRecommendation'
  | 'agentPublisher'
  | 'agentHeadquarters'
  | 'agentSourceUrl'
  | 'agentReasoning'
  | 'agentSearches'
  | 'recheckedAt'
>
// One row component serves all three lists. Pending rows carry the research
// findings; firm decisions carry a verdict and its evidence; watched rows carry
// both, plus the flag that says the verdict is a default.
type LabClassificationDisplay = Omit<
  PendingLabClassification,
  keyof LabAgentFindings
> &
  Partial<LabAgentFindings> &
  Partial<
    Pick<
      DecidedLabClassification,
      | 'isChinese'
      | 'evidence'
      | 'sourceUrl'
      | 'source'
      | 'classifiedAt'
      | 'classifiedBy'
    >
  > &
  Partial<Pick<WatchedLabClassification, 'contradicted' | 'nextCheckAt'>> & {
    /** Set by the section that renders the watch list. */
    provisional?: boolean
  }

function LabClassificationSection(props: {
  data: LabClassificationData | undefined
  onDone: () => void
}) {
  const { data, onDone } = props
  const pending = data?.pending ?? []
  const ranked = pending.filter((row) => row.firstRankedAt !== null)
  const backlog = pending.filter((row) => row.firstRankedAt === null)
  const watched = data?.provisional ?? []
  const contradicted = watched.filter((row) => row.contradicted)
  const recheckDays = data
    ? Math.round(data.recheckIntervalMs / (24 * HOUR_MS))
    : 7

  return (
    <Col className="gap-4">
      <div>
        <div className="text-ink-800 text-lg font-semibold">
          Chinese-lab publishers
        </div>
        <div className="text-ink-600 text-sm">
          Classify where an OpenRouter publisher is headquartered. Normal labs
          are decided once by author; anonymous or shared namespaces use an
          exact-model decision. A firm verdict needs a short evidence summary
          and a public source; <i>Unknown</i> needs neither.
        </div>
        <div className="text-ink-400 mt-1 text-xs">
          Audited seed version {data?.seedVersion ?? '—'} · database decisions
          take effect on the next hourly feed run without a deploy.
        </div>
      </div>

      {!data ? (
        <div className="text-ink-500 text-sm">
          Loading classification queue…
        </div>
      ) : (
        <>
          {contradicted.length > 0 && (
            <div className="bg-scarlet-100 text-scarlet-700 rounded p-3 text-sm">
              <b>
                {contradicted.length} provisional verdict
                {contradicted.length === 1 ? '' : 's'} contradicted.
              </b>{' '}
              The weekly re-check attributed a subject the index is publishing
              as non-Chinese to a Chinese publisher — see “Under watch” below.
            </div>
          )}

          <Col className="gap-2">
            <div className="text-ink-700 font-semibold">
              Ranked or backfill-blocking ({ranked.length})
            </div>
            {ranked.length === 0 && (
              <div className="text-ink-500 text-sm">
                No ranked or historical publisher is waiting for a decision.
              </div>
            )}
            {ranked.map((row) => (
              <LabClassificationRow
                key={`${row.subjectType}:${row.subjectSlug}`}
                row={row}
                ranked
                onDone={onDone}
              />
            ))}
          </Col>

          {backlog.length > 0 && (
            <Col className="gap-2">
              <div className="text-ink-700 font-semibold">
                Catalog backlog ({backlog.length})
              </div>
              <div className="text-ink-500 text-sm">
                These are not in the ranked window yet. Deciding them now
                prevents a future launch from becoming an alert or feed pause.
              </div>
              {backlog.map((row) => (
                <LabClassificationRow
                  key={`${row.subjectType}:${row.subjectSlug}`}
                  row={row}
                  onDone={onDone}
                />
              ))}
            </Col>
          )}

          {watched.length > 0 && (
            <Col className="gap-2 pt-2">
              <div className="text-ink-700 font-semibold">
                Under watch ({watched.length})
              </div>
              <div className="text-ink-500 text-sm">
                Non-Chinese by default: anonymous models and publishers nobody
                could place, treated like OpenRouter's own cloaked slugs —
                denominator only, never numerator. The research agent re-checks
                each one every {recheckDays} days for a reveal or a
                headquarters. A Chinese finding is flagged here and alerted;
                nothing is applied without a click. Confirm a verdict to stop
                watching it.
              </div>
              {watched.map((row) => (
                <LabClassificationRow
                  key={`${row.subjectType}:${row.subjectSlug}`}
                  row={{
                    ...row,
                    provisional: true,
                    discoveredVia: null,
                    firstSeen: row.classifiedAt,
                    firstRankedAt: null,
                  }}
                  onDone={onDone}
                />
              ))}
            </Col>
          )}

          {data.decided.length > 0 && (
            <Col className="gap-2 pt-2">
              <div className="text-ink-700 font-semibold">
                Database decisions ({data.decided.length})
              </div>
              <div className="text-ink-500 text-xs">
                Seed entries remain code-reviewed. These newer decisions can be
                corrected here, with the prior verdict retained in database
                history.
              </div>
              {data.decided.map((row) => (
                <LabClassificationRow
                  key={`${row.subjectType}:${row.subjectSlug}`}
                  row={{
                    ...row,
                    discoveredVia: null,
                    firstSeen: row.classifiedAt,
                    firstRankedAt: null,
                  }}
                  onDone={onDone}
                />
              ))}
            </Col>
          )}
        </>
      )}
    </Col>
  )
}

function LabClassificationRow(props: {
  row: LabClassificationDisplay
  ranked?: boolean
  onDone: () => void
}) {
  const { row, ranked = false, onDone } = props
  const fieldId = useId()
  const decided = row.isChinese !== undefined
  const provisional = row.provisional === true
  // Only a FIRM verdict counts as already decided for the buttons: firming a
  // provisional row is the whole point of opening its editor.
  const firm = decided && !provisional
  const [editing, setEditing] = useState(!decided)
  // Prefill from the research when it found a placement. For a provisional
  // row the stored evidence is the canned default, which is not what a firm
  // verdict should say, so the suggestion wins there too.
  const suggestion =
    row.agentPublisher && row.agentHeadquarters
      ? {
          evidence: `${row.agentPublisher}, ${row.agentHeadquarters}`,
          sourceUrl: row.agentSourceUrl ?? '',
        }
      : null
  const [evidence, setEvidence] = useState(
    firm ? row.evidence ?? '' : suggestion?.evidence ?? ''
  )
  const [sourceUrl, setSourceUrl] = useState(
    firm ? row.sourceUrl ?? '' : suggestion?.sourceUrl ?? ''
  )
  const [saving, setSaving] = useState(false)

  const save = async (params: {
    isChinese: boolean
    provisional?: boolean
    evidence?: string
    sourceUrl?: string
  }) => {
    setSaving(true)
    try {
      await api('set-openrouter-lab-classification', {
        subjectType: row.subjectType,
        subjectSlug: row.subjectSlug,
        ...params,
      })
      toast.success(
        `${row.subjectSlug} → ${
          params.isChinese
            ? 'Chinese'
            : params.provisional
            ? 'non-Chinese for now, under watch'
            : 'non-Chinese'
        }`
      )
      setEditing(false)
      onDone()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  const classify = async (isChinese: boolean) => {
    if (!evidence.trim()) {
      toast.error('Add a short headquarters evidence summary')
      return
    }
    let url: URL
    try {
      url = new URL(sourceUrl.trim())
    } catch {
      toast.error('Add a valid public evidence URL')
      return
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      toast.error('Evidence URL must use http or https')
      return
    }
    await save({
      isChinese,
      evidence: evidence.trim(),
      sourceUrl: url.toString(),
    })
  }

  const ageHours = Math.max(
    0,
    Math.floor((Date.now() - row.firstSeen) / HOUR_MS)
  )
  const rankedAgeHours =
    row.firstRankedAt === null
      ? null
      : Math.max(0, Math.floor((Date.now() - row.firstRankedAt) / HOUR_MS))
  const decisionChanged =
    evidence.trim() !== (row.evidence ?? '') ||
    sourceUrl.trim() !== (row.sourceUrl ?? '')
  const useSuggestion = () => {
    if (!suggestion) return
    setEvidence(suggestion.evidence)
    setSourceUrl(suggestion.sourceUrl)
  }
  const hasFindings = !!(row.agentRecommendation || row.agentReasoning)

  return (
    <Col
      className={clsx(
        'gap-2 rounded border p-3',
        row.contradicted
          ? 'border-scarlet-300'
          : ranked || provisional
          ? 'border-amber-400'
          : 'border-ink-200'
      )}
    >
      <Row className="flex-wrap items-baseline gap-2">
        {decided && (
          <span
            className={row.isChinese ? 'text-scarlet-600' : 'text-teal-600'}
          >
            {row.isChinese ? 'Chinese' : 'non-Chinese'}
          </span>
        )}
        {provisional && (
          <span className="rounded border border-amber-400 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-300">
            provisional
          </span>
        )}
        <span className="bg-canvas-100 text-ink-500 rounded px-1.5 py-0.5 text-xs">
          {row.subjectType}
        </span>
        <span className="font-mono text-sm font-semibold">
          {row.subjectSlug}
        </span>
        {!decided && (
          <span className="text-ink-400 text-xs">
            seen {ageHours}h ago
            {rankedAgeHours === null
              ? ''
              : ` · ranked ${rankedAgeHours}h ago`}{' '}
            · via {row.discoveredVia ?? 'unknown'}
          </span>
        )}
        {provisional &&
          row.classifiedAt !== undefined &&
          row.nextCheckAt !== undefined && (
            <span className="text-ink-400 text-xs">
              since {relativeTime(row.classifiedAt)} ·{' '}
              {row.recheckedAt
                ? `re-checked ${relativeTime(row.recheckedAt)}`
                : 'not re-checked yet'}{' '}
              · next {untilTime(row.nextCheckAt)}
            </span>
          )}
        {decided && (
          <button
            className="text-primary-600 text-xs hover:underline"
            onClick={() => setEditing((value) => !value)}
          >
            {editing ? 'cancel' : provisional ? 'firm it up' : 'change'}
          </button>
        )}
      </Row>

      {(row.exampleModels.length > 0 || row.exampleNames.length > 0) && (
        <div className="text-ink-600 text-sm">
          {row.exampleModels.length > 0 && (
            <>
              Models:{' '}
              <span className="font-mono">
                {row.exampleModels.slice(0, 5).join(', ')}
              </span>
              {row.exampleModels.length > 5 &&
                ` +${row.exampleModels.length - 5} more`}
            </>
          )}
          {row.exampleNames.length > 0 && (
            <div>
              OpenRouter names: {row.exampleNames.slice(0, 5).join(', ')}
            </div>
          )}
        </div>
      )}

      {hasFindings && (
        <Col className="bg-canvas-50 gap-1.5 rounded p-3 text-sm">
          <div className="text-ink-700 font-semibold">
            {provisional ? 'Latest re-check:' : 'Research says:'}{' '}
            {row.agentRecommendation === 'chinese' ? (
              <span className="text-scarlet-600">
                Chinese — {row.agentPublisher}, {row.agentHeadquarters}
              </span>
            ) : row.agentRecommendation === 'non-chinese' ? (
              <span className="text-teal-600">
                non-Chinese — {row.agentPublisher}, {row.agentHeadquarters}
              </span>
            ) : row.agentRecommendation === 'unattributed' ? (
              <span className="text-ink-900">
                still anonymous — no official attribution found
              </span>
            ) : (
              <span className="text-ink-500">could not determine</span>
            )}
            {row.recheckedAt != null && (
              <span className="text-ink-400 font-normal">
                {' '}
                · {relativeTime(row.recheckedAt)}
              </span>
            )}
          </div>
          {row.agentSourceUrl && (
            <a
              className="text-primary-600 w-fit hover:underline"
              href={row.agentSourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Source it cited ↗
            </a>
          )}
          {row.agentReasoning && (
            <div className="text-ink-600 whitespace-pre-wrap">
              {row.agentReasoning}
            </div>
          )}
          {row.agentSearches && row.agentSearches.length > 0 ? (
            <LabAgentSearches searches={row.agentSearches} />
          ) : (
            <div className="text-scarlet-600">
              No searches recorded — this rests on nothing checkable. Treat it
              as unresearched.
            </div>
          )}
          <div className="text-ink-500 text-xs">
            A recommendation, not a classification — nothing was applied. The
            cited URL is one its own search returned; open it and check it says
            what the summary claims before you click.
          </div>
          {suggestion &&
            editing &&
            (evidence !== suggestion.evidence ||
              sourceUrl !== suggestion.sourceUrl) && (
              <button
                className="text-primary-600 w-fit text-xs hover:underline"
                onClick={useSuggestion}
              >
                Use this in the form below
              </button>
            )}
        </Col>
      )}

      {decided && !editing && (
        <Col className="gap-0.5 text-sm">
          <div className="text-ink-700">{row.evidence}</div>
          {row.sourceUrl && (
            <a
              className="text-primary-600 w-fit hover:underline"
              href={row.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Evidence source ↗
            </a>
          )}
          <div className="text-ink-500 text-xs">
            via {row.source ?? 'unknown'}
            {row.classifiedBy ? ` · by ${row.classifiedBy}` : ''}
          </div>
        </Col>
      )}

      {editing && (
        <Col className="gap-3">
          <Col className="gap-1">
            <label
              className="text-ink-700 text-sm font-medium"
              htmlFor={`${fieldId}-evidence`}
            >
              Evidence summary
            </label>
            <Input
              id={`${fieldId}-evidence`}
              className="text-sm"
              placeholder="e.g. Company’s principal office is Shanghai"
              value={evidence}
              maxLength={2_000}
              onChange={(event) => setEvidence(event.target.value)}
            />
          </Col>
          <Col className="gap-1">
            <label
              className="text-ink-700 text-sm font-medium"
              htmlFor={`${fieldId}-source-url`}
            >
              Public source URL
            </label>
            <Input
              id={`${fieldId}-source-url`}
              className="font-mono text-sm"
              placeholder="https://public-source.example/company/about"
              type="url"
              value={sourceUrl}
              maxLength={2_000}
              onChange={(event) => setSourceUrl(event.target.value)}
            />
          </Col>
          {!!sourceUrl.trim() && (
            <a
              className="text-primary-600 w-fit text-sm hover:underline"
              href={sourceUrl.trim()}
              target="_blank"
              rel="noreferrer"
            >
              Check source ↗
            </a>
          )}
          <Row className="flex-wrap gap-2">
            <Button
              size="sm"
              color="red"
              disabled={
                saving ||
                (firm && row.isChinese === true && !decisionChanged) ||
                !evidence.trim() ||
                !sourceUrl.trim()
              }
              onClick={() => classify(true)}
            >
              Chinese-headquartered
            </Button>
            <Button
              size="sm"
              color="green"
              disabled={
                saving ||
                (firm && row.isChinese === false && !decisionChanged) ||
                !evidence.trim() ||
                !sourceUrl.trim()
              }
              onClick={() => classify(false)}
            >
              {provisional
                ? 'Non-Chinese — confirm, stop watching'
                : 'Non-Chinese'}
            </Button>
            {!decided && (
              <Button
                size="sm"
                color="amber-outline"
                disabled={saving}
                onClick={() => save({ isChinese: false, provisional: true })}
              >
                Unknown — non-Chinese for now, keep checking
              </Button>
            )}
          </Row>
          {!decided && (
            <div className="text-ink-500 text-xs">
              Unknown needs no evidence. For stealth models and publishers
              nobody can place yet: counts in the denominator only, like
              OpenRouter's cloaked slugs, and the research agent re-checks it
              weekly for a reveal.
            </div>
          )}
        </Col>
      )}
    </Col>
  )
}

// The searches themselves, not just the summary of them. The only checkable
// part of a negative finding ("still anonymous") is which queries came back
// with nothing, and the only way to trust a placement is to open the result it
// cites. Collapsed so the queue stays skimmable.
function LabAgentSearches(props: {
  searches: NonNullable<LabClassificationDisplay['agentSearches']>
}) {
  const { searches } = props
  return (
    <details className="mt-1">
      <summary className="text-primary-600 cursor-pointer select-none hover:underline">
        Show the {searches.length} web search
        {searches.length === 1 ? '' : 'es'} it ran — check these, not the
        summary
      </summary>
      <Col className="mt-2 gap-3">
        {searches.map((search, i) => (
          <Col key={i} className="border-ink-200 gap-1 border-l-2 pl-3">
            <div className="text-ink-700 break-all font-mono text-xs">
              {search.query}
              {search.error && (
                <span className="text-scarlet-600"> — {search.error}</span>
              )}
            </div>
            <ul className="text-ink-600 max-h-64 overflow-y-auto text-xs">
              {search.results.map((result) => (
                <li key={result.url} className="break-all">
                  <a
                    className="hover:underline"
                    href={result.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {result.title}
                  </a>{' '}
                  <span className="text-ink-400">{result.url}</span>
                </li>
              ))}
              {search.results.length === 0 && !search.error && (
                <li>(no results)</li>
              )}
            </ul>
          </Col>
        ))}
      </Col>
    </details>
  )
}

// A verdict already reached, and a way to change it.
//
// This list used to be read-only, which quietly assumed a classification is
// decided once. It is not: the methodology's own pre-committed cases include
// a publisher shipping weights after launch, and the nightly audit exists to
// find verdicts that have gone stale. GLM 5.3 was the case that made the gap
// obvious — correctly closed on 2026-08-20 when zai-org had no such repo,
// weights published on 08-25, and no way to act on it here while the market
// showed a stale number.
//
// Collapsed behind a click because correcting a verdict should be deliberate
// and is rare next to working the pending queue above.
function DecidedRow(props: {
  model: {
    permaslug: string
    open: boolean
    weights: string | null
    source: string
  }
  onDone: () => void
}) {
  const { model, onDone } = props
  const [editing, setEditing] = useState(false)
  const [weights, setWeights] = useState(model.weights ?? '')
  const [saving, setSaving] = useState(false)

  const reclassify = async (open: boolean, provisional = false) => {
    if (open && !weights.trim()) {
      toast.error('An open call needs the weights repo that proves it')
      return
    }
    setSaving(true)
    try {
      await api('set-model-classification', {
        permaslug: model.permaslug,
        open,
        weights: open ? weights.trim() : undefined,
        provisional,
      })
      toast.success(
        `${model.permaslug} -> ${
          open ? 'open' : provisional ? 'closed for now, under watch' : 'closed'
        }`
      )
      setEditing(false)
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Col className="gap-1">
      <Row className="text-ink-600 flex-wrap items-center gap-2 text-xs">
        <span className={model.open ? 'text-teal-600' : 'text-ink-500'}>
          {model.open ? 'open' : 'closed'}
        </span>
        <span className="font-mono">{model.permaslug}</span>
        {model.weights && (
          <span className="text-ink-400 font-mono">{model.weights}</span>
        )}
        <span className="text-ink-400">via {model.source}</span>
        <button
          className="text-primary-600 hover:underline"
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? 'cancel' : 'change'}
        </button>
      </Row>

      {editing && (
        <Row className="flex-wrap items-center gap-3 pb-2 pl-4">
          <div className="w-full sm:w-96">
            <Input
              className="w-full font-mono text-sm"
              placeholder="HuggingFace repo backing an open call"
              value={weights}
              onChange={(e) => setWeights(e.target.value)}
            />
          </div>
          {!!weights.trim() && (
            <a
              className="text-primary-600 text-sm hover:underline"
              href={`https://huggingface.co/${weights.trim()}`}
              target="_blank"
              rel="noreferrer"
            >
              check repo &#8599;
            </a>
          )}
          {/* Enabled even when the model is ALREADY open, because replacing a
              citation is a real correction: a repo can be renamed or withdrawn
              while the verdict stays right. Disabling it forced a round trip
              through "closed", which publishes a number we know to be wrong on
              the tick in between. */}
          <Button
            size="xs"
            color="green"
            disabled={
              saving || (model.open && weights.trim() === (model.weights ?? ''))
            }
            onClick={() => reclassify(true)}
          >
            {model.open ? 'Update citation' : 'Open'}
          </Button>
          <Button
            size="xs"
            color="gray"
            disabled={saving || !model.open}
            onClick={() => reclassify(false)}
          >
            Closed
          </Button>
          {/* The way onto the watch list for a verdict that was typed as
              closed before "unknown" existed — weights announced but not
              shipped is the usual case. */}
          <Button
            size="xs"
            color="amber-outline"
            disabled={saving}
            onClick={() => reclassify(false, true)}
          >
            Unknown — keep checking
          </Button>
        </Row>
      )}
    </Col>
  )
}

// The HuggingFace searches a verdict rests on, not just the summary of them.
// This is the only checkable thing about a closed verdict — a global search
// returning nothing is the evidence; the prose describing it is not. Collapsed
// so the queue stays skimmable.
function AgentSearches(props: {
  searches: { tool: string; input: string | null; result: string }[]
}) {
  const { searches } = props
  return (
    <details className="mt-1">
      <summary className="text-primary-600 cursor-pointer select-none hover:underline">
        Show the {searches.length} search
        {searches.length === 1 ? '' : 'es'} it ran — check these, not the
        summary
      </summary>
      <Col className="mt-2 gap-3">
        {searches.map((search, i) => (
          <Col key={i} className="border-ink-200 gap-1 border-l-2 pl-3">
            <div className="text-ink-700 break-all font-mono text-xs">
              {search.tool}
              {search.input && (
                <span className="text-ink-500"> {search.input}</span>
              )}
            </div>
            {/* Capped and scrollable: a single chatty search used to run for
                screens and push the verdict buttons out of sight, which is
                how a row gets skipped. */}
            <div className="bg-canvas-0 text-ink-700 max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded p-2 font-mono text-xs">
              {search.result || '(no output recorded)'}
            </div>
          </Col>
        ))}
      </Col>
    </details>
  )
}

function PendingRow(props: {
  model: {
    permaslug: string
    openRouterName: string | null
    huggingFaceId: string | null
    discoveredVia: string | null
    ageMs: number
    rankedAgeMs: number | null
    graceExpired: boolean
    agentRecommendation: string | null
    agentReasoning: string | null
    agentSearches: { tool: string; input: string | null; result: string }[]
    agentProposedWeights: string | null
    agentWeightFileCount: number | null
  }
  onDone: () => void
}) {
  const { model, onDone } = props
  // Prefilled from OpenRouter's declared repo when there is one, but it is a
  // starting point, not evidence: the publisher field is routinely absent for
  // models whose weights are public, and present for repos that hold only a
  // tokenizer. Confirm it resolves and carries weight files before saving.
  const [weights, setWeights] = useState(
    model.agentProposedWeights ?? model.huggingFaceId ?? ''
  )
  const [saving, setSaving] = useState(false)

  const classify = async (open: boolean, provisional = false) => {
    if (open && !weights.trim()) {
      toast.error('An open call needs the weights repo that proves it')
      return
    }
    setSaving(true)
    try {
      await api('set-model-classification', {
        permaslug: model.permaslug,
        open,
        weights: open ? weights.trim() : undefined,
        provisional,
      })
      toast.success(
        `${model.permaslug} → ${
          open ? 'open' : provisional ? 'closed for now, under watch' : 'closed'
        }`
      )
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const hours = Math.floor(model.ageMs / HOUR_MS)
  const rankedHours =
    model.rankedAgeMs === null ? null : Math.floor(model.rankedAgeMs / HOUR_MS)

  return (
    <Col
      className={clsx(
        'gap-2 rounded border p-3',
        model.graceExpired ? 'border-scarlet-300' : 'border-ink-200'
      )}
    >
      <Row className="flex-wrap items-baseline gap-2">
        <span className="font-mono text-sm font-semibold">
          {model.permaslug}
        </span>
        {model.openRouterName && (
          <span className="text-ink-600 text-sm">{model.openRouterName}</span>
        )}
        <span
          className={clsx(
            'text-xs',
            model.graceExpired ? 'text-scarlet-600' : 'text-ink-400'
          )}
        >
          seen {hours}h ago
          {rankedHours !== null && ` · ranked ${rankedHours}h`} · via{' '}
          {model.discoveredVia ?? 'unknown'}
        </span>
      </Row>

      {model.agentReasoning && (
        <Col className="bg-canvas-50 gap-1.5 rounded p-3 text-sm">
          <div className="text-ink-700 font-semibold">
            Research says:{' '}
            {model.agentRecommendation === 'closed' ? (
              <span className="text-ink-900">closed — API only</span>
            ) : model.agentRecommendation === 'open' ? (
              <span className="text-teal-600">
                open — weights found
                {model.agentProposedWeights && (
                  <span className="text-ink-700 font-mono">
                    {' '}
                    {model.agentProposedWeights}
                  </span>
                )}
                {model.agentWeightFileCount !== null && (
                  <span className="text-ink-500">
                    {' '}
                    ({model.agentWeightFileCount} weight files, re-verified
                    against the live API)
                  </span>
                )}
              </span>
            ) : (
              <span className="text-ink-500">could not determine</span>
            )}
          </div>
          <div className="text-ink-600 whitespace-pre-wrap">
            {model.agentReasoning}
          </div>

          {model.agentSearches.length > 0 ? (
            <AgentSearches searches={model.agentSearches} />
          ) : (
            <div className="text-scarlet-600">
              No searches recorded — this verdict rests on nothing checkable.
              Treat it as unresearched.
            </div>
          )}

          <div className="text-ink-500 text-xs">
            A recommendation, not a classification — nothing was applied. That
            includes an open verdict: verification proves the repo is public and
            carries weights, and the name check proves it looks like this model,
            but neither proves it IS this model. A sibling in the same family
            passes both. Check the repo, then click.
          </div>
        </Col>
      )}

      <Row className="flex-wrap items-center gap-3">
        <div className="w-full sm:w-96">
          <Input
            className="w-full font-mono text-sm"
            placeholder="HuggingFace repo, e.g. deepseek-ai/DeepSeek-V4-Pro"
            value={weights}
            onChange={(e) => setWeights(e.target.value)}
          />
        </div>
        {!!weights.trim() && (
          <a
            className="text-primary-600 text-sm hover:underline"
            href={`https://huggingface.co/${weights.trim()}`}
            target="_blank"
            rel="noreferrer"
          >
            check repo ↗
          </a>
        )}
        <a
          className="text-primary-600 text-sm hover:underline"
          href={`https://openrouter.ai/${model.permaslug.split(':')[0]}`}
          target="_blank"
          rel="noreferrer"
        >
          OpenRouter ↗
        </a>
      </Row>

      <Row className="flex-wrap gap-2">
        <Button
          size="sm"
          color="green"
          disabled={saving}
          onClick={() => classify(true)}
        >
          Open — weights public
        </Button>
        <Button
          size="sm"
          color="gray"
          disabled={saving}
          onClick={() => classify(false)}
        >
          Closed — API only
        </Button>
        <Button
          size="sm"
          color="amber-outline"
          disabled={saving}
          onClick={() => classify(false, true)}
        >
          Unknown — closed for now, keep checking
        </Button>
      </Row>
      <div className="text-ink-500 text-xs">
        Unknown is for stealth models and weights that are announced but not
        shipped. It counts as closed — the methodology's rule for weights nobody
        can download — and the watcher re-researches it weekly: a
        publisher-declared repo that verifies flips it open on its own; anything
        else comes back here for a click.
      </div>
    </Col>
  )
}

// A row on the watch list: closed by default, with the latest weekly re-check
// and the two ways to take it off the list — an open verdict (prefilled from
// a contradicting finding) or a firm closed one.
function WatchedModelRow(props: { model: WatchedModel; onDone: () => void }) {
  const { model, onDone } = props
  const [weights, setWeights] = useState(model.agentProposedWeights ?? '')
  const [saving, setSaving] = useState(false)

  const decide = async (open: boolean) => {
    if (open && !weights.trim()) {
      toast.error('An open call needs the weights repo that proves it')
      return
    }
    setSaving(true)
    try {
      await api('set-model-classification', {
        permaslug: model.permaslug,
        open,
        weights: open ? weights.trim() : undefined,
      })
      toast.success(`${model.permaslug} → ${open ? 'open' : 'closed (firm)'}`)
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Col
      className={clsx(
        'gap-2 rounded border p-3',
        model.contradicted ? 'border-scarlet-300' : 'border-amber-400'
      )}
    >
      <Row className="flex-wrap items-baseline gap-2">
        <span className="text-ink-500 text-sm">closed</span>
        <span className="rounded border border-amber-400 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-300">
          provisional
        </span>
        <span className="font-mono text-sm font-semibold">
          {model.permaslug}
        </span>
        {model.openRouterName && (
          <span className="text-ink-600 text-sm">{model.openRouterName}</span>
        )}
        <span className="text-ink-400 text-xs">
          {model.classifiedAt !== null &&
            `since ${relativeTime(model.classifiedAt)} · `}
          {model.lastCheckedAt !== null
            ? `re-checked ${relativeTime(model.lastCheckedAt)}`
            : 'not re-checked yet'}{' '}
          · next {untilTime(model.nextCheckAt)}
        </span>
      </Row>

      {model.agentRecommendation && (
        <Col className="bg-canvas-50 gap-1.5 rounded p-3 text-sm">
          <div className="text-ink-700 font-semibold">
            Latest re-check:{' '}
            {model.contradicted ? (
              <span className="text-scarlet-600">
                public weights found
                {model.agentProposedWeights && (
                  <span className="font-mono">
                    {' '}
                    {model.agentProposedWeights}
                  </span>
                )}
                {model.agentWeightFileCount !== null && (
                  <span className="text-ink-500 font-normal">
                    {' '}
                    ({model.agentWeightFileCount} weight files, re-verified
                    against the live API)
                  </span>
                )}
              </span>
            ) : model.agentRecommendation === 'closed' ? (
              <span className="text-ink-900">still no public weights</span>
            ) : (
              <span className="text-ink-500">could not determine</span>
            )}
          </div>
          {model.agentReasoning && (
            <div className="text-ink-600 whitespace-pre-wrap">
              {model.agentReasoning}
            </div>
          )}
          {model.agentSearches.length > 0 && (
            <AgentSearches searches={model.agentSearches} />
          )}
          {model.contradicted && (
            <div className="text-ink-500 text-xs">
              A recommendation, not a classification — the index is still
              publishing this model as closed. Verification proves the repo is
              public and carries weights, not that it is this model. Check the
              repo, then click.
            </div>
          )}
        </Col>
      )}

      <Row className="flex-wrap items-center gap-3">
        <div className="w-full sm:w-96">
          <Input
            className="w-full font-mono text-sm"
            placeholder="HuggingFace repo backing an open call"
            value={weights}
            onChange={(e) => setWeights(e.target.value)}
          />
        </div>
        {!!weights.trim() && (
          <a
            className="text-primary-600 text-sm hover:underline"
            href={`https://huggingface.co/${weights.trim()}`}
            target="_blank"
            rel="noreferrer"
          >
            check repo ↗
          </a>
        )}
        <a
          className="text-primary-600 text-sm hover:underline"
          href={`https://openrouter.ai/${model.permaslug}`}
          target="_blank"
          rel="noreferrer"
        >
          OpenRouter ↗
        </a>
      </Row>

      <Row className="flex-wrap gap-2">
        <Button
          size="sm"
          color="green"
          disabled={saving}
          onClick={() => decide(true)}
        >
          Open — weights public
        </Button>
        <Button
          size="sm"
          color="gray"
          disabled={saving}
          onClick={() => decide(false)}
        >
          Closed — confirm, stop watching
        </Button>
      </Row>
    </Col>
  )
}
