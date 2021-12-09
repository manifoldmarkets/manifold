import { useRouter } from 'next/router'
import { useContract } from '../../hooks/use-contract'
import { useUser } from '../../hooks/use-user'

export default function ContractPage() {
  const user = useUser()

  const router = useRouter()
  const { contractId } = router.query as { contractId: string }

  const contract = useContract(contractId)

  if (contract === 'loading') {
    return <div>Loading...</div>
  }

  if (contract === null) {
    return <div>Contract not found...</div>
  }

  return (
    <div>
      <div>{contract.id}</div>
      <div>{contract.question}</div>
    </div>
  )
}
