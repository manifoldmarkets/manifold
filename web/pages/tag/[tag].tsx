import { useRouter } from 'next/router'
import { SearchableGrid } from '../../components/contracts-list'
import { Page } from '../../components/page'
import { Title } from '../../components/title'
import { useContracts } from '../../hooks/use-contracts'
import { useQueryAndSortParams } from '../../hooks/use-sort-and-query-params'

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

  const { query, setQuery, sort, setSort } = useQueryAndSortParams({
    defaultSort: 'most-traded',
  })

  return (
    <Page>
      <Title text={`#${tag}`} />
      {contracts === 'loading' ? (
        <></>
      ) : (
        <SearchableGrid
          contracts={contracts}
          query={query}
          setQuery={setQuery}
          sort={sort}
          setSort={setSort}
        />
      )}
    </Page>
  )
}
