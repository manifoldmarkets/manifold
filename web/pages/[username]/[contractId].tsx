import React from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import clsx from 'clsx'

import { useContract } from '../../hooks/use-contract'
import { Header } from '../../components/header'
import { ContractOverview } from '../../components/contract-overview'
import { BetPanel } from '../../components/bet-panel'
import { Col } from '../../components/layout/col'
import { useUser } from '../../hooks/use-user'
import { ResolutionPanel } from '../../components/resolution-panel'
import { Contract, getContract } from '../../lib/firebase/contracts'

export async function getServerSideProps({ params }: { params: any }) {
  console.log('params', params)
  const contract = await getContract(params.contractId)

  return {
    props: {
      contract: contract || null,
    },
  }
}

// export async function getStaticPaths() {
//   return {
//     paths: [],
//     fallback: 'blocking',
//   }
// }

export default function ContractPage({ contract }: { contract: Contract }) {
  const user = useUser()

  const router = useRouter()
  const { contractId } = router.query as { contractId: string }

  // const contract = useContract(contractId)
  // if (contract === 'loading') {
  //   return <div />
  // }
  // if (!contract) {
  //   return <div>Contract not found...</div>
  // }

  if (contract === null) {
    return <div>Contract not found...</div>
  }
  if (!contract) return <div />

  const { creatorId, isResolved } = contract
  const isCreator = user?.id === creatorId

  return (
    <Col className="max-w-7xl mx-auto sm:px-6 lg:px-8">
      <Head>
        <title>{contract.question}</title>

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

              {isCreator && (
                <ResolutionPanel creator={user} contract={contract} />
              )}
            </Col>
          </>
        )}
      </Col>
    </Col>
  )
}
