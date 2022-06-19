import { useRouter } from 'next/router'
import { ContractSearch } from '../../components/contract-search'
import { Page } from '../../components/page'
import { Title } from '../../components/title'

export default function TagPage() {
  const router = useRouter()
  const { tag } = router.query as { tag: string }
  if (!router.isReady) return <div />

  return (
    <Page>
      <Title text={`#${tag}`} />
      <ContractSearch
        querySortOptions={{
          defaultSort: 'newest',
          defaultFilter: 'all',
          shouldLoadFromStorage: true,
        }}
        additionalFilter={{ tag }}
        showCategorySelector={false}
      />
    </Page>
  )
}
