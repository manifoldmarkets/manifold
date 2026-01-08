import { useState } from 'react'
import { axisBottom, axisRight } from 'd3-axis'
import { scaleLinear } from 'd3-scale'
import clsx from 'clsx'
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
import { FeedContractCard } from 'web/components/contract/feed-contract-card'
import { Contract } from 'common/contract'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import { getContract } from 'common/supabase/contracts'
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
      revalidate: 60 * 60,
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
  const [isMethodologyOpen, setIsMethodologyOpen] = useState(false)

  if (!trumpMarket || !gazaMarket || !sbfMarket) {
    return <div>Contracts not found</div>
  }

  return (
    <Page trackPageView={'platform calibration page'}>
      <SEO
        title={`Platform calibration`}
        description="Manifold's overall track record"
      />

      {/* Subtle background gradient */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="from-primary-100/30 via-canvas-0 to-canvas-0 dark:from-primary-900/10 absolute inset-0 bg-gradient-to-b" />
        <div className="bg-primary-200/20 dark:bg-primary-800/5 absolute -right-64 -top-64 h-[600px] w-[600px] rounded-full blur-3xl" />
        <div className="bg-yes-200/20 dark:bg-yes-800/5 absolute -bottom-32 -left-32 h-[400px] w-[400px] rounded-full blur-3xl" />
      </div>

      <Col className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <div className="mb-12">
          <h1 className="text-ink-900 mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
            Calibration
          </h1>
          <p className="text-ink-600 max-w-2xl text-lg leading-relaxed">
            Explore how Manifold's predictions compare to real-world outcomes. 
            Our track record demonstrates the power of collective forecasting.
          </p>
        </div>

        {/* Trust Panel */}
        <TrustPanel className="mb-12" />

        {/* Main Calibration Card */}
        <section className="mb-12">
          <CalibrationCard
            points={points}
            score={score}
            n={n}
            isMethodologyOpen={isMethodologyOpen}
            setIsMethodologyOpen={setIsMethodologyOpen}
          />
        </section>

        {/* Case Studies Section */}
        <section className="mb-12">
          <div className="mb-6">
            <h2 className="text-ink-900 text-2xl font-semibold tracking-tight">
              Case Studies
            </h2>
            <p className="text-ink-500 mt-1 text-sm">
              Notable examples of prediction market accuracy
            </p>
          </div>

          <div className="space-y-6">
            <CaseStudyCard
              title="Predicting Trump's arrest"
              contract={trumpMarket}
              description="On March 18th Trump posted on Truth Social that he believes he was about to be arrested, causing our market to spike to 88%. However, since December our market had already been hovering around 40% on average before anyone else was even discussing it as a true possibility."
            />

            <CaseStudyCard
              title="Al-Ahli Arab hospital explosion"
              contract={gazaMarket}
              description={
                <>
                  Just 3 hours after initial local reports, this market was created. Within 1 hour it had already been pushed down to 6%, before settling between 6-20% as more news emerged. Meanwhile, major outlets still presented conflicting headlines, which led to the{' '}
                  <a
                    className="text-primary-600 dark:text-primary-400 underline decoration-primary-600/30 dark:decoration-primary-400/30 transition-colors hover:decoration-primary-600 dark:hover:decoration-primary-400"
                    target="_blank"
                    href="https://www.theguardian.com/world/2023/oct/19/israel-accuses-bbc-of-modern-blood-libel-over-reporting-of-hospital-strike"
                  >
                    BBC conceding that a reporter had been wrong to speculate
                  </a>.
                </>
              }
            />

            <CaseStudyCard
              title="Predicting SBF fraud"
              contract={sbfMarket}
              description="Manifold had a market stable between 5-10% that SBF would be convicted of a felony 1-month before there was any news about it. It then immediately reacted correctly to rumors before any official statements were made."
            />

            {/* 2022 Midterms - Text Only */}
            <div className="group relative overflow-hidden rounded-2xl border border-ink-200 dark:border-ink-300 bg-canvas-0 p-6 transition-all duration-300 hover:border-ink-300 dark:hover:border-ink-200 hover:shadow-lg hover:shadow-ink-900/5">
              <div className="absolute inset-0 bg-gradient-to-br from-primary-50/50 via-transparent to-transparent dark:from-primary-900/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="relative">
                <h3 className="text-ink-900 mb-3 text-lg font-semibold">
                  2022 US Midterm Elections
                </h3>
                <p className="text-ink-600 text-sm leading-relaxed">
                  Manifold{' '}
                  <a
                    className="text-primary-600 dark:text-primary-400 underline decoration-primary-600/30 dark:decoration-primary-400/30 transition-colors hover:decoration-primary-600 dark:hover:decoration-primary-400"
                    target="_blank"
                    href="https://firstsigma.substack.com/p/midterm-elections-forecast-comparison-analysis"
                  >
                    outperformed real money prediction markets
                  </a>{' '}
                  and was almost as accurate as FiveThirtyEight when forecasting the 2022 US midterm elections.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Resources Section */}
        <section>
          <div className="group relative overflow-hidden rounded-2xl border border-ink-200 dark:border-ink-300 bg-gradient-to-br from-canvas-0 to-canvas-50 p-6 transition-all duration-300 hover:shadow-lg hover:shadow-ink-900/5">
            <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br from-primary-200/40 to-yes-200/40 dark:from-primary-800/20 dark:to-yes-800/20 blur-2xl transition-transform duration-300 group-hover:scale-150" />
            <div className="relative">
              <h2 className="text-ink-900 mb-2 text-lg font-semibold">
                Additional Resources
              </h2>
              <p className="text-ink-600 text-sm leading-relaxed">
                See more{' '}
                <a
                  className="text-primary-600 dark:text-primary-400 font-medium underline decoration-primary-600/30 dark:decoration-primary-400/30 transition-colors hover:decoration-primary-600 dark:hover:decoration-primary-400"
                  target="_blank"
                  href="https://wasabipesto.com/manifold/markets/"
                >
                  charts and analysis
                </a>{' '}
                courtesy of <Linkify text="@wasabipesto" /> from our data in 2022.
              </p>
            </div>
          </div>
        </section>
      </Col>
    </Page>
  )
}

function CalibrationCard(props: {
  points: { x: number; y: number }[]
  score: number
  n: number
  isMethodologyOpen: boolean
  setIsMethodologyOpen: (open: boolean) => void
}) {
  const { points, score, n, isMethodologyOpen, setIsMethodologyOpen } = props

  return (
    <div className="relative overflow-hidden rounded-2xl border border-ink-200 dark:border-ink-300 bg-canvas-0 shadow-sm transition-shadow duration-300 hover:shadow-lg hover:shadow-ink-900/5">
      {/* Card Header */}
      <div className="border-b border-ink-100 dark:border-ink-200 bg-gradient-to-r from-canvas-0 via-canvas-0 to-primary-50/30 dark:to-primary-900/10 px-6 py-5">
        <Row className="items-center justify-between">
          <div>
            <h2 className="text-ink-900 text-xl font-semibold tracking-tight">
              Overall Calibration
            </h2>
            <p className="text-ink-500 mt-0.5 text-sm">
              Predicted vs actual outcomes across all markets
            </p>
          </div>
          <BrierScoreBadge score={score} />
        </Row>
      </div>

      {/* Card Body */}
      <div className="p-6">
        {/* Explanation */}
        <div className="text-ink-600 mb-6 text-sm leading-relaxed">
          <p>
            This chart shows whether events happened as often as we predicted. 
            The closer the blue dots are to the diagonal line, the better our calibration. 
            A dot at 70% on the x-axis should appear at 70% on the y-axis if exactly 70% of those markets resolved yes.
          </p>
        </div>

        {/* Chart Container */}
        <div className="relative rounded-xl border border-ink-100 dark:border-ink-200 bg-gradient-to-br from-canvas-50/50 to-canvas-0 p-4 sm:p-6">
          {/* Y-axis label */}
          <div className="absolute -left-2 top-1/2 -translate-y-1/2 -rotate-90">
            <span className="text-ink-500 whitespace-nowrap text-xs font-medium uppercase tracking-wider">
              Resolved Yes
            </span>
          </div>

          {/* Chart */}
          <div className="ml-4">
            <SizedContainer className="aspect-[4/3] w-full sm:aspect-video">
              {(w, h) => (
                <CalibrationChart points={points} width={w} height={h} />
              )}
            </SizedContainer>
          </div>

          {/* X-axis label */}
          <div className="mt-4 text-center">
            <span className="text-ink-500 text-xs font-medium uppercase tracking-wider">
              Market Probability
            </span>
          </div>
        </div>

        {/* Methodology Section */}
        <div className="mt-6">
          <button
            onClick={() => setIsMethodologyOpen(!isMethodologyOpen)}
            className="group flex w-full items-center justify-between rounded-lg bg-canvas-50 px-4 py-3 text-left transition-colors hover:bg-ink-100"
          >
            <span className="text-ink-700 text-sm font-medium">
              Methodology
            </span>
            <svg
              className={clsx(
                'text-ink-400 h-5 w-5 transition-transform duration-200',
                isMethodologyOpen && 'rotate-180'
              )}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          <div
            className={clsx(
              'overflow-hidden transition-all duration-300 ease-in-out',
              isMethodologyOpen ? 'mt-4 max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
            )}
          >
            <div className="rounded-lg border border-ink-100 dark:border-ink-200 bg-canvas-50 p-4">
              <ol className="text-ink-600 space-y-3 text-sm leading-relaxed">
                <MethodologyStep number={1}>
                  Every hour we sample {formatPct(SAMPLING_P)} of all past trades on resolved binary questions with {TRADER_THRESHOLD} or more traders. Current sample size: <span className="font-semibold text-ink-800">{formatLargeNumber(n)}</span> trades.
                </MethodologyStep>
                <MethodologyStep number={2}>
                  For each sampled trade, we find the average probability between the start and end.
                </MethodologyStep>
                <MethodologyStep number={3}>
                  We group trades with similar probabilities together.
                </MethodologyStep>
                <MethodologyStep number={4}>
                  Then, we check for trades that said there was e.g. a 60% chance, and how often those markets resolve yes. For perfect calibration, we expect 60% of them to have resolved yes.
                </MethodologyStep>
                <MethodologyStep number={5}>
                  We repeat this at each probability interval to plot the calibration curve.
                </MethodologyStep>
              </ol>
              <div className="mt-4 rounded-md border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 p-3">
                <p className="text-amber-800 dark:text-amber-200 text-xs leading-relaxed">
                  <span className="font-semibold">Note:</span> This methodology uses trade-weighted rather than time-weighted calibration. Market accuracy may be better than reflected here, as large miscalibrated trades are usually corrected immediately.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MethodologyStep(props: { number: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold">
        {props.number}
      </span>
      <span className="pt-0.5">{props.children}</span>
    </li>
  )
}

function BrierScoreBadge(props: { score: number }) {
  const displayScore = Math.round(props.score * 1e5) / 1e5

  return (
    <div className="flex items-center gap-2 rounded-full border border-yes-200 dark:border-yes-800/50 bg-yes-50 dark:bg-yes-900/20 px-3 py-1.5">
      <div className="h-2 w-2 animate-pulse rounded-full bg-yes-500" />
      <div className="flex items-center gap-1.5">
        <span className="text-yes-700 dark:text-yes-300 text-sm font-semibold">
          {displayScore}
        </span>
        <InfoTooltip
          text="Brier score: Mean squared error of forecasted probability vs true outcome. Closer to 0 is better. A score between 0.1 and 0.2 is excellent."
          className="text-yes-600 dark:text-yes-400"
        >
          <span className="text-yes-600 dark:text-yes-400 cursor-help text-xs">
            Brier
          </span>
        </InfoTooltip>
      </div>
    </div>
  )
}

function CaseStudyCard(props: {
  title: string
  contract: Contract
  description: React.ReactNode
}) {
  const { title, contract, description } = props

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-ink-200 dark:border-ink-300 bg-canvas-0 transition-all duration-300 hover:border-ink-300 dark:hover:border-ink-200 hover:shadow-lg hover:shadow-ink-900/5">
      {/* Subtle gradient overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary-50/50 via-transparent to-transparent dark:from-primary-900/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      <div className="relative p-6">
        <h3 className="text-ink-900 mb-4 text-lg font-semibold">
          {title}
        </h3>

        {/* Contract Card */}
        <div className="mb-4 overflow-hidden rounded-xl border border-ink-100 dark:border-ink-200">
          <FeedContractCard contract={contract} showGraph={true} />
        </div>

        {/* Description */}
        <p className="text-ink-600 text-sm leading-relaxed">
          {description}
        </p>
      </div>
    </div>
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

  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number } | null>(null)

  return (
    <SVGChart
      w={width}
      h={height}
      xAxis={xAxis}
      yAxis={yAxis}
      ttParams={hoveredPoint ? { x: px(hoveredPoint), y: py(hoveredPoint), point: hoveredPoint } : undefined}
      Tooltip={({ point }) => (
        <div className="text-ink-900 text-sm">
          <div className="mb-1 text-xs text-ink-500 uppercase tracking-wide">Calibration Point</div>
          <div className="font-semibold">
            Predicted: {formatPct(point.x)}
          </div>
          <div className="font-semibold">
            Actual: {formatPct(point.y)}
          </div>
        </div>
      )}
    >
      {/* Grid pattern */}
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path
            d="M 40 0 L 0 0 0 40"
            fill="none"
            className="stroke-ink-100 dark:stroke-ink-200"
            strokeWidth="0.5"
          />
        </pattern>
      </defs>
      <rect width={width} height={height} fill="url(#grid)" className="opacity-50" />

      {/* Perfect calibration diagonal */}
      <line
        x1={xScale(0)}
        y1={yScale(0)}
        x2={xScale(1)}
        y2={yScale(1)}
        className="stroke-ink-300 dark:stroke-ink-400"
        strokeWidth={1}
        strokeDasharray="6 4"
      />

      {/* Confidence band around diagonal */}
      <path
        d={`M ${xScale(0)} ${yScale(0.05)} 
            L ${xScale(0.95)} ${yScale(1)} 
            L ${xScale(1)} ${yScale(1)} 
            L ${xScale(1)} ${yScale(0.95)} 
            L ${xScale(0.05)} ${yScale(0)} 
            L ${xScale(0)} ${yScale(0)} 
            Z`}
        className="fill-primary-100/50 dark:fill-primary-900/30"
      />

      {/* Connecting line between points */}
      <path
        d={`M ${points.map((p) => `${px(p)} ${py(p)}`).join(' L ')}`}
        fill="none"
        className="stroke-primary-400"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Data points */}
      {points.map((p, i) => (
        <g key={i}>
          {/* Glow effect */}
          <circle
            cx={px(p)}
            cy={py(p)}
            r={hoveredPoint === p ? 16 : 0}
            className="fill-primary-400/20 transition-all duration-200"
          />
          {/* Main point */}
          <circle
            cx={px(p)}
            cy={py(p)}
            r={hoveredPoint === p ? 8 : 6}
            className={clsx(
              'cursor-pointer transition-all duration-200',
              'fill-primary-500 stroke-canvas-0',
              'hover:fill-primary-400'
            )}
            strokeWidth={2}
            onMouseEnter={() => setHoveredPoint(p)}
            onMouseLeave={() => setHoveredPoint(null)}
          />
        </g>
      ))}
    </SVGChart>
  )
}

export function WasabiCharts() {
  return (
    <div className="text-ink-600 mt-8">
      See more{' '}
      <a
        className="text-primary-700 hover:underline"
        target="_blank"
        href="https://wasabipesto.com/manifold/markets/"
      >
        charts
      </a>{' '}
      courtesy of <Linkify text="@wasabipesto" /> from our data in 2022.
    </div>
  )
}
