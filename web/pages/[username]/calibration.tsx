import dynamic from 'next/dynamic'
const Plot = dynamic(() => import('react-plotly.js'), { ssr: false }) as any

import { Col } from 'web/components/layout/col'
import { Title } from 'web/components/widgets/title'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { Dictionary, mapValues, range, sortBy } from 'lodash'
import { getUserByUsername, User } from 'web/lib/firebase/users'
import { getUserBetsFromResolvedContracts } from 'web/lib/supabase/bets'
import { Bet, LimitBet } from 'common/bet'
import { Contract } from 'common/contract'
import { ContractMention } from 'web/components/contract/contract-mention'
import { formatMoney } from 'common/util/format'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import { useState } from 'react'
import { Row } from 'web/components/layout/row'
import clsx from 'clsx'

export const getStaticProps = async (props: {
  params: {
    username: string
  }
}) => {
  const { username } = props.params
  const user = await getUserByUsername(username)

  const bets = user
    ? await getUserBetsFromResolvedContracts(user.id, 25000)
    : []
  const { yesBuckets, noBuckets, yesBetsBuckets, noBetsBuckets } =
    getCalibrationPoints(bets)

  const yesPoints = getXY(yesBuckets)
  const noPoints = getXY(noBuckets)

  const score = calculateScore(yesBuckets, noBuckets)

  return {
    props: {
      user,
      yesPoints,
      noPoints,
      score,
      yesBetsBuckets,
      noBetsBuckets,
    },
    revalidate: 60 * 60, // Regenerate after an hour
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function CalibrationPage(props: {
  user: User | null
  yesPoints: { x: number[]; y: number[] }
  noPoints: { x: number[]; y: number[] }
  yesBetsBuckets: Record<number, [Contract, Bet][]>
  noBetsBuckets: Record<number, [Contract, Bet][]>
  score: number
}) {
  const { user, yesPoints, noPoints, score } = props
  const domain = range(0, 1.01, 0.01)

  return (
    <Page>
      <SEO
        title={`${user?.name}'s calibration`}
        description="Personal calibration results"
      />
      <Col className="w-full rounded px-4 py-6 sm:px-8 xl:w-[125%]">
        <Col className="max-w-[800px]">
          <Title>{user?.name}'s calibration</Title>

          <Plot
            data={[
              {
                ...yesPoints,
                mode: 'markers',
                type: 'scatter',
                marker: { color: 'green' },
                name: 'YES bets',
              },
              {
                ...noPoints,
                mode: 'markers',
                type: 'scatter',
                marker: { color: 'red' },
                name: 'NO bets',
              },
              {
                x: domain,
                y: domain,
                mode: 'lines',
                type: 'scatter',
                marker: { color: 'gray' },
                name: 'y=x',
              },
            ]}
            layout={{
              title:
                user?.name +
                "'s bet calibration" +
                (score !== undefined ? ` (score: ${score})` : ''),
              xaxis: { title: 'Probability after bet' },
              yaxis: { title: 'Resolution probability' },
            }}
          />

          <div className="prose prose-sm text-ink-600 my-4 max-w-[800px]">
            <b>Interpretation</b>
            <ul>
              <li>
                The green dot at (x%, y%) means when {user?.name} bet YES at x%,
                the market resolved YES y% of the time on average.
              </li>

              <li>
                Perfect calibration would result in all green points being above
                the line, all red points below, and a score of zero.
              </li>

              <li>
                The score is the mean squared error for yes and no bets times
                -100.
              </li>

              <li>
                Each point is a bucket of bets weighted by bet amount with a
                maximum range of 10% (sold bets are excluded).
              </li>
            </ul>
          </div>

          <BetsTable
            yesBetsBuckets={props.yesBetsBuckets}
            noBetsBuckets={props.noBetsBuckets}
          />
        </Col>
      </Col>
    </Page>
  )
}

function BetsTable(props: {
  yesBetsBuckets: Record<number, [Contract, Bet][]>
  noBetsBuckets: Record<number, [Contract, Bet][]>
}) {
  const { yesBetsBuckets, noBetsBuckets } = props
  const [betsShown, setBetsShown] = useState<'YES' | 'NO'>('YES')
  const textColor = betsShown === 'YES' ? 'text-teal-600' : 'text-scarlet-600'

  return (
    <div>
      <Row className="justify-center">
        <ChoicesToggleGroup
          choicesMap={{
            'YES bets': 'YES',
            'NO bets': 'NO',
          }}
          currentChoice={betsShown}
          setChoice={(c) => setBetsShown(c as 'YES' | 'NO')}
          color="indigo"
        />
      </Row>

      <div className="text-center text-xs text-gray-400">
        10 largest bets for each bucket
      </div>

      {Object.entries(betsShown === 'YES' ? yesBetsBuckets : noBetsBuckets).map(
        ([p, contractAndBet]) => (
          <div key={p}>
            <span className={clsx('text-3xl', textColor)}>{p}%</span>
            <ul className="mb-8">
              {contractAndBet.map(([contract, bet]) => (
                <li key={bet.id}>
                  <ContractMention contract={contract} />
                  <span className={clsx('ml-2', textColor)}>
                    {formatMoney(bet.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )
      )}
    </div>
  )
}

const points = [1, 3, 5, ...range(10, 100, 10), 95, 97, 99]

const getCalibrationPoints = (betsData: [Contract, LimitBet[]][]) => {
  const yesProbBuckets: Dictionary<number> = {}
  const yesCountBuckets: Dictionary<number> = {}
  const yesBetsBuckets: Record<number, [Contract, Bet][]> = {}

  const noProbBuckets: Dictionary<number> = {}
  const noCountBuckets: Dictionary<number> = {}
  const noBetsBuckets: Record<number, [Contract, Bet][]> = {}

  for (const [contract, bets] of betsData) {
    const { resolution } = contract
    if (resolution !== 'YES' && resolution !== 'NO') continue
    const resolvedYES = resolution === 'YES'

    for (const bet of bets as Bet[]) {
      if (bet.amount < 0) continue // skip sales

      const rawP = bet.probAfter * 100

      // get probability bucket that's closest to a prespecified point
      const p = points.reduce((prev, curr) =>
        Math.abs(curr - rawP) < Math.abs(prev - rawP) ? curr : prev
      )

      const w = bet.amount // weight by bet amount

      if (bet.outcome === 'YES') {
        yesProbBuckets[p] = (yesProbBuckets[p] ?? 0) + (resolvedYES ? w : 0)
        yesCountBuckets[p] = (yesCountBuckets[p] ?? 0) + w
        yesBetsBuckets[p] = [...(yesBetsBuckets[p] ?? []), [contract, bet]]
      } else {
        noProbBuckets[p] = (noProbBuckets[p] ?? 0) + (resolvedYES ? 0 : w)
        noCountBuckets[p] = (noCountBuckets[p] ?? 0) + w
        noBetsBuckets[p] = [...(noBetsBuckets[p] ?? []), [contract, bet]]
      }
    }
  }

  for (const point of points) {
    if (yesCountBuckets[point]) {
      yesProbBuckets[point] = yesProbBuckets[point] / yesCountBuckets[point]
    }

    if (noCountBuckets[point]) {
      noProbBuckets[point] = 1 - noProbBuckets[point] / noCountBuckets[point]
    }
  }

  // Return the top 10 bets by amount for each probability bucket
  function sortAndLimit(contractAndBets: [Contract, Bet][]) {
    return sortBy(contractAndBets, (cAndB) => -cAndB[1].amount).slice(0, 10)
  }

  return {
    yesBuckets: yesProbBuckets,
    noBuckets: noProbBuckets,
    yesBetsBuckets: mapValues(yesBetsBuckets, sortAndLimit),
    noBetsBuckets: mapValues(noBetsBuckets, sortAndLimit),
  }
}

const getXY = (probBuckets: Dictionary<number>) => {
  const x = []
  const y = []

  for (const point of points) {
    if (probBuckets[point] !== undefined) {
      x.push(point / 100)
      y.push(probBuckets[point])
    }
  }

  return { x, y }
}

const calculateScore = (
  yesBuckets: Dictionary<number>,
  noBuckets: Dictionary<number>
) => {
  let score = 0
  let n = 0

  for (const point of points) {
    const prob = point / 100
    const yes = yesBuckets[point]
    const no = noBuckets[point]

    if (yes !== undefined) {
      score += yes < prob ? (prob - yes) ** 2 : 0
      n++
    }

    if (no !== undefined) {
      score += no > prob ? (no - prob) ** 2 : 0
      n++
    }
  }

  const raw = score / n
  return (-100 * Math.round(raw * 1e4)) / 1e4
}
