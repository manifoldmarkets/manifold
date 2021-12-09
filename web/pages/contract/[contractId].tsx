import { useRouter } from 'next/router'

export default function ContractPage() {
	const router = useRouter()
	const { contractId } = router.query

	return (
		<div>
			{contractId}
		</div>
	)
}