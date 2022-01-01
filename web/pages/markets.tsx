import { useRouter } from 'next/router'
import { SearchableGrid } from '../components/contracts-list'
import { Page } from '../components/page'
import { useContracts } from '../hooks/use-contracts'
import { Contract, listAllContracts } from '../lib/firebase/contracts'

export async function getStaticProps() {
  const contracts = await listAllContracts().catch((_) => [])

  return {
    props: {
      contracts,
    },

    revalidate: 60, // regenerate after a minute
  }
}

export default function Markets(props: { contracts: Contract[] }) {
  const contracts = useContracts()

  const router = useRouter()
  const { tag, creator, newest, mostTraded } = router.query as {
    tag?: string
    creator?: string
    newest?: string
    mostTraded?: string
  }
  const sort =
    tag === ''
      ? 'tag'
      : creator === ''
      ? 'creator'
      : newest === ''
      ? 'createdTime'
      : mostTraded === ''
      ? 'pool'
      : undefined

  const setSort = () => {
    router.push(router.pathname, '?tag')
  }

  return (
    <Page>
      {(props.contracts || contracts !== 'loading') && router.isReady && (
        <SearchableGrid
          contracts={contracts === 'loading' ? props.contracts : contracts}
          sort={sort}
          setSort={setSort}
        />
      )}
    </Page>
  )
}
