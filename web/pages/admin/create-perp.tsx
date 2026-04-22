import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { HOUR_MS } from 'common/util/time'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { NoSEO } from 'web/components/NoSEO'
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
    maxPositionNotionalFraction: 0.25,
    maxOraclePriceAgeHours: 6,
    // Total creator subsidy, split 50/50 across the long and short pools.
    subsidyTotal: 1000,
  })
  const [knownFeeds, setKnownFeeds] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!isAdmin) return
    api('get-known-oracle-feeds', {})
      .then((feeds) => setKnownFeeds(feeds))
      .catch(() => {})
  }, [isAdmin])

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  // Split the total 50/50; put the stray mana on the long side for odd totals.
  const subsidyLong = Math.ceil(form.subsidyTotal / 2)
  const subsidyShort = Math.floor(form.subsidyTotal / 2)

  // Convert annual % to per-hour fraction (the unit the engine stores).
  const maxFundingRatePerPeriod =
    form.maxFundingRateAnnualPct / 100 / HOURS_PER_YEAR

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await api('create-perp', {
        question: form.question,
        description: form.description || undefined,
        oracleFeedId: form.oracleFeedId,
        maxLeverage: form.maxLeverage,
        maxFundingRate: maxFundingRatePerPeriod,
        fundingSensitivity: form.fundingSensitivity,
        maxPositionNotionalFraction: form.maxPositionNotionalFraction,
        maxOraclePriceAgeMs: Math.round(
          form.maxOraclePriceAgeHours * HOUR_MS
        ),
        subsidyLong,
        subsidyShort,
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
            <label className="text-ink-700 mb-2 block text-sm font-medium">
              Description
            </label>
            <textarea
              className="border-ink-300 bg-canvas-0 min-h-[120px] w-full rounded-md border px-3 py-2 text-sm"
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
            />
          </div>

          <div>
            <label className="text-ink-700 mb-2 block text-sm font-medium">
              Oracle feed ID
            </label>
            <Input
              list="known-oracle-feeds"
              value={form.oracleFeedId}
              onChange={(e) => update('oracleFeedId', e.target.value)}
              required
              className="w-full"
              placeholder="e.g. coingecko:bitcoin"
            />
            <datalist id="known-oracle-feeds">
              {knownFeeds.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
            <p className="text-ink-500 mt-1 text-xs">
              Must already exist in <code>oracle_prices</code>. Have an
              internal service write a price before creating.
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
              max={100}
              hint={`= ${(maxFundingRatePerPeriod * 100).toFixed(4)}% per hour`}
            />
            <NumberInput
              label="Funding sensitivity (k)"
              value={form.fundingSensitivity}
              onChange={(v) => update('fundingSensitivity', v)}
              step={0.1}
              min={0.01}
            />
            <NumberInput
              label="Max position notional (fraction of opposite pool)"
              value={form.maxPositionNotionalFraction}
              onChange={(v) => update('maxPositionNotionalFraction', v)}
              step={0.05}
              min={0.01}
              max={1}
            />
            <NumberInput
              label="Max oracle price age (hours)"
              value={form.maxOraclePriceAgeHours}
              onChange={(v) => update('maxOraclePriceAgeHours', v)}
              step={1}
              min={0.0167} // ~1 minute
            />
          </Row>

          <NumberInput
            label="Total subsidy (mana)"
            value={form.subsidyTotal}
            onChange={(v) => update('subsidyTotal', v)}
            step={100}
            min={2}
            hint={`Split 50/50: ${subsidyLong} long / ${subsidyShort} short. Paid by creator at market creation.`}
          />

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
    <label className="text-ink-700 mb-2 block text-sm font-medium">
      {props.label}
    </label>
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
    <label className="text-ink-700 mb-2 block text-sm font-medium">
      {props.label}
    </label>
    <Input
      type="number"
      value={props.value}
      onChange={(e) => props.onChange(Number(e.target.value))}
      step="any"
      min={props.min}
      max={props.max}
      className="w-full"
    />
    {props.hint && (
      <p className="text-ink-500 mt-1 text-xs">{props.hint}</p>
    )}
  </div>
)
