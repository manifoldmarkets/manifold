import { SearchableGrid } from '../components/contracts-list'
import { NavBar } from '../components/nav-bar'
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
    <div className="max-w-4xl px-4 pb-8 mx-auto">
      <NavBar />
      {(props.contracts || contracts !== 'loading') && (
        <SearchableGrid
          contracts={contracts === 'loading' ? props.contracts : contracts}
        />
      )}
    </div>
  )
}
