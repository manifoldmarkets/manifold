import React, { useEffect, useState } from 'react'
import { ContractsGrid } from '../components/contracts-list'
import { Header } from '../components/header'
import { Title } from '../components/title'
import { compute, listAllContracts } from '../lib/firebase/contracts'
import { Contract } from '../lib/firebase/contracts'

export default function Markets() {
  const [contracts, setContracts] = useState<Contract[]>([])
  useEffect(() => {
    listAllContracts().then(setContracts)
  }, [])

  const [query, setQuery] = useState('')
  type Sort = 'createdTime' | 'volume'
  const [sort, setSort] = useState('volume')

  function check(corpus: String) {
    return corpus.toLowerCase().includes(query.toLowerCase())
  }
  const matches = contracts.filter(
    (c) => check(c.question) || check(c.description) || check(c.creatorName)
  )

  if (sort === 'createdTime') {
    matches.sort((a, b) => b.createdTime - a.createdTime)
  } else if (sort === 'volume') {
    matches.sort((a, b) => compute(b).volume - compute(a).volume)
  }

  return (
    <div>
      <Header />
      <div className="max-w-4xl py-8 mx-auto">
        {/* Show a search input next to a sort dropdown */}
        <div className="flex justify-between gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search markets"
            className="input input-bordered w-full"
          />
          <select
            className="select select-bordered"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
          >
            <option value="volume">Most traded</option>
            <option value="createdTime">Newest first</option>
          </select>
        </div>

        <Title text="Open markets" className="mt-16" />
        <ContractsGrid contracts={matches.filter((c) => !c.resolution)} />

        <Title text="Resolved markets" className="mt-16" />
        <ContractsGrid contracts={matches.filter((c) => c.resolution)} />
      </div>
    </div>
  )
}
