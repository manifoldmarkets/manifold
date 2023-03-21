import { useState } from 'react'
import { CPMMBinaryContract } from 'common/contract'
import { Button } from '../buttons/button'
import { BetDialog } from './bet-dialog'
import { binaryOutcomes } from './bet-panel'
import { firebaseLogin } from 'web/lib/firebase/users'

export function BetRow(props: {
  contract: CPMMBinaryContract
  noUser?: boolean

}) {
  const { contract, noUser } = props
  const [outcome, setOutcome] = useState<binaryOutcomes>()
  const [betDialogOpen, setBetDialogOpen] = useState(false)

  return (
    <>
      <Button
        size="2xs"
        color="gray-outline"
        className="!ring-1"
        onClick={(e) => {
          e.preventDefault()
          if (noUser) {
            firebaseLogin()
            return
          }
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
          e.preventDefault()
          if (noUser) {
            firebaseLogin()
            return
          }
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
