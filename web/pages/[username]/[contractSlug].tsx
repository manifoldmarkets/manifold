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
  compute,
  Contract,
  getContractFromSlug,
} from '../../lib/firebase/contracts'
import { SEO } from '../../components/SEO'
import { Page } from '../../components/page'

export async function getStaticProps(props: { params: any }) {
  const { username, contractSlug } = props.params
  const contract = (await getContractFromSlug(contractSlug)) || null

  return {
    props: {
      username,
      slug: contractSlug,
      contract,
    },

    revalidate: 60, // regenerate after a minute
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function ContractPage(props: {
  contract: Contract | null
  slug: string
  username: string
}) {
  const user = useUser()

  const contract = useContractWithPreload(props.slug, props.contract)

  if (!contract) {
    return <div>Contract not found...</div>
  }

  const { creatorId, isResolved, resolution, question } = contract
  const isCreator = user?.id === creatorId
  const allowTrade =
    !isResolved && (!contract.closeTime || contract.closeTime > Date.now())
  const allowResolve = !isResolved && isCreator && user

  const { probPercent } = compute(contract)

  const description = resolution
    ? `Resolved ${resolution}. ${contract.description}`
    : `${probPercent} chance. ${contract.description}`

  return (
    <Page wide={allowTrade}>
      <SEO
        title={question}
        description={description}
        url={`/${props.username}/${props.slug}`}
      />

      <Col className="w-full md:flex-row justify-between mt-6">
        <div className="flex-[3]">
          <ContractOverview contract={contract} />
          <BetsSection contract={contract} user={user ?? null} />
        </div>

        {(allowTrade || allowResolve) && (
          <>
            <div className="md:ml-8" />

            <Col className="flex-1">
              {allowTrade && <BetPanel contract={contract} />}
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

function BetsSection(props: { contract: Contract; user: User | null }) {
  const { contract, user } = props
  const bets = useBets(contract.id)

  if (bets === 'loading' || bets.length === 0) return <></>

  // Decending creation time.
  bets.sort((bet1, bet2) => bet2.createdTime - bet1.createdTime)

  const userBets = user && bets.filter((bet) => bet.userId === user.id)

  if (!userBets || userBets.length === 0) return <></>

  return (
    <div>
      <Title text="Your trades" />
      <MyBetsSummary contract={contract} bets={userBets} showMKT />
      <Spacer h={6} />
      <ContractBetsTable contract={contract} bets={userBets} />
      <Spacer h={12} />
    </div>
  )
}
