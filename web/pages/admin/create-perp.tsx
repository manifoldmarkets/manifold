import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { XIcon } from '@heroicons/react/solid'
import { Group } from 'common/group'
import { HOUR_MS, MINUTE_MS } from 'common/util/time'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { NoSEO } from 'web/components/NoSEO'
import { TopicSelector } from 'web/components/topics/topic-selector'
import { Input } from 'web/components/widgets/input'
import { Title } from 'web/components/widgets/title'
import { useAdmin } from 'web/hooks/use-admin'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { api } from 'web/lib/api/api'

// Funding events run once per hour (FUNDING_PERIOD_MS = HOUR_MS in the engine).
const HOURS_PER_YEAR = 24 * 365

export default function AdminCreatePerpPage() {
  useRedirectIfSignedOut()
  const isAdmin = useAdmin()

  const [form, setForm] = useState({
    question: '',
    description: '',
    oracleFeedId: '',
    maxLeverage: 10,
    // Annualized max funding rate as a percentage (e.g. 50 means 50%/yr).
    maxFundingRateAnnualPct: 50,
    fundingSensitivity: 1,
    maxOraclePriceAgeHours: 6,
    // Per-side creator subsidy. Skew these when flow is predictably one-sided
    // (e.g. a monotonic-up index gets a fatter short pool, since the short
    // pool pays long winners).
    subsidyLong: 500,
    subsidyShort: 500,
    // Prod rollout protocol: create unlisted, self-trade a sanity pass, then
    // flip public (see backend/shared/src/perps/README.md).
    unlisted: false,
  })
  const [topics, setTopics] = useState<Group[]>([])
  const [knownFeeds, setKnownFeeds] = useState<string[]>([])
  const [feedLatest, setFeedLatest] = useState<{
    feedId: string
    price: number
    ts: number
  } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!isAdmin) return
    api('get-known-oracle-feeds', {})
      .then((feeds) => setKnownFeeds(feeds))
      .catch(() => {})
  }, [isAdmin])

  // Live feed-health preview: show the chosen feed's latest point and its age
  // so a stale or mistyped feed is obvious before submitting.
  useEffect(() => {
    const feedId = form.oracleFeedId.trim()
    setFeedLatest(null)
    if (!feedId) return
    let cancelled = false
    const t = setTimeout(() => {
      api('get-oracle-price', { feedId })
        .then((res) => {
          if (cancelled || !res.latest) return
          setFeedLatest({
            feedId,
            price: res.latest.price,
            ts: res.latest.ts,
          })
        })
        .catch(() => {})
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [form.oracleFeedId])

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const subsidyTotal = form.subsidyLong + form.subsidyShort

  // Convert annual % to per-hour fraction (the unit the engine stores).
  const maxFundingRatePerPeriod =
    form.maxFundingRateAnnualPct / 100 / HOURS_PER_YEAR

  const feedAgeMins = feedLatest
    ? Math.round((Date.now() - feedLatest.ts) / MINUTE_MS)
    : null
  const feedOlderThanMaxAge =
    feedLatest !== null &&
    Date.now() - feedLatest.ts > form.maxOraclePriceAgeHours * HOUR_MS

  const addTopic = (group: Group) =>
    setTopics((ts) => (ts.some((t) => t.id === group.id) ? ts : [...ts, group]))
  const removeTopic = (id: string) =>
    setTopics((ts) => ts.filter((t) => t.id !== id))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await api('create-perp', {
        question: form.question,
        description: form.description || undefined,
        oracleFeedId: form.oracleFeedId.trim(),
        maxLeverage: form.maxLeverage,
        maxFundingRate: maxFundingRatePerPeriod,
        fundingSensitivity: form.fundingSensitivity,
        maxOraclePriceAgeMs: Math.round(form.maxOraclePriceAgeHours * HOUR_MS),
        subsidyLong: form.subsidyLong,
        subsidyShort: form.subsidyShort,
        groupIds: topics.length ? topics.map((t) => t.id) : undefined,
        visibility: form.unlisted ? 'unlisted' : 'public',
      })
      toast.success(`Created ${res.question}`)
      window.location.href = res.url
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to create perp')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isAdmin) return <></>

  return (
    <Page trackPageView={'admin create perp page'}>
      <NoSEO />
      <div className="mx-8 max-w-2xl">
        <Title>Admin — Create perp market</Title>
        <form onSubmit={submit} className="space-y-4">
          <LabeledInput
            label="Question"
            value={form.question}
            onChange={(v) => update('question', v)}
            required
          />
          <div>
            <span className="text-ink-700 mb-2 block text-sm font-medium">
              Description
            </span>
            <textarea
              className="border-ink-300 bg-canvas-0 min-h-[120px] w-full rounded-md border px-3 py-2 text-sm"
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
            />
          </div>

          <div>
            <span className="text-ink-700 mb-2 block text-sm font-medium">
              Oracle feed ID
            </span>
            <Input
              list="known-oracle-feeds"
              value={form.oracleFeedId}
              onChange={(e) => update('oracleFeedId', e.target.value)}
              required
              className="w-full"
              placeholder="e.g. btc-usd"
            />
            <datalist id="known-oracle-feeds">
              {knownFeeds.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
            {feedLatest ? (
              <p
                className={
                  feedOlderThanMaxAge
                    ? 'mt-1 text-xs text-red-600'
                    : 'text-ink-500 mt-1 text-xs'
                }
              >
                Latest point: {feedLatest.price} · {feedAgeMins} min ago
                {feedOlderThanMaxAge &&
                  ' — older than the max price age below; trading would be blocked until the feed updates'}
              </p>
            ) : (
              <p className="text-ink-500 mt-1 text-xs">
                Must already exist in <code>oracle_prices</code>. Have an
                internal service write a price before creating.
              </p>
            )}
          </div>

          <div>
            <span className="text-ink-700 mb-2 block text-sm font-medium">
              Topics
            </span>
            {topics.length > 0 && (
              <Row className="mb-2 flex-wrap gap-1">
                {topics.map((t) => (
                  <span
                    key={t.id}
                    className="bg-primary-100 text-primary-800 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                  >
                    {t.name}
                    <button
                      type="button"
                      onClick={() => removeTopic(t.id)}
                      aria-label={`Remove topic ${t.name}`}
                    >
                      <XIcon className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </Row>
            )}
            <TopicSelector
              setSelectedGroup={addTopic}
              selectedIds={topics.map((t) => t.id)}
              addingToContract={false}
            />
            <p className="text-ink-500 mt-1 text-xs">
              Tag topics so the market shows up on topic pages and in feeds.
            </p>
          </div>

          <Row className="flex-wrap gap-4">
            <NumberInput
              label="Max leverage"
              value={form.maxLeverage}
              onChange={(v) => update('maxLeverage', v)}
              step={1}
              min={1.01}
            />
            <NumberInput
              label="Max funding rate (% / year)"
              value={form.maxFundingRateAnnualPct}
              onChange={(v) => update('maxFundingRateAnnualPct', v)}
              step={1}
              min={0.01}
              // The engine caps the per-period rate at 1 (100%/hr). Skewed
              // markets need real teeth (Kalshi caps at ~6%/day), so allow
              // well past 100%/yr; the hint shows the per-hour/per-day cost.
              max={8000}
              hint={`= ${(maxFundingRatePerPeriod * 100).toFixed(4)}%/hr, ${(
                maxFundingRatePerPeriod *
                24 *
                100
              ).toFixed(2)}%/day max`}
            />
            <NumberInput
              label="Funding sensitivity (k)"
              value={form.fundingSensitivity}
              onChange={(v) => update('fundingSensitivity', v)}
              step={0.1}
              min={0.01}
            />
            <NumberInput
              label="Max oracle price age (hours)"
              value={form.maxOraclePriceAgeHours}
              onChange={(v) => update('maxOraclePriceAgeHours', v)}
              step={1}
              min={0.0167} // ~1 minute
              hint="Opens/closes are blocked while the feed is older than this. Must be at least the feed's expected update interval."
            />
          </Row>

          <Row className="flex-wrap gap-4">
            <NumberInput
              label="Long subsidy (mana)"
              value={form.subsidyLong}
              onChange={(v) => update('subsidyLong', v)}
              step={100}
              min={1}
            />
            <NumberInput
              label="Short subsidy (mana)"
              value={form.subsidyShort}
              onChange={(v) => update('subsidyShort', v)}
              step={100}
              min={1}
              hint={`Total ${subsidyTotal} paid by you at creation. Skew toward the side that will pay winners (e.g. fat short pool for a monotonic-up index).`}
            />
          </Row>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.unlisted}
              onChange={(e) => update('unlisted', e.target.checked)}
            />
            Create unlisted (prod rollout: sanity-check by self-trading, then
            flip public)
          </label>

          <Col>
            <Button type="submit" loading={submitting} disabled={submitting}>
              Create perp
            </Button>
          </Col>
        </form>
      </div>
    </Page>
  )
}

const LabeledInput = (props: {
  label: string
  value: string
  onChange: (v: string) => void
  required?: boolean
}) => (
  <div>
    <span className="text-ink-700 mb-2 block text-sm font-medium">
      {props.label}
    </span>
    <Input
      type="text"
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      required={props.required}
      className="w-full"
    />
  </div>
)

const NumberInput = (props: {
  label: string
  value: number
  onChange: (v: number) => void
  // Accepted for caller API compatibility but not forwarded to the DOM.
  // HTML5 step validation rejects values that aren't min + n*step, which
  // surprises users (e.g. min=1.01, step=1 rejects 100). We always use
  // step="any" and rely only on min/max bounds.
  step?: number
  min?: number
  max?: number
  hint?: string
}) => (
  <div className="min-w-[180px] flex-1">
    <span className="text-ink-700 mb-2 block text-sm font-medium">
      {props.label}
    </span>
    <Input
      type="number"
      value={props.value}
      onChange={(e) => props.onChange(Number(e.target.value))}
      step="any"
      min={props.min}
      max={props.max}
      className="w-full"
    />
    {props.hint && <p className="text-ink-500 mt-1 text-xs">{props.hint}</p>}
  </div>
)
