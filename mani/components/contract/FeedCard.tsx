import {
  BinaryContract,
  Contract,
  MultiContract,
} from 'common/contract'
import { ThemedText } from 'components/ThemedText'
import { isBinaryMulti } from 'common/contract'
import { Row } from 'components/layout/row'
import { Col } from 'components/layout/col'
import { useColor } from 'hooks/useColor'
import { YesNoButton } from 'components/buttons/YesNoButtons'
import { AnswerProbability, BinaryProbability } from './Probability'
import { useState } from 'react'
import { BetPanel } from './bet/BetPanel'
import { BinaryBetButtons } from './bet/BinaryBetButtons'
import { MultiBetButtons } from './bet/MultiBetButtons'

export function FeedCard({ contract }: { contract: Contract }) {
  const isBinaryMc = isBinaryMulti(contract)
  const isMultipleChoice =
    contract.outcomeType == 'MULTIPLE_CHOICE' && !isBinaryMc
  const isBinary = !isBinaryMc && !isMultipleChoice
  const [betPanelOpen, setBetPanelOpen] = useState(false)
  const color = useColor()
  return (
    <Col
      style={{
        gap: 12,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: color.border,
      }}
    >
      <Row
        style={{
          gap: 8,
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
        }}
      >
        <ThemedText
          size="lg"
          weight="semibold"
          numberOfLines={2}
          style={{ flex: 1 }}
        >
          {contract.question}
        </ThemedText>
        {isBinary && (
          <Row
            style={{
              alignItems: 'center',
              width: 50,
              justifyContent: 'flex-end',
            }}
          >
            <BinaryProbability
              contract={contract as BinaryContract}
              size="xl"
            />
          </Row>
        )}
      </Row>

      {isMultipleChoice ? (
        //   !isBinaryMc &&
        <>
          {contract.answers
            .sort((a, b) => (b.prob ?? 0) - (a.prob ?? 0))
            .slice(0, 3)
            .map((answer) => (
              <Row
                key={answer.id}
                style={{
                  width: '100%',
                  justifyContent: 'space-between',
                  gap: 8,
                  alignItems: 'center',
                }}
              >
                <ThemedText
                  size="sm"
                  color={color.textSecondary}
                  numberOfLines={2}
                  style={{
                    flex: 1,
                    flexWrap: 'wrap',
                    lineHeight: 20,
                  }}
                >
                  {answer.text}
                </ThemedText>
                <Row style={{ gap: 12, alignItems: 'center', flexShrink: 0 }}>
                  <AnswerProbability
                    contract={contract as MultiContract}
                    answerId={answer.id}
                    size="md"
                    style={{ flexShrink: 0 }}
                  />
                  <MultiBetButtons contract={contract} answerId={answer.id} />
                </Row>
              </Row>
            ))}
          <Row style={{ weight: '100%', justifyContent: 'flex-end' }}>
            {contract.answers.length > 3 && (
              <ThemedText color={color.textSecondary} weight="semibold">
                + {contract.answers.length - 3} more
              </ThemedText>
            )}
          </Row>
        </>
      ) : (
        <BinaryBetButtons contract={contract} />
      )}
    </Col>
  )
}
