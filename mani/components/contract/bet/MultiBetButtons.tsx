import { Contract } from 'common/contract'
import { YesNoButton } from 'components/buttons/YesNoButtons'
import { Row } from 'components/layout/row'
import { useState } from 'react'
import { BetPanel, BinaryOutcomes } from './BetPanel'
import { ButtonProps } from 'components/buttons/Button'

export function MultiBetButtons({
  contract,
  answerId,
  gap = 8,
  ...rest
}: {
  contract: Contract
  answerId: string
  gap?: number
} & ButtonProps) {
  const [openBetPanel, setOpenBetPanel] = useState(false)
  const [outcome, setOutcome] = useState<BinaryOutcomes>('YES')

  const handleBetClick = (selectedOutcome: BinaryOutcomes) => {
    setOutcome(selectedOutcome)
    setOpenBetPanel(true)
  }

  return (
    <>
      <Row style={{ gap: gap, alignItems: 'center' }}>
        <YesNoButton
          onPress={() => handleBetClick('YES')}
          variant="yes"
          {...rest}
        />
        <YesNoButton
          onPress={() => handleBetClick('NO')}
          variant="no"
          {...rest}
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
