import React from 'react'
import { useRouter } from 'next/router'
import { useContract } from '../../hooks/use-contract'
import { Header } from '../../components/header'
import { ContractOverview } from '../../components/contract-overview'
import { BetPanel } from '../../components/bet-panel'
import { Col } from '../../components/layout/col'
import { useUser } from '../../hooks/use-user'
import { ResolutionPanel } from '../../components/resolution-panel'

export default function ContractPage() {
  const user = useUser()

  const router = useRouter()
  const { contractId } = router.query as { contractId: string }

  const contract = useContract(contractId)

  if (contract === 'loading') {
    return <div />
  }

  if (!contract) {
    return <div>Contract not found...</div>
  }

  const isCreator = user?.id === contract.creatorId

  return (
    <div className="max-w-7xl mx-auto sm:px-6 lg:px-8">
      <Header />

      <Col className="w-full md:justify-between md:flex-row p-4 mt-4">
        <ContractOverview contract={contract} className="max-w-4xl w-full" />

        <div className="mt-12 md:mt-0" />

        {isCreator ? (
          <ResolutionPanel className="self-start" creator={user} contract={contract} />
        ) : (
          <BetPanel className="self-start" contract={contract} />
        )}
      </Col>
    </div>
  )
}
