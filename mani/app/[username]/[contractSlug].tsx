import {
  BinaryContract,
  Contract,
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
import { useEffect, useMemo, useState } from 'react'
import { ContractDescription } from 'components/contract/contract-description'
import { CommentsSection } from 'components/contract/comments/comments-section'

import { useAPIGetter } from 'hooks/use-api-getter'
import { getBetPoints } from 'common/bets'
import { HistoryPoint, MultiPoints } from 'common/chart'
import { Bet } from 'common/bet'
import { useTokenMode } from 'hooks/use-token-mode'
import { ContractPageLoading } from 'components/contract/loading-contract'
import { useContract } from 'hooks/use-contract'
import { ContentEditor } from 'components/content/content-editor'
import { UserBetsSummary } from 'components/bet/bet-summary'
import { Bets } from 'components/contract/bets'
import { api } from 'lib/api'
import { useIsPageVisible } from 'hooks/use-is-page-visibile'
import { useContractBets } from 'client-common/hooks/use-bets'
import { mergeWith } from 'lodash'
import { getMultiBetPointsFromBets } from 'client-common/lib/choice'
import { useUser } from 'hooks/use-user'
import { getMultiBetPoints } from 'common/contract-params'
import { APIResponse } from 'common/api/schema'

export const LARGE_QUESTION_LENGTH = 95

export default function ContractPage() {
  const { contractSlug } = useLocalSearchParams()

  if (!contractSlug) {
    return <ContractPageLoading />
  }

  return <ContractPageLoadingContent contractSlug={contractSlug as string} />
}

function ContractPageLoadingContent(props: { contractSlug: string }) {
  const { contractSlug } = props
  const { data } = useAPIGetter('get-market-props', {
    slug: contractSlug,
  })

  const { manaContract, cashContract } = data ?? {}
  if (!data || ![manaContract?.slug, cashContract?.slug].includes(contractSlug))
    return <ContractPageLoading />

  return <ContractPageContent contractProps={data} />
}

function ContractPageContent(props: {
  contractProps: APIResponse<'get-market-props'>
}) {
  const { contractProps } = props
  const { totalManaBets, totalCashBets, comments, pinnedComments } =
    contractProps
  const manaContractProp = contractProps.manaContract
  const cashContractProp = contractProps.cashContract
  const { token } = useTokenMode()

  const manaContract = useContract(manaContractProp) ?? manaContractProp
  const cashContract = useContract(cashContractProp) ?? cashContractProp
  const contract = token === 'MANA' ? manaContract : cashContract

  const isBinaryMc = isBinaryMulti(contract)
  const isMultipleChoice =
    contract.outcomeType == 'MULTIPLE_CHOICE' && !isBinaryMc
  const isBinary = !isBinaryMc && !isMultipleChoice
  const isSports = isSportsContract(contract)
  const user = useUser()

  const playBetData = useBetData({
    contract: manaContract,
    userId: user?.id,
    totalBets: totalManaBets,
    afterTime: manaContractProp.lastBetTime,
  })

  const cashBetData = useBetData({
    contract: cashContract,
    userId: user?.id,
    totalBets: totalCashBets,
    afterTime: cashContractProp.lastBetTime,
  })

  const { bets, totalBets, yourNewBets, betPoints } =
    token === 'CASH' ? cashBetData : playBetData

  return (
    <Page nonScrollableChildren={<ContentEditor contractId={contract.id} />}>
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
            betPoints={betPoints as HistoryPoint<Partial<Bet>>[]}
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
        <ContractDescription contract={manaContract} />
        <Bets contract={contract} totalBets={totalBets} />
        <CommentsSection
          contract={manaContract}
          comments={comments}
          pinnedComments={pinnedComments}
        />
      </Col>
    </Page>
  )
}

const useBetData = (props: {
  contract: Contract
  userId: string | undefined
  totalBets: number | undefined
  afterTime: number | undefined
}) => {
  const { userId, contract, afterTime } = props
  const contractId = contract.id
  const mechanism = contract.mechanism
  const outcomeType = contract.outcomeType
  const isMulti = outcomeType === 'MULTIPLE_CHOICE'
  const newBets = useContractBets(
    contractId,
    {
      includeZeroShareRedemptions: isMulti,
      filterRedemptions: true,
      afterTime,
    },
    useIsPageVisible,
    (params) => api('bets', params)
  )

  const [points, setPoints] = useState<
    { x: number; y: number; answerId: string | undefined }[]
  >([])
  useEffect(() => {
    getBetPoints(contractId, {
      filterRedemptions: mechanism !== 'cpmm-multi-1',
    }).then(setPoints)
  }, [contractId, mechanism])

  const newBetsWithoutRedemptions = newBets.filter((bet) => !bet.isRedemption)
  const totalBets = (props.totalBets ?? 0) + newBetsWithoutRedemptions.length
  const bets = newBetsWithoutRedemptions

  const yourNewBets = newBets.filter((bet) => userId && bet.userId === userId)

  const betPoints = useMemo(() => {
    if (isMulti) {
      const data = getMultiBetPoints(points, contract)
      const newData = getMultiBetPointsFromBets(newBets)

      return mergeWith(data, newData, (array1, array2) =>
        [...(array1 ?? []), ...(array2 ?? [])].sort((a, b) => a.x - b.x)
      ) as MultiPoints
    } else {
      const newPoints = newBetsWithoutRedemptions.map((bet) => ({
        x: bet.createdTime,
        y: bet.probAfter,
      }))
      return [...points, ...newPoints] as HistoryPoint<Partial<Bet>>[]
    }
  }, [points.length, newBets.length])

  return {
    bets,
    totalBets,
    yourNewBets,
    betPoints,
  }
}
