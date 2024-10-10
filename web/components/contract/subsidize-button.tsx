import clsx from 'clsx'
import { MarketContract } from 'common/contract'
import { useState } from 'react'
import { Button } from '../buttons/button'

import { AddLiquidityModal } from './liquidity-modal'

export function SubsidizeButton(props: {
  contract: MarketContract
  className?: string
}) {
  const { contract, className } = props
  const [open, setOpen] = useState(false)

  const disabled =
    contract.isResolved ||
    (contract.closeTime ?? Infinity) < Date.now() ||
    contract.visibility !== 'public'

  if (disabled) return <></>

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="md"
        color="indigo-outline"
        className={clsx(className, 'group')}
      >
        Add Liquidity
      </Button>
      {open && (
        <AddLiquidityModal
          contract={contract}
          isOpen={open}
          setOpen={setOpen}
        />
      )}
    </>
  )
}
