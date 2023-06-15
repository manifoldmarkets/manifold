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
import { CalibrationChart } from 'web/components/charts/calibration'
import { useIsMobile } from 'web/hooks/use-is-mobile'

export const getStaticProps = async (props: {
  params: {
    username: string
  }
}) => {
  const { username } = props.params
  const user = await getUserByUsername(username)

  const bets = user
    ? await getUserBetsFromResolvedContracts(user.id, 10000)
    : []
  const { yesBuckets, noBuckets, yesBetsBuckets, noBetsBuckets } =
    getCalibrationPoints(bets)

  const yesPoints = getXY(yesBuckets)
  const noPoints = getXY(noBuckets)

  const score = getPseudoBrierScore(bets)

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
  yesPoints: { x: number; y: number }[]
  noPoints: { x: number; y: number }[]
  yesBetsBuckets: Record<number, [Contract, Bet][]>
  noBetsBuckets: Record<number, [Contract, Bet][]>
  score: number
}) {
  const { user, yesPoints, noPoints, score } = props
  const isMobile = useIsMobile()

  return (
    <Page>
      <SEO
        title={`${user?.name}'s calibration`}
        description="Personal calibration results"
      />
      <Col className="w-full rounded px-4 py-6 sm:px-8 xl:w-[125%]">
        <Col className="max-w-[800px]">
          <Title>{user?.name}'s calibration</Title>

          {score !== undefined && (
            <div className="mb-4 text-center text-lg">
              Grade: {getGrade(score)}, Score: {score}
            </div>
          )}

          <div className="bg-canvas-0 relative max-w-[800px] rounded-md p-4 pr-12">
            <div className="absolute top-0 bottom-0 right-4 flex items-center">
              <span className="text-ink-800 text-sm [writing-mode:vertical-rl]">
                Resolution probability
              </span>
            </div>

            <CalibrationChart
              yesPoints={yesPoints}
              noPoints={noPoints}
              width={isMobile ? 290 : 700}
              height={isMobile ? 200 : 400}
            />
            <div className="text-ink-800 text-center text-sm">
              Probability after bet
            </div>
          </div>

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
                The score is the mean squared error for each non-sell bet
                weighted by log bet amount. Smaller is better.
              </li>

              <li>
                Each point is a bucket of bets weighted by log bet amount with a
                maximum range of 10% (sell trades are excluded).
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
        3 largest bets for each bucket
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

export const points = [1, 3, 5, ...range(10, 100, 10), 95, 97, 99]

export const getPseudoBrierScore = (betsData: [Contract, LimitBet[]][]) => {
  let score = 0
  let n = 0

  for (const [contract, bets] of betsData) {
    const { resolution } = contract
    if (resolution !== 'YES' && resolution !== 'NO') continue
    const resolvedYES = resolution === 'YES'

    for (const bet of bets as Bet[]) {
      if (bet.amount < 0) continue // skip sales

      const w = Math.log10(bet.amount + 1)
      n += w

      if (bet.outcome === 'YES' && !resolvedYES) {
        score += w * (bet.probAfter - 0) ** 2
      } else if (bet.outcome === 'NO' && resolvedYES) {
        score += w * (1 - bet.probAfter) ** 2
      }
    }
  }

  return n === 0 ? 0 : (score / n).toPrecision(3)
}

export const getCalibrationPoints = (betsData: [Contract, LimitBet[]][]) => {
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

      const w = Math.log10(bet.amount + 1) // weight by log bet amount

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

  // Return the top 3 bets by amount for each probability bucket
  function sortAndLimit(contractAndBets: [Contract, Bet][]) {
    return sortBy(contractAndBets, (cAndB) => -cAndB[1].amount).slice(0, 3)
  }

  return {
    yesBuckets: yesProbBuckets,
    noBuckets: noProbBuckets,
    yesBetsBuckets: mapValues(yesBetsBuckets, sortAndLimit),
    noBetsBuckets: mapValues(noBetsBuckets, sortAndLimit),
  }
}

const getXY = (probBuckets: Dictionary<number>) => {
  const xy = []

  for (const point of points) {
    if (probBuckets[point] !== undefined) {
      xy.push({ x: point / 100, y: probBuckets[point] })
    }
  }

  return xy
}

export const calculateOldScore = (
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

export const getOldGrade = (score: number) => {
  if (score > -0.05) return 'S'
  if (score >= -0.15) return 'A+'
  if (score >= -0.5) return 'A'
  if (score >= -1) return 'A-'
  if (score >= -1.5) return 'B+'
  if (score >= -2.5) return 'B'
  if (score >= -4) return 'B-'
  if (score >= -5.5) return 'C+'
  if (score >= -7) return 'C'
  if (score >= -8.5) return 'C-'
  if (score >= -10) return 'D'
  else return 'F'
}

export const getGrade = (score: number) => {
  if (score <= 0.055) return 'S'
  if (score <= 0.065) return 'A+'
  if (score <= 0.075) return 'A'
  if (score <= 0.085) return 'A-'
  if (score <= 0.1) return 'B+'
  if (score <= 0.13) return 'B'
  if (score <= 0.15) return 'B-'
  if (score <= 0.17) return 'C+'
  if (score <= 0.19) return 'C'
  if (score <= 0.21) return 'C-'
  if (score <= 0.24) return 'D'
  else return 'F'
}
