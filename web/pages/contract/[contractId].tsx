import React from 'react'
import { useRouter } from 'next/router'
import { useContract } from '../../hooks/use-contract'
import { Header } from '../../components/header'
import { Row } from '../../components/layout/row'
import { ContractOverview } from '../../components/contract-overview'
import { BetPanel } from '../../components/bet-panel'

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
        <Row className="justify-between">
          <ContractOverview contract={contract} />

          <BetPanel className="self-start" contract={contract} />
        </Row>
      </div>
    </div>
  )
}
