import { SearchableGrid } from '../components/contracts-list'
import { Header } from '../components/header'
import { useContracts } from '../hooks/use-contracts'

export default function Markets() {
  const contracts = useContracts()

  return (
    <div className="max-w-4xl px-4 pb-8 mx-auto">
      <Header />
      <SearchableGrid contracts={contracts === 'loading' ? [] : contracts} />
    </div>
  )
}
