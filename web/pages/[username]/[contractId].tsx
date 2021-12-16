import React from 'react'
import Head from 'next/head'
import clsx from 'clsx'

import { useContract, useContractWithPreload } from '../../hooks/use-contract'
import { Header } from '../../components/header'
import { ContractOverview } from '../../components/contract-overview'
import { BetPanel } from '../../components/bet-panel'
import { Col } from '../../components/layout/col'
import { useUser } from '../../hooks/use-user'
import { ResolutionPanel } from '../../components/resolution-panel'
import { Contract, getContract } from '../../lib/firebase/contracts'

export async function getStaticProps(props: { params: any }) {
  const { contractId } = props.params
  const contract = (await getContract(contractId)) || null

  return {
    props: {
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
  contract: Contract
  contractId: string
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
      <Head>
        <title>{contract.question} | Mantic Markets</title>
        <meta
          property="og:title"
          name="twitter:title"
          content={contract.question}
          key="title"
        />
        <meta name="description" content={contract.description} />
        <meta
          property="og:description"
          name="twitter:description"
          content={contract.description}
        />
      </Head>

      <Header />

      <Col
        className={clsx(
          'w-full items-start md:flex-row mt-4',
          isResolved ? 'md:justify-center' : 'md:justify-between'
        )}
      >
        <ContractOverview
          contract={contract}
          className="max-w-4xl w-full p-4"
        />

        {!isResolved && (
          <>
            <div className="mt-12 md:mt-0 md:ml-8" />

            <Col className="w-full sm:w-auto sm:self-center">
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
