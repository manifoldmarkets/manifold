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

export default function AdminCreatePerpPage() {
  useRedirectIfSignedOut()
  const isAdmin = useAdmin()

  const [form, setForm] = useState({
    question: '',
    description: '',
    oracleFeedId: '',
    maxLeverage: 10,
    maxFundingRate: 0.01,
    fundingSensitivity: 1,
    maxPositionNotionalFraction: 0.25,
    maxOraclePriceAgeMs: 6 * HOUR_MS,
    subsidyLong: 500,
    subsidyShort: 500,
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await api('create-perp', {
        question: form.question,
        description: form.description || undefined,
        oracleFeedId: form.oracleFeedId,
        maxLeverage: form.maxLeverage,
        maxFundingRate: form.maxFundingRate,
        fundingSensitivity: form.fundingSensitivity,
        maxPositionNotionalFraction: form.maxPositionNotionalFraction,
        maxOraclePriceAgeMs: form.maxOraclePriceAgeMs,
        subsidyLong: form.subsidyLong,
        subsidyShort: form.subsidyShort,
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
              label="Max funding rate (fraction / period)"
              value={form.maxFundingRate}
              onChange={(v) => update('maxFundingRate', v)}
              step={0.001}
              min={0.0001}
              max={1}
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
              label="Max oracle price age (ms)"
              value={form.maxOraclePriceAgeMs}
              onChange={(v) => update('maxOraclePriceAgeMs', v)}
              step={HOUR_MS}
              min={60_000}
            />
          </Row>

          <Row className="gap-4">
            <NumberInput
              label="Long pool subsidy"
              value={form.subsidyLong}
              onChange={(v) => update('subsidyLong', v)}
              step={10}
              min={1}
            />
            <NumberInput
              label="Short pool subsidy"
              value={form.subsidyShort}
              onChange={(v) => update('subsidyShort', v)}
              step={10}
              min={1}
            />
          </Row>

          <p className="text-ink-600 text-sm">
            Total subsidy: {form.subsidyLong + form.subsidyShort} mana (paid
            by creator at market creation).
          </p>

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
  step?: number
  min?: number
  max?: number
}) => (
  <div className="min-w-[180px] flex-1">
    <label className="text-ink-700 mb-2 block text-sm font-medium">
      {props.label}
    </label>
    <Input
      type="number"
      value={props.value}
      onChange={(e) => props.onChange(Number(e.target.value))}
      step={props.step}
      min={props.min}
      max={props.max}
      className="w-full"
    />
  </div>
)
