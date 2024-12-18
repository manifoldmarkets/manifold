import { useLocalSearchParams } from 'expo-router'
import { ThemedText } from 'components/ThemedText'
import { useColor } from 'hooks/useColor'
import {
  BinaryContract,
  Contract,
  CPMMMultiContract,
  isBinaryMulti,
  MultiContract,
} from 'common/contract'
import { EXAMPLE_CONTRACTS } from 'constants/ExampleContracts'
import { BinaryBetButtons } from 'components/contract/bet/BinaryBetButtons'
import Page from 'components/Page'
import { BinaryOverview } from 'components/contract/overview/BinaryOverview'
import { MultiOverview } from 'components/contract/overview/MultiOverview'
import { MultiBinaryBetButtons } from 'components/contract/bet/MultiBinaryBetButtons'

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
      <ThemedText size="2xl" weight="semibold" style={{ paddingTop: 16 }}>
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
    </Page>
  )
}
