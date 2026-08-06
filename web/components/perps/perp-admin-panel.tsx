import { useState } from 'react'
import { toast } from 'react-hot-toast'
import { PerpContract } from 'common/contract'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Input } from 'web/components/widgets/input'
import { useAdmin } from 'web/hooks/use-admin'
import { api } from 'web/lib/api/api'

// Admin-only live risk tuning for a perp market. The change applies to the
// next trade immediately (the engine re-reads the contract per trade), and
// other open pages converge within one 15s poll via useLivePerpContract's
// maxLeverage overlay.
export const PerpAdminPanel = (props: { contract: PerpContract }) => {
  const { contract } = props
  const isAdmin = useAdmin()
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  // Bridge the gap between a successful save and the next contract poll so
  // the panel never shows the pre-save cap right after confirming.
  const [justSaved, setJustSaved] = useState<number | null>(null)
  if (!isAdmin || contract.isResolved) return null

  const current =
    justSaved != null && justSaved !== contract.maxLeverage
      ? justSaved
      : contract.maxLeverage
  const parsed = Number(input)
  const valid =
    input !== '' && Number.isFinite(parsed) && parsed > 1 && parsed <= 100
  const isLowering = valid && parsed < current

  const submit = async () => {
    if (!valid || saving) return
    setSaving(true)
    try {
      const res = await api('update-perp-config', {
        contractId: contract.id,
        maxLeverage: parsed,
      })
      setJustSaved(res.maxLeverage)
      setInput('')
      toast.success(`Max leverage is now ${res.maxLeverage}×`)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to update max leverage'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Col className="border-ink-300 bg-canvas-50 gap-1.5 rounded-lg border border-dashed p-3">
      <Row className="items-center justify-between">
        <span className="text-ink-600 text-sm font-semibold">
          Admin: max leverage
        </span>
        <span className="text-ink-900 font-mono text-sm font-semibold tabular-nums">
          {current}×
        </span>
      </Row>
      <Row className="items-center gap-2">
        <Input
          type="number"
          min={1}
          max={100}
          step={0.5}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`${current}`}
          className="h-8 w-24 text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
        />
        <Button
          size="2xs"
          color="indigo-outline"
          disabled={!valid || saving || parsed === current}
          loading={saving}
          onClick={submit}
        >
          Set
        </Button>
        <span className="text-ink-500 text-xs">
          {valid
            ? isLowering
              ? 'Lowering only limits new positions — existing ones are untouched.'
              : 'Applies to the next trade; open pages converge within 15s.'
            : 'Between 1 and 100 (exclusive of 1).'}
        </span>
      </Row>
    </Col>
  )
}
