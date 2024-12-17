import { Contract } from 'common/contract'
import { YesNoButton } from 'components/buttons/YesNoButtons'
import { Row } from 'components/layout/row'
import { useState } from 'react'
import { BetPanel, BinaryOutcomes } from './BetPanel'

export function MultiBetButtons({
  contract,
  answerId,
}: {
  contract: Contract
  answerId: string
}) {
  const [openBetPanel, setOpenBetPanel] = useState(false)
  const [outcome, setOutcome] = useState<BinaryOutcomes>('YES')

  const handleBetClick = (selectedOutcome: BinaryOutcomes) => {
    setOutcome(selectedOutcome)
    setOpenBetPanel(true)
  }

  return (
    <>
      <Row style={{ gap: 8, alignItems: 'center' }}>
        <YesNoButton
          onPress={() => handleBetClick('YES')}
          variant="yes"
          size="xs"
        />
        <YesNoButton
          onPress={() => handleBetClick('NO')}
          variant="no"
          size="xs"
        />
      </Row>
      <BetPanel
        contract={contract}
        open={openBetPanel}
        setOpen={setOpenBetPanel}
        outcome={outcome}
        answerId={answerId}
      />
    </>
  )
}
