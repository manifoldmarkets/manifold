import { SearchableGrid } from '../components/contracts-list'
import { Header } from '../components/header'
import { useContracts } from '../hooks/use-contracts'

export default function Markets() {
  const contracts = useContracts()

  return (
    <div>
      <Header />
      <div className="max-w-4xl py-8 mx-auto">
        <SearchableGrid contracts={contracts === 'loading' ? [] : contracts} />
      </div>
    </div>
  )
}
