import { Contract } from 'common/contract'
import { YesNoButton } from 'components/buttons/yes-no-buttons'
import { Row } from 'components/layout/row'
import { useState } from 'react'
import { BetPanel, BinaryOutcomes } from './bet-panel'
import { ButtonProps } from 'components/buttons/button'

export function BinaryBetButtons({
  contract,
  ...rest
}: { contract: Contract } & ButtonProps) {
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
          style={{ flex: 1 }}
          {...rest}
        />
        <YesNoButton
          onPress={() => handleBetClick('NO')}
          variant="no"
          style={{ flex: 1 }}
          {...rest}
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
