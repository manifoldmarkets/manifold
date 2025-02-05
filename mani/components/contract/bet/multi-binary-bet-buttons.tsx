import { Row } from 'components/layout/row'
import { useState } from 'react'
import { BetPanel, BinaryOutcomes } from './bet-panel'
import {
  CPMMMultiContract,
  getMainBinaryMCAnswer,
  isSportsContract,
} from 'common/contract'
import { Button, ButtonProps } from 'components/buttons/button'
import { AnswerProbability } from '../probability'
import { ThemedText } from 'components/themed-text'
import { useColor } from 'hooks/use-color'
import { Image } from 'react-native'
import { Col } from 'components/layout/col'

export function MultiBinaryBetButtons({
  contract,
  ...rest
}: {
  contract: CPMMMultiContract
} & ButtonProps) {
  const [openBetPanel, setOpenBetPanel] = useState(false)
  const [outcome, setOutcome] = useState<BinaryOutcomes>('YES')
  const [selectedAnswerIndex, setSelectedAnswerIndex] = useState<number>(0)
  const color = useColor()

  const handleBetClick = (selectedOutcome: BinaryOutcomes, index: number) => {
    setOutcome(selectedOutcome)
    setSelectedAnswerIndex(index)
    setOpenBetPanel(true)
  }

  const selectedAnswer = contract.answers[selectedAnswerIndex]
  const isSports = isSportsContract(contract)

  return (
    <>
      <Row style={{ gap: 12, alignItems: 'center' }}>
        {contract.answers.map((answer, i) => (
          <Col
            key={answer.id}
            style={{ alignItems: 'center', gap: 8, flex: 1 }}
          >
            <Col style={{ alignItems: 'center', flex: 1, gap: 8 }}>
              {answer.imageUrl && (
                <Image
                  source={{ uri: answer.imageUrl }}
                  style={{ width: 40, height: 40 }}
                />
              )}
              <Col style={{ flex: 1, justifyContent: 'center' }}>
                {isSports && (
                  <ThemedText
                    size="md"
                    color={color.text}
                    weight="semibold"
                    style={{ textAlign: 'center' }}
                  >
                    {answer.text}
                  </ThemedText>
                )}
              </Col>
            </Col>
            <Button
              onPress={() => handleBetClick(i === 0 ? 'YES' : 'NO', i)}
              style={{ width: '100%' }}
              variant="gray"
              textProps={{
                weight: 'normal',
              }}
              {...rest}
            >
              <ThemedText color={color.textSecondary}>
                {answer.shortText || answer.text}
              </ThemedText>{' '}
              <AnswerProbability contract={contract} answerId={answer.id} />
            </Button>
          </Col>
        ))}
      </Row>
      {openBetPanel && (
        <BetPanel
          contract={contract}
          open={openBetPanel}
          setOpen={setOpenBetPanel}
          outcome={outcome}
          multiProps={{
            answers: contract.answers,
            answerToBuy: getMainBinaryMCAnswer(contract)!,
            answerText: selectedAnswer.text,
          }}
        />
      )}
    </>
  )
}
