import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { PerpContract } from 'common/contract'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Input } from 'web/components/widgets/input'
import { Row } from 'web/components/layout/row'
import { api } from 'web/lib/api/api'
import { useUser } from 'web/hooks/use-user'

type OpenPosition = { direction: 'long' | 'short' }

export const PerpBetPanel = (props: { contract: PerpContract }) => {
  const { contract } = props
  const user = useUser()

  const [direction, setDirection] = useState<'long' | 'short'>('long')
  const [mana, setMana] = useState(10)
  const [leverage, setLeverage] = useState(2)
  const [submitting, setSubmitting] = useState(false)
  const [openDirection, setOpenDirection] = useState<
    'long' | 'short' | null
  >(null)

  // Pre-fetch the user's existing position so we can reflect one-way mode in
  // the UI. Backend enforcement still runs in `place-perp-trade` — this just
  // avoids a confusing "trade failed: one-way mode" toast.
  useEffect(() => {
    let cancelled = false
    if (!user) {
      setOpenDirection(null)
      return
    }
    api('get-perp-positions', { contractId: contract.id, userId: user.id })
      .then((positions: OpenPosition[]) => {
        if (cancelled) return
        const open = positions.find((p) => p.direction)
        if (open) {
          setOpenDirection(open.direction)
          setDirection(open.direction)
        } else {
          setOpenDirection(null)
        }
      })
      .catch(() => {
        if (!cancelled) setOpenDirection(null)
      })
    return () => {
      cancelled = true
    }
  }, [user?.id, contract.id])

  const onSubmit = async () => {
    if (!user) {
      toast.error('Sign in to trade')
      return
    }
    if (mana <= 0 || leverage <= 0) {
      toast.error('Enter a positive size and leverage')
      return
    }
    if (leverage > contract.maxLeverage) {
      toast.error(`Max leverage is ${contract.maxLeverage}×`)
      return
    }
    if (openDirection && direction !== openDirection) {
      toast.error(
        `Close your ${openDirection} position before opening a ${direction}`
      )
      return
    }
    setSubmitting(true)
    try {
      const res = await api('place-perp-trade', {
        contractId: contract.id,
        direction,
        mana,
        leverage,
      })
      toast.success(
        `Opened ${direction} at ${res.position.entryPrice.toFixed(4)} — liq ${res.position.liquidationPrice.toFixed(
          4
        )}`
      )
      setOpenDirection(direction)
    } catch (err: any) {
      toast.error(err?.message ?? 'Trade failed')
    } finally {
      setSubmitting(false)
    }
  }

  const notional = mana * leverage
  const longDisabled = openDirection === 'short'
  const shortDisabled = openDirection === 'long'
  const disabledReason =
    openDirection && direction !== openDirection
      ? `One-way mode: close your ${openDirection} first`
      : null

  return (
    <Col className="border-ink-200 gap-3 rounded-md border p-4">
      <Row className="gap-2">
        <Button
          color={direction === 'long' ? 'green' : 'gray-outline'}
          onClick={() => !longDisabled && setDirection('long')}
          disabled={longDisabled}
          className="flex-1"
        >
          {openDirection === 'long' ? 'Add to long' : 'Long'}
        </Button>
        <Button
          color={direction === 'short' ? 'red' : 'gray-outline'}
          onClick={() => !shortDisabled && setDirection('short')}
          disabled={shortDisabled}
          className="flex-1"
        >
          {openDirection === 'short' ? 'Add to short' : 'Short'}
        </Button>
      </Row>

      <Row className="items-end gap-4">
        <Col className="flex-1">
          <label className="text-ink-600 text-sm">Margin (mana)</label>
          <Input
            type="number"
            value={mana}
            min={1}
            step={1}
            onChange={(e) => setMana(Number(e.target.value))}
          />
        </Col>
        <Col className="flex-1">
          <label className="text-ink-600 text-sm">
            Leverage (max {contract.maxLeverage}×)
          </label>
          <Input
            type="number"
            value={leverage}
            min={1}
            max={contract.maxLeverage}
            step={0.5}
            onChange={(e) => setLeverage(Number(e.target.value))}
          />
        </Col>
      </Row>

      <div className="text-ink-600 text-sm">
        Notional: {notional.toFixed(2)} mana — funding rate{' '}
        {(((contract as any).fundingRate ?? 0) * 100).toFixed(3)}% / period
      </div>

      {disabledReason && (
        <div className="text-ink-500 text-xs">{disabledReason}</div>
      )}

      <Button
        color={direction === 'long' ? 'green' : 'red'}
        onClick={onSubmit}
        loading={submitting}
        disabled={submitting || !user || !!disabledReason}
      >
        {openDirection === direction
          ? `Add to ${direction}`
          : direction === 'long'
          ? 'Open long'
          : 'Open short'}{' '}
        @ {Number(contract.oraclePrice).toFixed(4)}
      </Button>
    </Col>
  )
}
