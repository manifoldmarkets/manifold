import React, { useEffect, useState } from 'react'
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
  tradingAllowed,
  getBinaryProbPercent,
  getContractFromId,
} from 'web/lib/firebase/contracts'
import { SEO } from 'web/components/SEO'
import { Page } from 'web/components/page'
import { Bet, listAllBets } from 'web/lib/firebase/bets'
import { Comment, listAllComments } from 'web/lib/firebase/comments'
import Custom404 from '../../404'
import { AnswersPanel } from 'web/components/answers/answers-panel'
import { fromPropz, usePropz } from 'web/hooks/use-propz'
import { ContractTabs } from 'web/components/contract/contract-tabs'
import { contractTextDetails } from 'web/components/contract/contract-details'
import { useWindowSize } from 'web/hooks/use-window-size'
import Confetti from 'react-confetti'
import { NumericBetPanel } from '../../../components/numeric-bet-panel'
import { NumericResolutionPanel } from '../../../components/numeric-resolution-panel'
import { useIsIframe } from 'web/hooks/use-is-iframe'
import ContractEmbedPage from '../../embed/[username]/[contractSlug]'
import { useBets } from 'web/hooks/use-bets'
import { CPMMBinaryContract } from 'common/contract'
import { AlertBox } from 'web/components/alert-box'
import { useTracking } from 'web/hooks/use-tracking'
import { useTipTxns } from 'web/hooks/use-tip-txns'
import { useLiquidity } from 'web/hooks/use-liquidity'
import { richTextToString } from 'common/util/parse'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import {
  ContractLeaderboard,
  ContractTopTrades,
} from 'web/components/contract/contract-leaderboard'

export const getStaticProps = fromPropz(getStaticPropz)
export async function getStaticPropz(props: {
  params: { contestSlug: string; submissionSlug: string }
}) {
  const { contestSlug, submissionSlug } = props.params
  console.log(contestSlug)
  const submission = (await getContractFromSlug(submissionSlug)) || null
  const submissionId = submission?.id

  const [bets, comments] = await Promise.all([
    submissionId ? listAllBets(submissionId) : [],
    submissionId ? listAllComments(submissionId) : [],
  ])

  return {
    props: {
      submission,
      contestSlug,
      // Limit the data sent to the client. Client will still load all bets and comments directly.
      bets: bets.slice(0, 5000),
      comments: comments.slice(0, 1000),
      slug: submissionSlug,
    },

    revalidate: 60, // regenerate after a minute
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function ContractPage(props: {
  submission: Contract | null
  contestSlug: string
  bets: Bet[]
  comments: Comment[]
  slug: string
  backToHome?: () => void
}) {
  props = usePropz(props, getStaticPropz) ?? {
    submission: null,
    contestSlug: '',
    bets: [],
    comments: [],
    slug: '',
  }

  // const inIframe = useIsIframe()
  // if (inIframe) {
  //   return <ContractEmbedPage {...props} />
  // }

  const { submission } = props

  if (!submission) {
    return <Custom404 />
  }

  return <SubmissionPageContent {...{ ...props, submission }} />
}

export function SubmissionPageContent(
  props: Parameters<typeof ContractPage>[0] & { submission: Contract }
) {
  const { backToHome, comments } = props

  const contract = useContractWithPreload(props.submission) ?? props.submission

  useTracking('view market', {
    slug: contract.slug,
    contractId: contract.id,
    creatorId: contract.creatorId,
  })

  const bets = useBets(contract.id) ?? props.bets
  const liquidityProvisions =
    useLiquidity(contract.id)?.filter((l) => !l.isAnte && l.amount > 0) ?? []
  // Sort for now to see if bug is fixed.
  comments.sort((c1, c2) => c1.createdTime - c2.createdTime)

  const tips = useTipTxns({ contractId: contract.id })

  const user = useUser()

  const { width, height } = useWindowSize()

  const [showConfetti, setShowConfetti] = useState(false)

  useEffect(() => {
    const shouldSeeConfetti = !!(
      user &&
      contract.creatorId === user.id &&
      Date.now() - contract.createdTime < 10 * 1000
    )
    setShowConfetti(shouldSeeConfetti)
  }, [contract, user])

  const { creatorId, isResolved, question, outcomeType } = contract

  const isCreator = user?.id === creatorId
  const isBinary = outcomeType === 'BINARY'
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'
  const isNumeric = outcomeType === 'NUMERIC'
  const allowTrade = tradingAllowed(contract)
  const allowResolve = !isResolved && isCreator && !!user
  const hasSidePanel =
    (isBinary || isNumeric || isPseudoNumeric) && (allowTrade || allowResolve)

  const ogCardProps = getOpenGraphProps(contract)

  useSaveReferral(user, {
    defaultReferrer: contract.creatorUsername,
    contractId: contract.id,
  })

  const rightSidebar = hasSidePanel ? (
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

  return (
    <Page rightSidebar={rightSidebar}>
      {showConfetti && (
        <Confetti
          width={width ? width : 500}
          height={height ? height : 500}
          recycle={false}
          numberOfPieces={300}
        />
      )}

      {ogCardProps && (
        <SEO
          title={question}
          description={ogCardProps.description}
          url={`/${props.contestSlug}/${props.slug}`}
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

        <ContractOverview contract={contract} bets={bets} />

        {isNumeric && (
          <AlertBox
            title="Warning"
            text="Distributional numeric markets were introduced as an experimental feature and are now deprecated."
          />
        )}
        {/* 
        {(outcomeType === 'FREE_RESPONSE' ||
          outcomeType === 'MULTIPLE_CHOICE') && (
          <>
            <Spacer h={4} />
            <AnswersPanel contract={contract} />
            <Spacer h={4} />
          </>
        )} */}

        {isNumeric && allowTrade && (
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
          liquidityProvisions={liquidityProvisions}
          bets={bets}
          tips={tips}
          comments={comments}
        />
      </Col>
    </Page>
  )
}

const getOpenGraphProps = (contract: Contract) => {
  const {
    resolution,
    question,
    creatorName,
    creatorUsername,
    outcomeType,
    creatorAvatarUrl,
    description: desc,
  } = contract
  const probPercent =
    outcomeType === 'BINARY' ? getBinaryProbPercent(contract) : undefined

  const stringDesc = typeof desc === 'string' ? desc : richTextToString(desc)

  const description = resolution
    ? `Resolved ${resolution}. ${stringDesc}`
    : probPercent
    ? `${probPercent} chance. ${stringDesc}`
    : stringDesc

  return {
    question,
    probability: probPercent,
    metadata: contractTextDetails(contract),
    creatorName,
    creatorUsername,
    creatorAvatarUrl,
    description,
  }
}
