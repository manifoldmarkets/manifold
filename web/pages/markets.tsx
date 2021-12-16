import { useEffect, useState } from 'react'
import { SearchableGrid } from '../components/contracts-list'
import { Header } from '../components/header'
import { listAllContracts } from '../lib/firebase/contracts'
import { Contract } from '../lib/firebase/contracts'

export default function Markets() {
  const [contracts, setContracts] = useState<Contract[]>([])
  useEffect(() => {
    listAllContracts().then(setContracts)
  }, [])

  return (
    <div>
      <Header />
      <div className="max-w-4xl py-8 mx-auto">
        <SearchableGrid contracts={contracts} />
      </div>
    </div>
  )
}
