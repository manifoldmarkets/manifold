import { useLocalSearchParams } from 'expo-router'
import { Contract } from 'common/contract'
import { Col } from 'components/layout/col'
import { Row } from 'components/layout/row'
import { ThemedText } from 'components/ThemedText'
import { useColor } from 'hooks/useColor'
import { BinaryProbability } from 'components/contract/Probability'
import { AnswerProbability } from 'components/contract/Probability'
import { BinaryBetButtons } from 'components/contract/bet/BinaryBetButtons'
import { MultiBetButtons } from 'components/contract/bet/MultiBetButtons'
import { isBinaryMulti } from 'common/contract'
import Page from 'components/Page'

export default function ContractPage() {
  const { contractId } = useLocalSearchParams()
  const color = useColor()

  // TODO: Fetch contract data using contractId
  //   const contract: Contract = {} // Replace with actual contract fetch

  //   const isBinaryMc = isBinaryMulti(contract)
  //   const isMultipleChoice =
  //     contract.outcomeType == 'MULTIPLE_CHOICE' && !isBinaryMc
  //   const isBinary = !isBinaryMc && !isMultipleChoice

  return (
    <Page>
      <Col style={{ padding: 16, gap: 16 }}>
        <ThemedText>Contract Page</ThemedText>
        {/* <ThemedText size="xl" weight="semibold">
          {contract.question}
        </ThemedText>

        {isBinary && (
          <Row style={{ alignItems: 'center', justifyContent: 'center' }}>
            <BinaryProbability contract={contract} size="2xl" />
          </Row>
        )}

        {isMultipleChoice ? (
          <Col style={{ gap: 12 }}>
            {contract.answers?.map((answer) => (
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
                  size="md"
                  color={color.textSecondary}
                  style={{ flex: 1 }}
                >
                  {answer.text}
                </ThemedText>

                <Row style={{ gap: 12, alignItems: 'center' }}>
                  <AnswerProbability
                    contract={contract}
                    answerId={answer.id}
                    size="lg"
                  />
                  <MultiBetButtons contract={contract} answerId={answer.id} />
                </Row>
              </Row>
            ))}
          </Col>
        ) : (
          <BinaryBetButtons contract={contract} />
        )}

        {contract.description && (
          <ThemedText color={color.textSecondary}>
            {contract.description}
          </ThemedText>
        )} */}
      </Col>
    </Page>
  )
}
