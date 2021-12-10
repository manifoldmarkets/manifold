import React from 'react'
import { useRouter } from 'next/router'
import { useContract } from '../../hooks/use-contract'
import { Header } from '../../components/header'
import { ContractOverview } from '../../components/contract-overview'
import { BetPanel } from '../../components/bet-panel'
import { Col } from '../../components/layout/col'

export default function ContractPage() {
  const router = useRouter()
  const { contractId } = router.query as { contractId: string }

  const contract = useContract(contractId)

  if (contract === 'loading') {
    return <div />
  }

  if (!contract) {
    return <div>Contract not found...</div>
  }

  return (
    <div className="max-w-7xl mx-auto sm:px-6 lg:px-8">
      <Header />

      <div className="w-full flex flex-col p-4 mt-4">
        <Col className="md:justify-between md:flex-row">
          <ContractOverview contract={contract} />

          <div className="mt-12 md:mt-0" />

          <BetPanel className="self-start" contract={contract} />
        </Col>
      </div>
    </div>
  )
}
