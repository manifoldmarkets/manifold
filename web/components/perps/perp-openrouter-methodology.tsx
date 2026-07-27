import { useState } from 'react'
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/outline'

import {
  OPEN_WEIGHT_LIST_VERSION,
  OPEN_WEIGHT_WINDOW_DAYS,
  openWeightModelList,
} from 'common/perps/open-weight-models'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { ExternalLink } from 'web/components/widgets/external-link'

// Methodology + attribution for the OpenRouter open-weight-share perp.
//
// Two things here are obligations rather than decoration:
//  - OpenRouter's dataset terms require the citation below, with a live
//    `as of` value, wherever the data is republished. It cannot be a static
//    string in the market description.
//  - The index is a PROXY. OpenRouter routes developer and hobbyist traffic,
//    not global AI usage, so a trader can be right about open models winning
//    in the world and wrong about this number. A named proxy is fine; a
//    hidden one is what makes people feel cheated when they were
//    directionally right. So it is stated plainly, above the fold.

// Deterministic UTC formatting — toLocaleString would differ between the
// server render and the client's timezone and blow up hydration.
const formatUtc = (ts: number) => {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`
  )
}

export const PerpOpenRouterMethodology = (props: {
  /** ts of the latest applied oracle point — the `as of` for the citation. */
  oraclePriceTime: number | undefined
}) => {
  const { oraclePriceTime } = props
  const [showModels, setShowModels] = useState(false)
  const models = openWeightModelList()
  const open = models.filter((m) => m.open)
  const closed = models.filter((m) => !m.open)

  return (
    <Col className="border-ink-200 gap-3 rounded-lg border p-4">
      <div className="text-ink-900 font-semibold">
        Open-weight vs closed-weight AI
      </div>

      <div className="text-ink-700 text-sm">
        The price is the percentage of tokens, across OpenRouter's top 50
        models, served by models whose{' '}
        <span className="font-medium">weights the public can download</span>.
        Higher means open-weight models are taking share; lower means closed,
        API-only models are.
      </div>

      <div className="bg-canvas-50 text-ink-700 rounded-md p-3 text-sm">
        <span className="text-ink-900 font-medium">This is a proxy.</span> It
        measures traffic routed through OpenRouter — largely developer and
        hobbyist usage — not global AI usage. Enterprise deployments,
        first-party apps like ChatGPT and Claude, and self-hosted models are not
        in it. You can be right about open models winning in the world and still
        lose this market.
      </div>

      <Col className="text-ink-600 gap-1 text-xs">
        <div className="text-ink-800 text-sm font-medium">
          How it's computed
        </div>
        <div>
          • Trailing <b>{OPEN_WEIGHT_WINDOW_DAYS} UTC days</b>, recomputed{' '}
          <b>hourly</b>. OpenRouter publishes whole days, so the value normally
          steps once a day as a new day lands, diluted by the{' '}
          {OPEN_WEIGHT_WINDOW_DAYS}-day window.
        </div>
        <div>
          • Only the <b>top 50 models</b>. OpenRouter bundles everything else
          into one unlabelled <code>other</code> row, which cannot be classified
          and is <b>excluded from the denominator</b> rather than estimated.
        </div>
        <div>
          • A model not on the list below is excluded from <b>both sides</b>{' '}
          until it is classified — never defaulted to open or closed.
        </div>
        <div>
          • The test is <b>downloadability</b>, not licence purity: public
          weights count even under a non-OSI licence. Gated or research-only
          access does not count. Weights released after launch are reclassified{' '}
          <b>from the release date forward</b>, never retroactively.
        </div>
        <div>
          • Backfilled history is classified with today's list; reconstructing
          contemporaneous judgements is not possible.
        </div>
      </Col>

      <Col className="gap-2">
        <button
          onClick={() => setShowModels(!showModels)}
          className="text-ink-700 hover:text-primary-600 flex items-center gap-1 text-sm font-medium"
        >
          {showModels ? (
            <ChevronDownIcon className="h-4 w-4" />
          ) : (
            <ChevronRightIcon className="h-4 w-4" />
          )}
          Classification list ({open.length} open, {closed.length} closed) · v
          {OPEN_WEIGHT_LIST_VERSION}
        </button>

        {showModels && (
          <Col className="gap-3 text-xs">
            <ModelGroup
              title="Open weights"
              subtitle="publicly downloadable — repo is the evidence"
              models={open}
              accent="text-teal-600 dark:text-teal-400"
            />
            <ModelGroup
              title="Closed weights"
              subtitle="API-only"
              models={closed}
              accent="text-scarlet-600 dark:text-scarlet-400"
            />
          </Col>
        )}
      </Col>

      <div className="text-ink-500 border-ink-200 border-t pt-2 text-xs">
        Source:{' '}
        <ExternalLink
          title="OpenRouter (openrouter.ai/rankings)"
          href="https://openrouter.ai/rankings"
          className="text-ink-600"
        />
        {oraclePriceTime ? `, as of ${formatUtc(oraclePriceTime)}.` : '.'}
      </div>
    </Col>
  )
}

const ModelGroup = (props: {
  title: string
  subtitle: string
  models: { permaslug: string; open: boolean; weights?: string }[]
  accent: string
}) => {
  const { title, subtitle, models, accent } = props
  return (
    <Col className="gap-1">
      <Row className="items-baseline gap-2">
        <span className={`font-semibold ${accent}`}>{title}</span>
        <span className="text-ink-500">{subtitle}</span>
      </Row>
      <div className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
        {models.map((m) => (
          <Row key={m.permaslug} className="text-ink-600 justify-between gap-2">
            <span className="truncate font-mono">{m.permaslug}</span>
            {m.weights && (
              <a
                href={`https://huggingface.co/${m.weights}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink-400 hover:text-primary-600 shrink-0 truncate"
                title={m.weights}
              >
                weights ↗
              </a>
            )}
          </Row>
        ))}
      </div>
    </Col>
  )
}
