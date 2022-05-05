import { useRouter } from 'next/router'
import { Page } from '../../components/page'
import { Title } from '../../components/title'
import { ContractSearch } from '../../components/contract-search'

export default function TagPage() {
  const router = useRouter()
  const { tag } = router.query as { tag: string }

  return (
    <Page>
      <Title text={`#${tag}`} />
      <ContractSearch
        querySortOptions={{ filter: { tag }, defaultSort: 'newest' }}
      />
    </Page>
  )
}
