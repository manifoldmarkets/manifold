import { searchInAny } from 'common/util/parse'
import { debounce, sortBy } from 'lodash'
import { useMemo, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/page'
import { Title } from 'web/components/title'
import { ftxGrants } from './ftxGrants'
import GranteeCard from './GranteeCard'

export type Grantee = {
  name: string // Better be unique lol
  // slug = name.toLowerCase().replace(/\s/g, '-')
  slug: string
  website?: string
  photo?: string
  preview: string
  description: string
  grantsReceived: Grant[]
  totalReceived: number
}

export type Grant = {
  date: string // in YYYY-MM-DD format
  amount: number // in USD
  from: 'FTX FF' | 'SFF' | 'OP'
  to: string // The name of the receiving charity
  description: string // Why the grant was given; if stated
}

// const grantees: Grantee[] = [
//   {
//     name: 'Manifold Markets',
//     slug: 'manifold-markets',
//     website: 'https://manifold.markets',
//     preview: '',
//     description: '',
//     grantsReceived: [
//       {
//         date: '2022-03-01',
//         amount: 500000,
//         from: 'FTX FF',
//         to: 'Manifold Markets',
//         description: 'Because you guys are awesome!',
//       },
//     ],
//   },
// ]

const grantees = grantsToGrantees(ftxGrants)

function grantsToGrantees(grantsList: Grant[]) {
  const grantees = [] as Grantee[]
  for (const grant of grantsList) {
    const name = grant.to
    let grantee: Grantee | undefined = grantees.find((g) => g.name === name)
    if (!grantee) {
      grantee = {
        name,
        slug: name.toLowerCase().replace(/\s/g, '-'),
        preview: grant.description,
        description: grant.description,
        grantsReceived: [],
        totalReceived: 0,
      }
      grantees.push(grantee)
    }
    grantee.grantsReceived.push(grant)
    grantee.totalReceived += grant.amount
  }
  console.log(grantees)
  return grantees
}

export default function Grants() {
  const [query, setQuery] = useState('')
  const debouncedQuery = debounce(setQuery, 50)

  const filteredGrantees = useMemo(() => {
    const g = grantees.filter((grantee) =>
      searchInAny(query, grantee.name, grantee.description)
    )
    return sortBy(g, 'totalReceived').reverse()
  }, [query])

  return (
    <Page>
      <Col className="w-full rounded px-4 py-6 sm:px-8 xl:w-[125%]">
        <Col className="">
          <Title className="!mt-0" text="EA Grants Database" />

          <input
            type="text"
            onChange={(e) => debouncedQuery(e.target.value)}
            placeholder="Find a charity"
            className="input input-bordered mb-6 w-full"
          />

          <div className="grid max-w-xl grid-flow-row grid-cols-1 gap-4 lg:max-w-full lg:grid-cols-2 xl:grid-cols-3">
            {filteredGrantees.map((grantee) => (
              <GranteeCard grantee={grantee} key={grantee.name} />
            ))}
          </div>
        </Col>
      </Col>
    </Page>
  )
}
