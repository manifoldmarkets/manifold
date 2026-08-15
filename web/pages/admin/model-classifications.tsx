import { useState } from 'react'
import { toast } from 'react-hot-toast'
import clsx from 'clsx'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { NoSEO } from 'web/components/NoSEO'
import { Input } from 'web/components/widgets/input'
import { Title } from 'web/components/widgets/title'
import { useAdmin } from 'web/hooks/use-admin'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { api } from 'web/lib/api/api'

// The review queue for the open-weight index.
//
// Everything here is a model the nightly watcher could not confirm by itself.
// It only ever auto-decides `open`, and only against public weight files — so
// what lands on this page is the judgement calls: API-only models, and models
// whose weights exist somewhere the publisher never declared.

export default function AdminModelClassificationsPage() {
  useRedirectIfSignedOut()
  const isAdmin = useAdmin()
  const { data, refresh } = useAPIGetter('get-model-classifications', {})

  if (!isAdmin)
    return (
      <Page trackPageView={false}>
        <NoSEO />
        <Title>Admin only</Title>
      </Page>
    )

  const pending = data?.pending ?? []
  const expired = pending.filter((p) => p.graceExpired)
  // Ranked models are the ones actually affecting the index; the rest are
  // backlog that can wait. Sorting by it puts the real work at the top.
  const ranked = pending.filter((p) => p.rankedAgeMs !== null)
  const backlog = pending.filter((p) => p.rankedAgeMs === null)

  return (
    <Page trackPageView={false}>
      <NoSEO />
      <Col className="mx-auto w-full max-w-4xl gap-4 p-4">
        <Title>Model classifications</Title>

        <Col className="bg-canvas-50 gap-1 rounded p-3 text-sm">
          <div className="text-ink-700">
            The open-weight index scores OpenRouter's top 50 on one test:{' '}
            <b>are the weights publicly downloadable?</b> Downloadable is open;
            API-only is closed. Unknown models are excluded from both sides of
            the index, so a wrong call here moves a market people trade.
          </div>
          <div className="text-ink-500">
            Seed list version {data?.seedVersion ?? '—'} · grace window{' '}
            {data ? Math.round(data.graceWindowMs / 3_600_000) : '—'}h
          </div>
        </Col>

        {expired.length > 0 && (
          <div className="bg-scarlet-100 text-scarlet-700 rounded p-3 text-sm">
            <b>{expired.length} past the grace window.</b> The index is halting
            on these right now — the feed is not publishing until they are
            classified.
          </div>
        )}

        <Col className="gap-2">
          <div className="text-ink-700 font-semibold">
            In the index right now ({ranked.length})
          </div>
          {ranked.length === 0 && (
            <div className="text-ink-500 text-sm">
              Nothing unclassified is currently ranked — the index is scoring a
              complete denominator.
            </div>
          )}
          {ranked.map((model) => (
            <PendingRow key={model.permaslug} model={model} onDone={refresh} />
          ))}
        </Col>

        {backlog.length > 0 && (
          <Col className="gap-2 pt-2">
            <div className="text-ink-700 font-semibold">
              Not yet ranked ({backlog.length})
            </div>
            <div className="text-ink-500 text-sm">
              In OpenRouter's catalog but outside the top 50, so they are not
              affecting the index. Classifying them ahead of time is what stops
              the next one becoming an outage.
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

        {!!data?.recent.length && (
          <Col className="gap-1 pt-4">
            <div className="text-ink-700 font-semibold">Recently decided</div>
            {data.recent.map((r) => (
              <Row
                key={r.permaslug}
                className="text-ink-600 items-center gap-2 text-xs"
              >
                <span className={r.open ? 'text-teal-600' : 'text-ink-500'}>
                  {r.open ? 'open' : 'closed'}
                </span>
                <span className="font-mono">{r.permaslug}</span>
                {r.weights && (
                  <span className="text-ink-400 font-mono">{r.weights}</span>
                )}
                <span className="text-ink-400">via {r.source}</span>
              </Row>
            ))}
          </Col>
        )}
      </Col>
    </Page>
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
  }
  onDone: () => void
}) {
  const { model, onDone } = props
  // Prefilled from OpenRouter's declared repo when there is one, but it is a
  // starting point, not evidence: the publisher field is routinely absent for
  // models whose weights are public, and present for repos that hold only a
  // tokenizer. Confirm it resolves and carries weight files before saving.
  const [weights, setWeights] = useState(model.huggingFaceId ?? '')
  const [saving, setSaving] = useState(false)

  const classify = async (open: boolean) => {
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
      toast.success(`${model.permaslug} → ${open ? 'open' : 'closed'}`)
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const hours = Math.floor(model.ageMs / 3_600_000)
  const rankedHours =
    model.rankedAgeMs === null
      ? null
      : Math.floor(model.rankedAgeMs / 3_600_000)

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
        <Col className="bg-canvas-50 gap-1 rounded p-2 text-xs">
          <div className="text-ink-700 font-semibold">
            Research says:{' '}
            {model.agentRecommendation === 'closed' ? (
              <span className="text-ink-900">closed — API only</span>
            ) : (
              <span className="text-ink-500">could not determine</span>
            )}
          </div>
          <div className="text-ink-600 whitespace-pre-wrap">
            {model.agentReasoning}
          </div>

          {/* The searches themselves, not just the summary of them. This is
              the only checkable thing about a closed verdict — a global search
              returning nothing is the evidence; the prose describing it is
              not. Collapsed so the queue stays skimmable. */}
          {model.agentSearches.length > 0 ? (
            <details className="mt-1">
              <summary className="text-ink-500 cursor-pointer select-none">
                {model.agentSearches.length} search
                {model.agentSearches.length === 1 ? '' : 'es'} it ran — check
                these, not the summary
              </summary>
              <Col className="mt-1 gap-2">
                {model.agentSearches.map((search, i) => (
                  <Col
                    key={i}
                    className="border-ink-200 gap-0.5 border-l-2 pl-2"
                  >
                    <div className="text-ink-700 font-mono">
                      {search.tool}
                      {search.input && (
                        <span className="text-ink-500"> {search.input}</span>
                      )}
                    </div>
                    <div className="text-ink-600 whitespace-pre-wrap font-mono">
                      {search.result || '(no output recorded)'}
                    </div>
                  </Col>
                ))}
              </Col>
            </details>
          ) : (
            <div className="text-scarlet-600">
              No searches recorded — this verdict rests on nothing checkable.
              Treat it as unresearched.
            </div>
          )}

          <div className="text-ink-400">
            A recommendation, not a classification — nothing was applied. Only
            an open verdict can be machine-checked, so this one is yours.
          </div>
        </Col>
      )}

      <Row className="flex-wrap items-center gap-2">
        <Input
          className="w-72 font-mono text-xs"
          placeholder="HuggingFace repo, e.g. deepseek-ai/DeepSeek-V4-Pro"
          value={weights}
          onChange={(e) => setWeights(e.target.value)}
        />
        {!!weights.trim() && (
          <a
            className="text-primary-600 text-xs hover:underline"
            href={`https://huggingface.co/${weights.trim()}`}
            target="_blank"
            rel="noreferrer"
          >
            check repo ↗
          </a>
        )}
        <a
          className="text-primary-600 text-xs hover:underline"
          href={`https://openrouter.ai/${model.permaslug.split(':')[0]}`}
          target="_blank"
          rel="noreferrer"
        >
          OpenRouter ↗
        </a>
      </Row>

      <Row className="gap-2">
        <Button
          size="xs"
          color="green"
          disabled={saving}
          onClick={() => classify(true)}
        >
          Open — weights public
        </Button>
        <Button
          size="xs"
          color="gray"
          disabled={saving}
          onClick={() => classify(false)}
        >
          Closed — API only
        </Button>
      </Row>
    </Col>
  )
}
