import { Contract } from 'common/contract'
import { YesNoButton } from 'components/buttons/YesNoButtons'
import { Row } from 'components/layout/row'
import { useState } from 'react'
import { BetPanel, BinaryOutcomes } from './BetPanel'

export function BinaryBetButtons({ contract }: { contract: Contract }) {
  const [openBetPanel, setOpenBetPanel] = useState(false)
  const [outcome, setOutcome] = useState<BinaryOutcomes>('YES')

  const handleBetClick = (selectedOutcome: BinaryOutcomes) => {
    setOutcome(selectedOutcome)
    setOpenBetPanel(true)
  }

  return (
    <>
      <Row style={{ gap: 12, alignItems: 'center' }}>
        <YesNoButton
          onPress={() => handleBetClick('YES')}
          variant="yes"
          size="sm"
          style={{ flex: 1 }}
        />
        <YesNoButton
          onPress={() => handleBetClick('NO')}
          variant="no"
          size="sm"
          style={{ flex: 1 }}
        />
      </Row>
      <BetPanel
        contract={contract}
        open={openBetPanel}
        setOpen={setOpenBetPanel}
        outcome={outcome}
      />
    </>
  )
}
