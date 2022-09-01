import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeftIcon } from '@heroicons/react/outline'

import { useContractWithPreload } from 'web/hooks/use-contract'
import { ContractOverview } from 'web/components/contract/contract-overview'
import { BetPanel } from 'web/components/bet-panel'
import { Col } from 'web/components/layout/col'
import { useUser } from 'web/hooks/use-user'
import { ResolutionPanel } from 'web/components/resolution-panel'
import { Spacer } from 'web/components/layout/spacer'
import {
  Contract,
  getContractFromSlug,
  getRecommendedContracts,
  tradingAllowed,
} from 'web/lib/firebase/contracts'
import { SEO } from 'web/components/SEO'
import { Page } from 'web/components/page'
import { Bet, listAllBets } from 'web/lib/firebase/bets'
import { listAllComments } from 'web/lib/firebase/comments'
import Custom404 from '../404'
import { AnswersPanel } from 'web/components/answers/answers-panel'
import { fromPropz, usePropz } from 'web/hooks/use-propz'
import { ContractTabs } from 'web/components/contract/contract-tabs'
import { FullscreenConfetti } from 'web/components/fullscreen-confetti'
import { NumericBetPanel } from 'web/components/numeric-bet-panel'
import { NumericResolutionPanel } from 'web/components/numeric-resolution-panel'
import { useIsIframe } from 'web/hooks/use-is-iframe'
import ContractEmbedPage from '../embed/[username]/[contractSlug]'
import { useBets } from 'web/hooks/use-bets'
import { CPMMBinaryContract } from 'common/contract'
import { AlertBox } from 'web/components/alert-box'
import { useTracking } from 'web/hooks/use-tracking'
import { useTipTxns } from 'web/hooks/use-tip-txns'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { User } from 'common/user'
import { ContractComment } from 'common/comment'
import { getOpenGraphProps } from 'common/contract-details'
import { ContractDescription } from 'web/components/contract/contract-description'
import { ExtraContractActionsRow } from 'web/components/contract/extra-contract-actions-row'
import {
  ContractLeaderboard,
  ContractTopTrades,
} from 'web/components/contract/contract-leaderboard'
import { ContractsGrid } from 'web/components/contract/contracts-grid'
import { Title } from 'web/components/title'
import { usePrefetch } from 'web/hooks/use-prefetch'

export const getStaticProps = fromPropz(getStaticPropz)
export async function getStaticPropz(props: {
  params: { username: string; contractSlug: string }
}) {
  const { username, contractSlug } = props.params
  const contract = (await getContractFromSlug(contractSlug)) || null
  const contractId = contract?.id

  const [bets, comments] = await Promise.all([
    contractId ? listAllBets(contractId) : [],
    contractId ? listAllComments(contractId) : [],
  ])

  return {
    props: {
      contract,
      username,
      slug: contractSlug,
      // Limit the data sent to the client. Client will still load all bets and comments directly.
      bets: bets.slice(0, 5000),
      comments: comments.slice(0, 1000),
    },

    revalidate: 60, // regenerate after a minute
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function ContractPage(props: {
  contract: Contract | null
  username: string
  bets: Bet[]
  comments: ContractComment[]
  slug: string
  backToHome?: () => void
}) {
  props = usePropz(props, getStaticPropz) ?? {
    contract: null,
    username: '',
    comments: [],
    bets: [],
    slug: '',
  }

  const user = useUser()
  const inIframe = useIsIframe()
  if (inIframe) {
    return <ContractEmbedPage {...props} />
  }

  const { contract } = props

  if (!contract) {
    return <Custom404 />
  }

  return (
    <ContractPageContent key={contract.id} {...{ ...props, contract, user }} />
  )
}

export function ContractPageSidebar(props: {
  user: User | null | undefined
  contract: Contract
}) {
  const { contract, user } = props
  const { creatorId, isResolved, outcomeType } = contract

  const isCreator = user?.id === creatorId
  const isBinary = outcomeType === 'BINARY'
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'
  const isNumeric = outcomeType === 'NUMERIC'
  const allowTrade = tradingAllowed(contract)
  const allowResolve = !isResolved && isCreator && !!user
  const hasSidePanel =
    (isBinary || isNumeric || isPseudoNumeric) && (allowTrade || allowResolve)

  return hasSidePanel ? (
    <Col className="gap-4">
      {allowTrade &&
        (isNumeric ? (
          <NumericBetPanel className="hidden xl:flex" contract={contract} />
        ) : (
          <BetPanel
            className="hidden xl:flex"
            contract={contract as CPMMBinaryContract}
          />
        ))}
      {allowResolve &&
        (isNumeric || isPseudoNumeric ? (
          <NumericResolutionPanel creator={user} contract={contract} />
        ) : (
          <ResolutionPanel creator={user} contract={contract} />
        ))}
    </Col>
  ) : null
}

export function ContractPageContent(
  props: Parameters<typeof ContractPage>[0] & {
    contract: Contract
    user?: User | null
  }
) {
  const { backToHome, comments, user } = props

  const contract = useContractWithPreload(props.contract) ?? props.contract
  usePrefetch(user?.id)

  useTracking('view market', {
    slug: contract.slug,
    contractId: contract.id,
    creatorId: contract.creatorId,
  })

  const bets = useBets(contract.id) ?? props.bets
  const nonChallengeBets = useMemo(
    () => bets.filter((b) => !b.challengeSlug),
    [bets]
  )

  const tips = useTipTxns({ contractId: contract.id })

  const [showConfetti, setShowConfetti] = useState(false)

  useEffect(() => {
    const shouldSeeConfetti = !!(
      user &&
      contract.creatorId === user.id &&
      Date.now() - contract.createdTime < 10 * 1000
    )
    setShowConfetti(shouldSeeConfetti)
  }, [contract, user])

  const [recommendedContracts, setRecommendedContracts] = useState<Contract[]>(
    []
  )
  useEffect(() => {
    if (contract && user) {
      getRecommendedContracts(contract, user.id, 6).then(
        setRecommendedContracts
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract.id, user?.id])

  const { isResolved, question, outcomeType } = contract

  const allowTrade = tradingAllowed(contract)

  const ogCardProps = getOpenGraphProps(contract)

  useSaveReferral(user, {
    defaultReferrerUsername: contract.creatorUsername,
    contractId: contract.id,
  })

  const rightSidebar = <ContractPageSidebar user={user} contract={contract} />
  return (
    <Page rightSidebar={rightSidebar}>
      {showConfetti && (
        <FullscreenConfetti recycle={false} numberOfPieces={300} />
      )}

      {ogCardProps && (
        <SEO
          title={question}
          description={ogCardProps.description}
          url={`/${props.username}/${props.slug}`}
          ogCardProps={ogCardProps}
        />
      )}

      <Col className="w-full justify-between rounded border-0 border-gray-100 bg-white py-6 pl-1 pr-2 sm:px-2 md:px-6 md:py-8">
        {backToHome && (
          <button
            className="btn btn-sm mb-4 items-center gap-2 self-start border-0 border-gray-700 bg-white normal-case text-gray-700 hover:bg-white hover:text-gray-700 lg:hidden"
            onClick={backToHome}
          >
            <ArrowLeftIcon className="h-5 w-5 text-gray-700" />
            Back
          </button>
        )}

        <ContractOverview contract={contract} bets={nonChallengeBets} />
        <ExtraContractActionsRow contract={contract} />
        <ContractDescription className="mb-6 px-2" contract={contract} />

        {outcomeType === 'NUMERIC' && (
          <AlertBox
            title="Warning"
            text="Distributional numeric markets were introduced as an experimental feature and are now deprecated."
          />
        )}

        {(outcomeType === 'FREE_RESPONSE' ||
          outcomeType === 'MULTIPLE_CHOICE') && (
          <>
            <Spacer h={4} />
            <AnswersPanel contract={contract} />
            <Spacer h={4} />
          </>
        )}

        {outcomeType === 'NUMERIC' && allowTrade && (
          <NumericBetPanel className="xl:hidden" contract={contract} />
        )}

        {isResolved && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2">
              <ContractLeaderboard contract={contract} bets={bets} />
              <ContractTopTrades
                contract={contract}
                bets={bets}
                comments={comments}
                tips={tips}
              />
            </div>
            <Spacer h={12} />
          </>
        )}

        <ContractTabs
          contract={contract}
          user={user}
          bets={bets}
          tips={tips}
          comments={comments}
        />
      </Col>

      {recommendedContracts.length > 0 && (
        <Col className="mt-2 gap-2 px-2 sm:px-0">
          <Title className="text-gray-700" text="Recommended" />
          <ContractsGrid
            contracts={recommendedContracts}
            trackingPostfix=" recommended"
          />
        </Col>
      )}
    </Page>
  )
}
