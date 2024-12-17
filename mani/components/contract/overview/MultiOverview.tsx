import { Row } from 'components/layout/row'
import { ThemedText } from 'components/ThemedText'
import { MultiContract } from 'common/contract'
import { Col } from 'components/layout/col'
import { AnswerProbability } from 'components/contract/Probability'
import { useColor } from 'hooks/useColor'
import { MultiBetButtons } from 'components/contract/bet/MultiBetButtons'

export function MultiOverview({ contract }: { contract: MultiContract }) {
  const color = useColor()

  return (
    <Col style={{ gap: 16 }}>
      {contract.answers?.map((answer) => (
        <Col
          key={answer.id}
          style={{
            gap: 8,
            paddingBottom: 16,
            borderBottomWidth: 1,
            borderBottomColor: color.border,
          }}
        >
          <Row
            key={answer.id}
            style={{
              width: '100%',
              justifyContent: 'space-between',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <ThemedText size="md" style={{ flex: 1 }}>
              {answer.text}
            </ThemedText>

            <AnswerProbability
              contract={contract}
              answerId={answer.id}
              size="lg"
            />
          </Row>
          <MultiBetButtons
            style={{ flex: 1 }}
            contract={contract}
            answerId={answer.id}
            gap={12}
          />
        </Col>
      ))}
    </Col>
  )
}
