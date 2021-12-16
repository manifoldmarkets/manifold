import React from 'react'
import clsx from 'clsx'

import { useContractWithPreload } from '../../hooks/use-contract'
import { Header } from '../../components/header'
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
import { Contract, getContract } from '../../lib/firebase/contracts'
import { SEO } from '../../components/SEO'

export async function getStaticProps(props: { params: any }) {
  const { username, contractId } = props.params
  const contract = (await getContract(contractId)) || null

  return {
    props: {
      username,
      contractId,
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
  contractId: string
  username: string
}) {
  const user = useUser()

  const contract = useContractWithPreload(props.contractId, props.contract)

  if (!contract) {
    return <div>Contract not found...</div>
  }

  const { creatorId, isResolved } = contract
  const isCreator = user?.id === creatorId

  return (
    <Col className="max-w-7xl mx-auto sm:px-6 lg:px-8">
      <SEO
        title={contract.question}
        description={contract.description}
        url={`/${props.username}/${props.contractId}`}
      />

      <Header />

      <Col
        className={clsx(
          'w-full items-start md:flex-row mt-4',
          isResolved ? 'md:justify-center' : 'md:justify-between'
        )}
      >
        <div className="max-w-4xl w-full ">
          <ContractOverview contract={contract} className="p-4" />
          <BetsSection contract={contract} user={user ?? null} />
        </div>

        {!isResolved && (
          <>
            <div className="mt-12 md:mt-0 md:ml-8" />

            <Col className="w-full sm:w-auto">
              <BetPanel contract={contract} />

              {isCreator && user && (
                <ResolutionPanel creator={user} contract={contract} />
              )}
            </Col>
          </>
        )}
      </Col>
    </Col>
  )
}

function BetsSection(props: { contract: Contract; user: User | null }) {
  const { contract, user } = props
  const bets = useBets(contract.id)

  if (bets === 'loading' || bets.length === 0) return <></>

  // Decending creation time.
  bets.sort((bet1, bet2) => bet2.createdTime - bet1.createdTime)

  const userBets = user && bets.filter((bet) => bet.userId === user.id)

  return (
    <div className="p-4">
      {userBets && userBets.length > 0 && (
        <>
          <Title text="Your bets" />
          <MyBetsSummary contract={contract} bets={userBets} />
          <Spacer h={6} />
          <ContractBetsTable contract={contract} bets={userBets} />
          <Spacer h={6} />
        </>
      )}

      <Title text="All bets" />
      <ContractBetsTable contract={contract} bets={bets} />
    </div>
  )
}
