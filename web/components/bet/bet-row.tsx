import clsx from 'clsx'
import { useState } from 'react'

import { CPMMBinaryContract } from 'common/contract'
import { baseButtonClasses, sizeClasses } from '../buttons/button'
import { BetDialog } from './bet-dialog'
import { binaryOutcomes } from './bet-panel'

export function BetRow(props: {
  contract: CPMMBinaryContract
  buttonClassName?: string
}) {
  const { contract, buttonClassName } = props
  const [outcome, setOutcome] = useState<binaryOutcomes>()
  const [betDialogOpen, setBetDialogOpen] = useState(false)

  return (
    <>
      <button
        className={clsx(
          buttonClassName,
          baseButtonClasses,
          sizeClasses['2xs'],
          'border-ink-400 text-ink-500 hover:bg-ink-100 border disabled:opacity-50'
        )}
        type="button"
        onClick={(e) => {
          e.preventDefault()
          setOutcome('YES')
          setBetDialogOpen(true)
        }}
      >
        Bet YES
      </button>
      <button
        className={clsx(
          buttonClassName,
          baseButtonClasses,
          sizeClasses['2xs'],
          'border-ink-400 text-ink-500 hover:bg-ink-100 border disabled:opacity-50'
        )}
        onClick={(e) => {
          e.preventDefault()
          setOutcome('NO')
          setBetDialogOpen(true)
        }}
      >
        Bet NO
      </button>

      <BetDialog
        contract={contract}
        initialOutcome={outcome}
        open={betDialogOpen}
        setOpen={setBetDialogOpen}
      />
    </>
  )
}
