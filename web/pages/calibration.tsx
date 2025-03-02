import { useState } from 'react'
import { axisBottom, axisRight } from 'd3-axis'
import { scaleLinear } from 'd3-scale'
import { Col } from 'web/components/layout/col'
import { Title } from 'web/components/widgets/title'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { SVGChart, formatPct } from 'web/components/charts/helpers'
import { formatLargeNumber } from 'common/util/format'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { Linkify } from 'web/components/widgets/linkify'
import { SizedContainer } from 'web/components/sized-container'
import { TrustPanel } from 'web/components/trust-panel'
import ChevronDownIcon from '@heroicons/react/solid/ChevronDownIcon'
import { FeedContractCard } from 'web/components/contract/feed-contract-card'
import { Contract } from 'common/contract'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import { getContract } from 'common/supabase/contracts'
import { Card } from 'web/components/widgets/card'
import { Row } from 'web/components/layout/row'

const TRADER_THRESHOLD = 15
const SAMPLING_P = 0.02

export const getStaticProps = async () => {
  const db = await initSupabaseAdmin()

  try {
    const result = await db
      .from('platform_calibration')
      .select('*')
      .order('created_time', { ascending: false })
      .limit(1)

    const { points, score, n } = result.data?.[0]?.data as any
    const trumpMarket = await getContract(db, 'AiEh38dIYVV5tOs1RmN3')
    const gazaMarket = await getContract(db, 'KmWz1wvC8AmNX3a1iiUF')
    const sbfMarket = await getContract(db, 'dRdXZtj8UXiXxkoF2rXE')

    return {
      props: {
        points,
        score,
        n,
        trumpMarket,
        gazaMarket,
        sbfMarket,
      },
      revalidate: 60 * 60, // Regenerate after an hour
    }
  } catch (err) {
    console.error(err)
    return {
      props: {
        points: [],
        score: 0,
        n: 0,
        trumpMarket: null,
        gazaMarket: null,
        sbfMarket: null,
      },
      revalidate: 60,
    }
  }
}

export default function CalibrationPage(props: {
  points: { x: number; y: number }[]
  score: number
  n: number
  trumpMarket: Contract | null
  gazaMarket: Contract | null
  sbfMarket: Contract | null
}) {
  const { points, score, n, trumpMarket, gazaMarket, sbfMarket } = props
  const [isCollapsed, setIsCollapsed] = useState(true)

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed)
  }

  if (!trumpMarket || !gazaMarket || !sbfMarket) {
    return <div>Contracts not found</div>
  }

  return (
    <Page trackPageView={'platform calibration page'}>
      <SEO
        title={`Platform calibration`}
        description="Manifold's overall track record"
      />
      <Col className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-8">
          <Title>Track Record and Accuracy</Title>
          <p className="text-ink-600 max-w-2xl">
            See how Manifold's predictions compare to real-world outcomes and
            explore our track record of accuracy.
          </p>
        </div>

        <TrustPanel className="mb-8" />

        <Card className="mb-8 overflow-hidden shadow-md">
          <div className="bg-canvas-50 border-ink-200 border-b p-4">
            <h2 className="text-ink-900 text-lg font-semibold">
              Overall Calibration
            </h2>
          </div>
          <div className="p-6">
            <div className="text-ink-600 mb-6 space-y-2">
              <p>
                This chart shows whether events happened as often as we
                predicted. We want the blue dots to be as close to the diagonal
                line as possible!
              </p>
              <p>
                A dot with a question probability of 70% means we have a group
                of markets that were predicted to have a 70% chance of
                occurring. If our predictions are perfectly calibrated, then 70%
                of those markets should have resolved yes and it should appear
                on the y-axis at 70%.
              </p>
            </div>

            <div className="bg-canvas-50 border-ink-100 relative w-full rounded-md border p-4 pr-12">
              <div className="absolute bottom-0 right-4 top-0 flex items-center">
                <span className="text-ink-800 text-sm [writing-mode:vertical-rl]">
                  Resolved Yes
                </span>
              </div>

              <SizedContainer className="aspect-video w-full pb-8 pr-8">
                {(w, h) => (
                  <CalibrationChart points={points} width={w} height={h} />
                )}
              </SizedContainer>
              <div className="text-ink-800 text-center text-sm">
                Question probability
              </div>
            </div>

            <div className="bg-primary-50 border-primary-100 mt-6 rounded-lg border p-4">
              <Row className="items-center">
                <div className="text-primary-800 mr-2 font-medium">
                  Brier score:
                </div>
                <div className="text-primary-900 font-bold">
                  {Math.round(score * 1e5) / 1e5}
                </div>
                <InfoTooltip text="Mean squared error of forecasted probability compared to the true outcome. Closer to 0 is better.">
                  <div className="text-primary-500 hover:text-primary-700 ml-1">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                </InfoTooltip>
              </Row>
              <div className="text-primary-700 mt-1 text-sm">
                A score between 0.1 and 0.2 is very good! Our data shows our
                markets are very accurate.
              </div>

              <div
                className="text-primary-800 mt-3 flex cursor-pointer items-center"
                onClick={toggleCollapse}
              >
                <span className="font-medium">Methodology details</span>
                <ChevronDownIcon
                  className={`text-primary-600 ml-1 h-5 w-5 transition-transform ${
                    isCollapsed ? '' : 'rotate-180 transform'
                  }`}
                />
              </div>

              {!isCollapsed && (
                <ol className="text-primary-800 mt-3 list-decimal space-y-2 pl-5 text-sm">
                  <li>
                    Every hour we sample {formatPct(SAMPLING_P)} of all past
                    trades on resolved binary questions with {TRADER_THRESHOLD}{' '}
                    or more traders. Current sample size: {formatLargeNumber(n)}{' '}
                    trades.
                  </li>
                  <li>
                    For each sampled trade, we find the average probability
                    between the start and end.
                  </li>
                  <li>We group trades with similar probabilities together.</li>
                  <li>
                    Then, we check for trades that said there was e.g. a 60%
                    chance, and how often those markets resolve yes. In this
                    case we would expect 60% of them to have resolved yes for
                    perfect calibration!
                  </li>
                  <li>
                    We can repeat this at each probability interval to plot a
                    graph showing how the probability of our trades compare to
                    how often it actually happens!
                  </li>
                  <li>
                    <strong>Limitations</strong>: This methodology uses
                    trade-weighted rather than time-weighted calibration. Market
                    accuracy may be better than what is reflected here, as large
                    miscalibrated trades are usually corrected immediately!
                  </li>
                </ol>
              )}
            </div>
          </div>
        </Card>

        <Card className="mb-8 overflow-hidden shadow-md">
          <div className="bg-canvas-50 border-ink-200 border-b p-4">
            <h2 className="text-ink-900 text-lg font-semibold">Case Studies</h2>
          </div>
          <div className="p-6">
            <div className="space-y-8">
              <div className="border-ink-100 border-b pb-8">
                <h3 className="text-ink-800 mb-3 text-xl font-medium">
                  Predicting Trump's arrest
                </h3>
                <div className="mb-4">
                  <FeedContractCard contract={trumpMarket} showGraph={true} />
                </div>
                <div className="text-ink-600 bg-canvas-50 border-ink-100 rounded-md border p-4">
                  On March 18th Trump posted on Truth Social that he believes he
                  was about to be arrested, this caused our market to spike to
                  88%. However, since December our market had already been
                  hovering around 40% on average before anyone else was even
                  discussing it as a true possibility of happening!
                </div>
              </div>

              <div className="border-ink-100 border-b pb-8">
                <h3 className="text-ink-800 mb-3 text-xl font-medium">
                  Al-Ahli Arab hospital explosion
                </h3>
                <div className="mb-4">
                  <FeedContractCard contract={gazaMarket} showGraph={true} />
                </div>
                <div className="text-ink-600 bg-canvas-50 border-ink-100 rounded-md border p-4">
                  <p className="mb-2">
                    Just 3 hours after the initial local reports of the
                    explosion, we had this market made. Within 1 hour of
                    creation it had already been pushed to down 6%, before
                    eventually settling between 6-20% over the next few hours as
                    more news came to light.
                  </p>
                  <p>
                    Meanwhile, major news outlets still presented conflicting
                    headlines, which eventually led to the{' '}
                    <a
                      className="text-primary-700 hover:underline"
                      target="_blank"
                      href="https://www.theguardian.com/world/2023/oct/19/israel-accuses-bbc-of-modern-blood-libel-over-reporting-of-hospital-strike"
                    >
                      BBC conceding that a reporter had been wrong to speculate
                      in his analysis.
                    </a>
                  </p>
                </div>
              </div>

              <div className="border-ink-100 border-b pb-8">
                <h3 className="text-ink-800 mb-3 text-xl font-medium">
                  Predicting SBF fraud
                </h3>
                <div className="mb-4">
                  <FeedContractCard contract={sbfMarket} showGraph={true} />
                </div>
                <div className="text-ink-600 bg-canvas-50 border-ink-100 rounded-md border p-4">
                  Manifold had a market stable between 5-10% that SBF would be
                  convicted of a felony 1-month before there was any news about
                  it. It then immediately reacted correctly to rumors before any
                  official statements were made.
                </div>
              </div>

              <div>
                <h3 className="text-ink-800 mb-3 text-xl font-medium">
                  How we performed on the 2022 US midterms
                </h3>
                <div className="text-ink-600 bg-canvas-50 border-ink-100 rounded-md border p-4">
                  Manifold{' '}
                  <a
                    className="text-primary-700 hover:underline"
                    target="_blank"
                    href="https://firstsigma.substack.com/p/midterm-elections-forecast-comparison-analysis"
                  >
                    outperformed real money prediction markets and was almost as
                    accurate as FiveThiryEight
                  </a>{' '}
                  when forecasting the 2022 US midterm elections.
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden shadow-md">
          <div className="bg-canvas-50 border-ink-200 border-b p-4">
            <h2 className="text-ink-900 text-lg font-semibold">
              Additional Resources
            </h2>
          </div>
          <div className="p-6">
            <div className="text-ink-700">
              See more{' '}
              <a
                className="text-primary-700 font-medium hover:underline"
                target="_blank"
                href="https://wasabipesto.com/manifold/markets/"
              >
                charts and analysis
              </a>{' '}
              courtesy of <Linkify text="@wasabipesto" /> from our data in 2022.
            </div>
          </div>
        </Card>
      </Col>
    </Page>
  )
}

function CalibrationChart(props: {
  points: { x: number; y: number }[]
  width: number
  height: number
}) {
  const { points, width, height } = props

  const xScale = scaleLinear().domain([0, 1]).range([0, width])
  const yScale = scaleLinear().domain([0, 1]).range([height, 0])

  const tickVals = points.map((p) => p.x)

  const format = (d: number) =>
    (d <= 0.9 || d === 0.99) && (d >= 0.1 || d === 0.01) ? formatPct(d) : ''

  const xAxis = axisBottom<number>(xScale)
    .tickFormat(format)
    .tickValues(tickVals)

  const yAxis = axisRight<number>(yScale)
    .tickFormat(format)
    .tickValues(tickVals)

  const px = (p: { x: number; y: number }) => xScale(p.x)
  const py = (p: { x: number; y: number }) => yScale(p.y)

  const [point, setPoint] = useState<{ x: number; y: number } | null>(null)

  return (
    <SVGChart
      w={width}
      h={height}
      xAxis={xAxis}
      yAxis={yAxis}
      ttParams={point ? { x: px(point), y: py(point), point } : undefined}
      Tooltip={({ point }) => {
        return (
          <div className="font-medium">
            ({formatPct(point.x)}, {formatPct(point.y)})
          </div>
        )
      }}
    >
      {/* Diagonal reference line */}
      <line
        x1={xScale(0)}
        y1={yScale(0)}
        x2={xScale(1)}
        y2={yScale(1)}
        className="stroke-primary-400"
        strokeWidth={1.5}
        strokeDasharray="4 8"
      />

      {/* Data points */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={px(p)}
          cy={py(p)}
          r={6}
          className="fill-primary-600 stroke-primary-800 hover:fill-primary-500 stroke-1 transition-colors"
          onMouseEnter={() => setPoint(p)}
          onMouseLeave={() => setPoint(null)}
        />
      ))}
    </SVGChart>
  )
}

export function WasabiCharts() {
  return (
    <>
      <div className="text-ink-600 mt-8">
        See more {''}
        <a
          className="text-primary-700 hover:underline"
          target="_blank"
          href="https://wasabipesto.com/manifold/markets/"
        >
          charts
        </a>
        {''} courtesy of <Linkify text="@wasabipesto" /> from our data in 2022.
      </div>
    </>
  )
}
