import React, { useEffect, useState } from 'react'
import { ContractsGrid } from '../components/contracts-list'
import { Header } from '../components/header'
import { compute, listAllContracts } from '../lib/firebase/contracts'
import { Contract } from '../lib/firebase/contracts'

export default function Markets() {
  const [contracts, setContracts] = useState<Contract[]>([])
  useEffect(() => {
    listAllContracts().then(setContracts)
  }, [])

  const [query, setQuery] = useState('')
  type Sort = 'createdTime' | 'volume' | 'resolved' | 'all'
  const [sort, setSort] = useState('volume')

  function check(corpus: String) {
    return corpus.toLowerCase().includes(query.toLowerCase())
  }
  let matches = contracts.filter(
    (c) => check(c.question) || check(c.description) || check(c.creatorName)
  )

  if (sort === 'createdTime' || sort === 'resolved' || sort === 'all') {
    matches.sort((a, b) => b.createdTime - a.createdTime)
  } else if (sort === 'volume') {
    matches.sort((a, b) => compute(b).volume - compute(a).volume)
  }

  if (sort !== 'all') {
    // Filter for (or filter out) resolved contracts
    matches = matches.filter((c) =>
      sort === 'resolved' ? c.resolution : !c.resolution
    )
  }

  return (
    <div>
      <Header />
      <div className="max-w-4xl py-8 mx-auto">
        {/* Show a search input next to a sort dropdown */}
        <div className="flex justify-between gap-2 my-8">
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
            <option value="resolved">Resolved</option>
            <option value="all">All markets</option>
          </select>
        </div>

        <ContractsGrid contracts={matches} />
      </div>
    </div>
  )
}
