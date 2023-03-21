import { useState } from 'react'
import { CPMMBinaryContract } from 'common/contract'
import { Button } from '../buttons/button'
import { BetDialog } from './bet-dialog'
import { binaryOutcomes } from './bet-panel'

export function BetRow(props: { contract: CPMMBinaryContract }) {
  const { contract } = props
  const [outcome, setOutcome] = useState<binaryOutcomes>()
  const [betDialogOpen, setBetDialogOpen] = useState(false)

  return (
    <>
      <Button
        size="2xs"
        color="gray-outline"
        className="!ring-1"
        onClick={(e) => {
          e.stopPropagation()
          setOutcome('YES')
          setBetDialogOpen(true)
        }}
      >
        Bet YES
      </Button>
      <Button
        size="2xs"
        color="gray-outline"
        className="!ring-1"
        onClick={(e) => {
          e.stopPropagation()
          setOutcome('NO')
          setBetDialogOpen(true)
        }}
      >
        Bet NO
      </Button>

      <BetDialog
        contract={contract}
        initialOutcome={outcome}
        open={betDialogOpen}
        setOpen={setBetDialogOpen}
      />
    </>
  )
}
