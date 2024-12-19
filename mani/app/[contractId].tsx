import {
  BinaryContract,
  Contract,
  CPMMMultiContract,
  isBinaryMulti,
  MultiContract,
} from 'common/contract'
import { ContentRenderer } from 'components/content/ContentRenderer'
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
import { BottomModal } from 'components/layout/BottomModal'
import { useState } from 'react'
import { Pressable } from 'react-native'
import { extractTextFromContent } from 'components/content/ContentRenderer'

export const LARGE_QUESTION_LENGTH = 95

export default function ContractPage() {
  const { contractId } = useLocalSearchParams()
  const color = useColor()
  const [descriptionOpen, setDescriptionOpen] = useState(false)

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

  console.log('DESCRIPTION', contract.description)
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

        {contract.description && (
          <>
            <Pressable
              onPress={() => setDescriptionOpen(true)}
              style={{
                backgroundColor: color.backgroundSecondary,
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 4,
                gap: 8,
              }}
            >
              <ThemedText size="md" weight="bold">
                Description
              </ThemedText>
              <ThemedText
                size="sm"
                numberOfLines={2}
                color={color.textSecondary}
              >
                {extractTextFromContent(contract.description)}
              </ThemedText>
            </Pressable>

            <BottomModal open={descriptionOpen} setOpen={setDescriptionOpen}>
              <Col style={{ gap: 16 }}>
                <ThemedText size="lg" weight="semibold">
                  Description
                </ThemedText>
                <ContentRenderer content={contract.description} />
              </Col>
            </BottomModal>
          </>
        )}
      </Col>
    </Page>
  )
}
