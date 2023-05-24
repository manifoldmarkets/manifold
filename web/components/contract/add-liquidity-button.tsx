import { useState } from 'react'
import clsx from 'clsx'

import { buttonClass } from 'web/components/buttons/button'
import { CPMMContract } from 'common/contract'
import { LiquidityModal } from './liquidity-modal'

export function AddLiquidityButton(props: {
  contract: CPMMContract
  className?: string
}) {
  const { contract, className } = props

  const [open, setOpen] = useState(false)

  const disabled =
    contract.isResolved || (contract.closeTime ?? Infinity) < Date.now()

  if (disabled) return <></>

  return (
    <a
      className={clsx(
        buttonClass('sm', 'override'),
        'cursor-pointer',
        'hover:text-ink-0 gap-1 border-2 border-blue-400 text-blue-400 hover:bg-blue-400',
        className
      )}
      onClick={() => setOpen(true)}
    >
      <div>💧 Subsidize</div>
      <LiquidityModal contract={contract} isOpen={open} setOpen={setOpen} />
    </a>
  )
}
