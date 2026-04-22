import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { PerpContract } from 'common/contract'
import { formatMoney } from 'common/util/format'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { api } from 'web/lib/api/api'
import { useUser } from 'web/hooks/use-user'

type Position = {
  userId: string
  direction: 'long' | 'short'
  size: number
  costBasis: number
  originalCostBasis: number
  entryPrice: number
  leverage: number
  liquidationPrice: number
}

export const PerpPositionPanel = (props: { contract: PerpContract }) => {
  const { contract } = props
  const user = useUser()
  const [positions, setPositions] = useState<Position[]>([])
  const [closing, setClosing] = useState<'long' | 'short' | null>(null)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    if (!user) {
      setPositions([])
      return
    }
    let cancelled = false
    api('get-perp-positions', {
      contractId: contract.id,
      userId: user.id,
    }).then((p) => {
      if (!cancelled) setPositions(p)
    })
    return () => {
      cancelled = true
    }
  }, [contract.id, user?.id, refresh])

  if (!user) return null
  if (!positions.length) return null

  const close = async (direction: 'long' | 'short') => {
    setClosing(direction)
    try {
      const res = await api('close-perp-position', {
        contractId: contract.id,
        direction,
      })
      toast.success(
        `Closed ${direction} — payout ${formatMoney(res.payout)} (PnL ${formatMoney(
          res.pnl
        )})`
      )
      setRefresh((r) => r + 1)
    } catch (err: any) {
      toast.error(err?.message ?? 'Close failed')
    } finally {
      setClosing(null)
    }
  }

  return (
    <Col className="border-ink-200 gap-2 rounded-md border p-4">
      <div className="text-ink-700 text-sm font-semibold">Your positions</div>
      {positions.map((p) => {
        const price = Number(contract.oraclePrice)
        const side = p.direction === 'long' ? 1 : -1
        const unrealized = side * p.size * (price - p.entryPrice)
        const displayPnl =
          unrealized + (p.costBasis - p.originalCostBasis) * -1
        return (
          <Row
            key={p.direction}
            className="items-center justify-between gap-4"
          >
            <Col>
              <div
                className={
                  p.direction === 'long' ? 'text-teal-600' : 'text-red-600'
                }
              >
                {p.direction.toUpperCase()} {p.leverage.toFixed(2)}×
              </div>
              <div className="text-ink-500 text-xs">
                size {p.size.toFixed(4)} @ {p.entryPrice.toFixed(4)} — liq{' '}
                {p.liquidationPrice.toFixed(4)}
              </div>
            </Col>
            <Col className="items-end">
              <div
                className={displayPnl >= 0 ? 'text-teal-600' : 'text-red-600'}
              >
                {formatMoney(displayPnl)}
              </div>
              <Button
                size="xs"
                color="gray-outline"
                onClick={() => close(p.direction)}
                loading={closing === p.direction}
                disabled={closing !== null}
              >
                Close
              </Button>
            </Col>
          </Row>
        )
      })}
    </Col>
  )
}
