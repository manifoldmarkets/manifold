import React from 'react'

import { useContractWithPreload } from '../../hooks/use-contract'
import { ContractOverview } from '../../components/contract-overview'
import { BetPanel } from '../../components/bet-panel'
import { Col } from '../../components/layout/col'
import { useUser } from '../../hooks/use-user'
import { ResolutionPanel } from '../../components/resolution-panel'
import { ContractBetsTable, MyBetsSummary } from '../../components/bets-list'
import { useBets } from '../../hooks/use-bets'
import { Title } from '../../components/title'
import { Spacer } from '../../components/layout/spacer'
import { User } from '../../lib/firebase/users'
import {
  Contract,
  getContractFromSlug,
  tradingAllowed,
  getBinaryProbPercent,
} from '../../lib/firebase/contracts'
import { SEO } from '../../components/SEO'
import { Page } from '../../components/page'
import { contractTextDetails } from '../../components/contract-card'
import { Bet, listAllBets } from '../../lib/firebase/bets'
import { Comment, listAllComments } from '../../lib/firebase/comments'
import Custom404 from '../404'
import { getFoldsByTags } from '../../lib/firebase/folds'
import { Fold } from '../../../common/fold'
import { useFoldsWithTags } from '../../hooks/use-fold'

export async function getStaticProps(props: {
  params: { username: string; contractSlug: string }
}) {
  const { username, contractSlug } = props.params
  const contract = (await getContractFromSlug(contractSlug)) || null
  const contractId = contract?.id

  const foldsPromise = getFoldsByTags(contract?.tags ?? [])

  const [bets, comments] = await Promise.all([
    contractId ? listAllBets(contractId) : [],
    contractId ? listAllComments(contractId) : [],
  ])

  const folds = await foldsPromise

  return {
    props: {
      contract,
      username,
      slug: contractSlug,
      bets,
      comments,
      folds,
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
  comments: Comment[]
  slug: string
  folds: Fold[]
}) {
  const user = useUser()

  const contract = useContractWithPreload(props.slug, props.contract)
  const { bets, comments } = props

  const folds = (useFoldsWithTags(contract?.tags) ?? props.folds).filter(
    (fold) => fold.followCount > 1 || user?.id === fold.curatorId
  )

  if (!contract) {
    return <Custom404 />
  }

  const { creatorId, isResolved, question, outcomeType } = contract

  const isCreator = user?.id === creatorId
  const isBinary = outcomeType === 'BINARY'
  const allowTrade = tradingAllowed(contract)
  const allowResolve = !isResolved && isCreator && !!user
  const hasSidePanel = isBinary && (allowTrade || allowResolve)

  // TODO(James): Create SEO props for non-binary contracts.
  const ogCardProps = isBinary ? getOpenGraphProps(contract) : undefined

  return (
    <Page wide={hasSidePanel}>
      {ogCardProps && (
        <SEO
          title={question}
          description={ogCardProps.description}
          url={`/${props.username}/${props.slug}`}
          ogCardProps={ogCardProps}
        />
      )}

      <Col className="w-full justify-between md:flex-row">
        <div className="flex-[3] rounded border-0 border-gray-100 bg-white px-2 py-6 md:px-6 md:py-8">
          <ContractOverview
            contract={contract}
            bets={bets ?? []}
            comments={comments ?? []}
            folds={folds}
          />
          <BetsSection contract={contract} user={user ?? null} bets={bets} />
        </div>

        {hasSidePanel && (
          <>
            <div className="md:ml-6" />

            <Col className="flex-1">
              {allowTrade && (
                <BetPanel className="hidden lg:inline" contract={contract} />
              )}
              {allowResolve && (
                <ResolutionPanel creator={user} contract={contract} />
              )}
            </Col>
          </>
        )}
      </Col>
    </Page>
  )
}

function BetsSection(props: {
  contract: Contract
  user: User | null
  bets: Bet[]
}) {
  const { contract, user } = props
  const bets = useBets(contract.id) ?? props.bets

  // Decending creation time.
  bets.sort((bet1, bet2) => bet2.createdTime - bet1.createdTime)

  const userBets = user && bets.filter((bet) => bet.userId === user.id)

  if (!userBets || userBets.length === 0) return <></>

  return (
    <div>
      <Title className="px-2" text="Your trades" />
      <MyBetsSummary
        className="px-2"
        contract={contract}
        bets={userBets}
        showMKT
      />
      <Spacer h={6} />
      <ContractBetsTable contract={contract} bets={userBets} />
      <Spacer h={12} />
    </div>
  )
}

const getOpenGraphProps = (contract: Contract<'BINARY'>) => {
  const { resolution, question, creatorName, creatorUsername } = contract
  const probPercent = getBinaryProbPercent(contract)

  const description = resolution
    ? `Resolved ${resolution}. ${contract.description}`
    : `${probPercent} chance. ${contract.description}`

  return {
    question,
    probability: probPercent,
    metadata: contractTextDetails(contract),
    creatorName: creatorName,
    creatorUsername: creatorUsername,
    description,
  }
}
