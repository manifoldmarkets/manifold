import { useRouter } from 'next/router'
import { Page } from '../../components/page'
import { Title } from '../../components/title'
import { ContractSearch } from '../../components/contract-search'

export default function TagPage() {
  const router = useRouter()
  const { tag } = router.query as { tag: string }

  // TODO: Fix error: The provided `href` (/tag/[tag]?s=newest) value is missing query values (tag)
  return (
    <Page>
      <Title text={`#${tag}`} />
      <ContractSearch
        querySortOptions={{
          filter: { tag },
          defaultSort: 'newest',
          shouldLoadFromStorage: false,
        }}
      />
    </Page>
  )
}
