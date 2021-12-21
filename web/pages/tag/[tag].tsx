import { useRouter } from 'next/router'
import { SearchableGrid } from '../../components/contracts-list'
import { Page } from '../../components/page'
import { Title } from '../../components/title'
import { useContracts } from '../../hooks/use-contracts'

export default function TagPage() {
  const router = useRouter()
  const { tag } = router.query as { tag: string }

  let contracts = useContracts()

  if (tag && contracts !== 'loading') {
    contracts = contracts.filter(
      (contract) =>
        contract.description.toLowerCase().includes(`#${tag.toLowerCase()}`) ||
        contract.question.toLowerCase().includes(`#${tag.toLowerCase()}`)
    )
  }

  return (
    <Page>
      <Title text={`#${tag}`} />
      {contracts === 'loading' ? (
        <></>
      ) : (
        <SearchableGrid contracts={contracts} />
      )}
    </Page>
  )
}
