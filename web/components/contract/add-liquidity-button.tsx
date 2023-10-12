import { useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { Contract } from 'common/contract'
import { LiquidityModal } from './liquidity-modal'

export function AddLiquidityButton(props: {
  contract: Contract
  className?: string
}) {
  const { contract, className } = props

  const [open, setOpen] = useState(false)

  const disabled =
    contract.isResolved ||
    (contract.closeTime ?? Infinity) < Date.now() ||
    (contract.mechanism !== 'cpmm-1' && contract.mechanism !== 'cpmm-multi-1')

  if (disabled) return null

  return (
    <>
      <Button
        color="indigo-outline"
        size="lg"
        className={className}
        onClick={() => setOpen(true)}
      >
        💦 Sub
      </Button>
      <LiquidityModal contract={contract} isOpen={open} setOpen={setOpen} />
    </>
  )
}
