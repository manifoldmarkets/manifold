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

  return (
    <Page>
      {(props.contracts || contracts !== 'loading') && (
        <SearchableGrid
          contracts={contracts === 'loading' ? props.contracts : contracts}
        />
      )}
    </Page>
  )
}
