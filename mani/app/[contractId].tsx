import {
  BinaryContract,
  Contract,
  CPMMMultiContract,
  isBinaryMulti,
  MultiContract,
} from 'common/contract'
import { BinaryBetButtons } from 'components/contract/bet/BinaryBetButtons'
import { MultiBinaryBetButtons } from 'components/contract/bet/MultiBinaryBetButtons'
import { BinaryOverview } from 'components/contract/overview/BinaryOverview'
import { MultiOverview } from 'components/contract/overview/MultiOverview'
import { Col } from 'components/layout/col'
import Page from 'components/Page'
import { ThemedText } from 'components/ThemedText'
import { EXAMPLE_CONTRACTS } from 'constants/examples/ExampleContracts'
import { useLocalSearchParams } from 'expo-router'
import { useColor } from 'hooks/useColor'

export const LARGE_QUESTION_LENGTH = 95

export default function ContractPage() {
  const { contractId } = useLocalSearchParams()
  const color = useColor()

  //   TODO: Fetch contract data using contractId
  const contract = EXAMPLE_CONTRACTS.find((contract) => {
    return contract.id === contractId
  }) as Contract

  if (!contract) {
    return <ThemedText>Contract not found</ThemedText>
  }

  const isBinaryMc = isBinaryMulti(contract)
  const isMultipleChoice =
    contract.outcomeType == 'MULTIPLE_CHOICE' && !isBinaryMc
  const isBinary = !isBinaryMc && !isMultipleChoice

  return (
    <Page>
      <Col style={{ gap: 16 }}>
        <ThemedText
          size={contract.question.length > LARGE_QUESTION_LENGTH ? 'xl' : '2xl'}
          weight="semibold"
          style={{ paddingTop: 16 }}
        >
          {contract.question}
        </ThemedText>

        {isBinary && <BinaryOverview contract={contract as BinaryContract} />}

        {isBinaryMc ? (
          <MultiBinaryBetButtons
            contract={contract as CPMMMultiContract}
            size="lg"
          />
        ) : isMultipleChoice ? (
          <MultiOverview contract={contract as MultiContract} />
        ) : (
          <BinaryBetButtons contract={contract} size="lg" />
        )}

        {/* {contract.description && (
          <ThemedText color={color.textSecondary}>
            {contract.description}
          </ThemedText>
        )} */}
      </Col>
    </Page>
  )
}
