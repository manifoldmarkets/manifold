import {
  BinaryContract,
  CPMMMultiContract,
  isBinaryMulti,
  isSportsContract,
} from 'common/contract'
import { BinaryBetButtons } from 'components/contract/bet/binary-bet-buttons'
import { MultiBinaryBetButtons } from 'components/contract/bet/multi-binary-bet-buttons'
import { BinaryOverview } from 'components/contract/overview/binary-overview'
import { MultiOverview } from 'components/contract/overview/multi-overview'
import { Col } from 'components/layout/col'
import Page from 'components/page'
import { ThemedText } from 'components/themed-text'
import { useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { ContractDescription } from 'components/contract/contract-description'
import { CommentsSection } from 'components/contract/comments/comments-section'

import { useAPIGetter } from 'hooks/use-api-getter'
import { getBetPoints } from 'common/bets'
import { HistoryPoint } from 'common/chart'
import { Bet } from 'common/bet'
import { useTokenMode } from 'hooks/use-token-mode'
import { ContractPageLoading } from 'components/contract/loading-contract'
import { useContract } from 'hooks/use-contract'
import { ContentEditor } from 'components/content/content-editor'
import { UserBetsSummary } from 'components/bet/bet-summary'
export const LARGE_QUESTION_LENGTH = 95

type ContractPageContentProps = {
  contractId: string
}

function ContractPageContent({ contractId }: ContractPageContentProps) {
  const { data: contractProps } = useAPIGetter('get-market-props', {
    id: contractId,
  })
  const siblingContract = contractProps?.siblingContract
  const { token } = useTokenMode()
  // TODO: proof of concept, we may want the bet points in the market props or sth else.
  const [betPoints, setBetPoints] = useState<HistoryPoint<Partial<Bet>>[]>([])
  const manaContractProp =
    contractProps?.contract.token === 'MANA'
      ? contractProps?.contract
      : siblingContract
  const cashContractProp =
    contractProps?.contract.token === 'CASH'
      ? contractProps?.contract
      : siblingContract
  const manaContract = useContract(manaContractProp)
  const cashContract = useContract(cashContractProp)
  const contract = token === 'MANA' ? manaContract : cashContract

  useEffect(() => {
    if (contract) {
      getBetPoints(contract?.id as string).then((betPoints) => {
        setBetPoints(betPoints)
      })
    }
  }, [contract?.id])

  if (contract === null) {
    return (
      <Page>
        <ThemedText>Contract not found</ThemedText>
      </Page>
    )
  }

  if (contract === undefined) {
    return <ContractPageLoading />
  }

  const isBinaryMc = isBinaryMulti(contract)
  const isMultipleChoice =
    contract.outcomeType == 'MULTIPLE_CHOICE' && !isBinaryMc
  const isBinary = !isBinaryMc && !isMultipleChoice
  const isSports = isSportsContract(contract)

  return (
    <Page nonScrollableChildren={<ContentEditor onChange={() => {}} />}>
      <Col style={{ gap: 16, position: 'relative' }}>
        {!(isSports && isBinaryMc) && (
          <ThemedText
            size={
              contract.question.length > LARGE_QUESTION_LENGTH ? 'xl' : '2xl'
            }
            weight="semibold"
            style={{ paddingTop: 16 }}
          >
            {contract.question}
          </ThemedText>
        )}

        {isBinary && (
          <BinaryOverview
            contract={contract as BinaryContract}
            betPoints={betPoints}
          />
        )}

        {isBinaryMc ? (
          <MultiBinaryBetButtons
            contract={contract as CPMMMultiContract}
            size="lg"
          />
        ) : isMultipleChoice ? (
          <MultiOverview contract={contract as CPMMMultiContract} />
        ) : (
          <BinaryBetButtons contract={contract} size="lg" />
        )}
        <UserBetsSummary contract={contract} />
        {manaContract && (
          <>
            <ContractDescription contract={manaContract} />
            <CommentsSection contract={manaContract} />
          </>
        )}
      </Col>
    </Page>
  )
}

export default function ContractPage() {
  const { contractId } = useLocalSearchParams()

  if (!contractId) {
    return <ContractPageLoading />
  }

  return (
    <ContractPageContent
      key={contractId as string}
      contractId={contractId as string}
    />
  )
}
