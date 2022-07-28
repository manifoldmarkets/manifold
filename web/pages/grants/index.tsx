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
      }
      grantees.push(grantee)
    }
    grantee.grantsReceived.push(grant)
  }
  console.log(grantees)
  return grantees
}

export default function Grants() {
  return (
    <Page>
      <Col className="w-full rounded px-4 py-6 sm:px-8 xl:w-[125%]">
        <Col className="">
          <Title className="!mt-0" text="Manifold for Charity" />

          <div className="grid max-w-xl grid-flow-row grid-cols-1 gap-4 lg:max-w-full lg:grid-cols-2 xl:grid-cols-3">
            {grantees.map((grantee) => (
              <GranteeCard grantee={grantee} key={grantee.name} />
            ))}
          </div>
        </Col>
      </Col>
    </Page>
  )
}
