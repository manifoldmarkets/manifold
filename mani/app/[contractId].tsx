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
import { useLocalSearchParams } from 'expo-router'
import { useColor } from 'hooks/use-color'
import { useEffect, useState } from 'react'
import { ContractDescription } from 'components/contract/ContractDescription'
import { api } from 'lib/api'
import { useApiSubscription } from 'client-common/hooks/use-api-subscription'
import { BinaryProbability } from 'components/contract/Probability'
import { useAPIGetter } from 'hooks/use-api-getter'
import { getBetPoints } from 'common/bets'
import { HistoryPoint } from 'common/chart'
import { Bet } from 'common/bet'
import { useTokenMode } from 'hooks/useTokenMode'
export const LARGE_QUESTION_LENGTH = 95

// TODO: this is just a placeholder, let's share the contract listener with web
export const useContract = (contractId: string | undefined) => {
  const [contract, setContract] = useState<Contract | undefined | null>(
    undefined
  )
  useApiSubscription({
    topics: [`contract/${contractId}`],
    onBroadcast: ({ data }) => {
      console.log('data', data)
      setContract((prevContract) => {
        if (!data.contract) return prevContract
        return { ...prevContract, ...data.contract } as Contract
      })
    },
  })

  useEffect(() => {
    if (contractId) {
      api('market/:id', { id: contractId }).then((result) => {
        setContract(result as any)
      })
    }
  }, [contractId])

  return contract
}

export default function ContractPage() {
  const { contractId } = useLocalSearchParams()
  const color = useColor()
  const [descriptionOpen, setDescriptionOpen] = useState(false)

  const { data: contractProps } = useAPIGetter('get-market-props', {
    id: contractId as string,
  })
  const siblingContract = contractProps?.siblingContract
  const { token } = useTokenMode()
  // TODO: proof of concept, we may want the bet points in the market props or sth else.
  const [betPoints, setBetPoints] = useState<HistoryPoint<Partial<Bet>>[]>([])
  useEffect(() => {
    if (contractProps) {
      getBetPoints(contractId as string).then((betPoints) => {
        setBetPoints(betPoints)
      })
    }
  }, [contractId])
  const contractToShow =
    contractProps?.contract.token === token
      ? contractProps?.contract
      : (siblingContract as Contract)
  //   TODO: Fetch contract data using contractId
  const contract = useContract(contractToShow.id) ?? contractToShow

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

        {isBinary && (
          <BinaryOverview
            contract={contract as BinaryContract}
            betPoints={betPoints}
          />
        )}
        {contract.mechanism === 'cpmm-1' && (
          <BinaryProbability contract={contract as BinaryContract} size="xl" />
        )}

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

        <ContractDescription contract={contract} />
      </Col>
    </Page>
  )
}
