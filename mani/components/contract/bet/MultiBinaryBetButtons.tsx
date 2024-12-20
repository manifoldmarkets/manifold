import { Row } from 'components/layout/row'
import { useState } from 'react'
import { BetPanel, BinaryOutcomes } from './BetPanel'
import { CPMMMultiContract } from 'common/contract'
import { Button, ButtonProps } from 'components/buttons/Button'
import { AnswerProbability } from '../Probability'
import { ThemedText } from 'components/ThemedText'
import { useColor } from 'hooks/use-color'

export function MultiBinaryBetButtons({
  contract,
  ...rest
}: {
  contract: CPMMMultiContract
} & ButtonProps) {
  const [openBetPanel, setOpenBetPanel] = useState(false)
  const [outcome, setOutcome] = useState<BinaryOutcomes>('YES')
  const color = useColor()

  const handleBetClick = (selectedOutcome: BinaryOutcomes) => {
    setOutcome(selectedOutcome)
    setOpenBetPanel(true)
  }

  return (
    <>
      <Row style={{ gap: 12, alignItems: 'center' }}>
        {contract.answers.map((answer, i) => (
          <Button
            key={answer.id}
            onPress={() => handleBetClick(i === 0 ? 'YES' : 'NO')}
            style={{ flex: 1 }}
            variant="gray"
            textProps={{
              weight: 'normal',
            }}
            {...rest}
          >
            <ThemedText color={color.textSecondary}>{answer.text}</ThemedText>{' '}
            <AnswerProbability contract={contract} answerId={answer.id} />
          </Button>
        ))}
      </Row>
      <BetPanel
        contract={contract}
        open={openBetPanel}
        answerId={
          outcome === 'YES' ? contract.answers[0].id : contract.answers[1].id
        }
        setOpen={setOpenBetPanel}
        outcome={outcome}
      />
    </>
  )
}
