import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { XIcon } from '@heroicons/react/solid'
import { Group } from 'common/group'
import { fundingPeriodNoun, fundingPeriodUnit } from 'common/perps/funding'
import { DAY_MS, HOUR_MS, MINUTE_MS, YEAR_MS } from 'common/util/time'
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
    // Per-side creator subsidy. Start symmetric; observed flow and stress
    // tests, not a structurally one-sided oracle, should justify any skew.
    subsidyLong: 500,
    subsidyShort: 500,
    // Prod rollout protocol: create unlisted, self-trade a sanity pass, then
    // flip public (see backend/shared/src/perps/README.md).
    unlisted: false,
  })
  const [topics, setTopics] = useState<Group[]>([])
  const [knownFeeds, setKnownFeeds] = useState<
    {
      id: string
      updatePeriodMs: number | null
      marketCreationEnabled: boolean
      description: string | null
      launchLatencyRisk: string | null
      launchRecommendation: {
        maxLeverage: number
        maxOraclePriceAgeMs: number
        subsidyLong: number
        subsidyShort: number
      } | null
    }[]
  >([])
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

  // The engine stores maxFundingRate per FUNDING PERIOD, and the period is
  // derived server-side from the feed's cadence: max(1h, updatePeriodMs).
  // Mirror that derivation for the conversion — dividing an annual rate by
  // hours-per-year on a daily feed would understate the cap 24x (the engine
  // fires once a day, not hourly).
  const selectedFeed = knownFeeds.find((f) => f.id === form.oracleFeedId.trim())
  const feedCreationDisabled = selectedFeed?.marketCreationEnabled === false
  const unregisteredFeed =
    feedCreationDisabled && selectedFeed?.updatePeriodMs == null
  const fundingPeriodMs = selectedFeed?.updatePeriodMs
    ? Math.max(HOUR_MS, selectedFeed.updatePeriodMs)
    : HOUR_MS

  // Convert annual % to the per-period fraction the engine stores.
  const maxFundingRatePerPeriod =
    form.maxFundingRateAnnualPct / 100 / (YEAR_MS / fundingPeriodMs)

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
    if (feedCreationDisabled) {
      toast.error(
        unregisteredFeed
          ? 'This feed is not registered for perp market creation.'
          : 'This feed is disabled for new perp markets.'
      )
      return
    }
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create perp')
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
              {knownFeeds
                .filter((f) => f.marketCreationEnabled)
                .map((f) => (
                  <option key={f.id} value={f.id} />
                ))}
            </datalist>
            {feedLatest ? (
              <p
                className={
                  feedOlderThanMaxAge || feedCreationDisabled
                    ? 'mt-1 text-xs text-red-600'
                    : 'text-ink-500 mt-1 text-xs'
                }
              >
                Latest point: {feedLatest.price} · {feedAgeMins} min ago ·
                funding period {Math.round(fundingPeriodMs / HOUR_MS)}h (from
                feed cadence)
                {feedOlderThanMaxAge &&
                  ' — older than the max price age below; trading would be blocked until the feed updates'}
                {unregisteredFeed &&
                  ' — ⚠ not in the oracle feed registry; create will be rejected'}
              </p>
            ) : (
              <p className="text-ink-500 mt-1 text-xs">
                Must already exist in <code>oracle_prices</code>. Have an
                internal service write a price before creating.
              </p>
            )}
            {feedCreationDisabled && !unregisteredFeed && (
              <p className="mt-1 text-xs text-red-600">
                This feed is retained for runtime/history but is disabled for
                new perp markets.
              </p>
            )}
            {selectedFeed?.launchLatencyRisk && (
              <div className="border-primary-300 bg-primary-50 text-ink-700 mt-2 rounded-md border p-3 text-xs">
                <div className="font-semibold">
                  Exact-price oracle latency risk
                </div>
                <p className="mt-1">{selectedFeed.launchLatencyRisk}</p>
                {selectedFeed.launchRecommendation && (
                  <p className="mt-1">
                    Day-one recommendation: at most{' '}
                    {selectedFeed.launchRecommendation.maxLeverage}× leverage,
                    max oracle age{' '}
                    {selectedFeed.launchRecommendation.maxOraclePriceAgeMs /
                      HOUR_MS}
                    h, backing M$
                    {selectedFeed.launchRecommendation.subsidyLong} long / M$
                    {selectedFeed.launchRecommendation.subsidyShort} short.
                  </p>
                )}
              </div>
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
              // The engine caps the per-period rate at 1 (100%/period).
              // Skewed markets need real teeth (Kalshi caps at ~6%/day), so
              // allow well past 100%/yr; the hint shows the per-period cost.
              max={8000}
              hint={`= ${(maxFundingRatePerPeriod * 100).toFixed(
                4
              )}%/${fundingPeriodUnit(fundingPeriodMs)} max${
                fundingPeriodMs < DAY_MS
                  ? `, ${(
                      maxFundingRatePerPeriod *
                      (DAY_MS / fundingPeriodMs) *
                      100
                    ).toFixed(2)}%/day`
                  : ''
              } — charged once per ${fundingPeriodNoun(fundingPeriodMs)}`}
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
              hint={`Total ${subsidyTotal} paid by you at creation. Use symmetric pools for launch unless observed flow and stress tests support a deliberate skew.`}
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
            <Button
              type="submit"
              loading={submitting}
              disabled={submitting || feedCreationDisabled}
            >
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
