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
import { SiteLink } from 'web/components/widgets/site-link'
import { Spacer } from 'web/components/layout/spacer'
import { SizedContainer } from 'web/components/sized-container'
import { db } from 'web/lib/supabase/db'

const TRADER_THRESHOLD = 15
const SAMPLING_P = 0.02

export const getStaticProps = async () => {
  const result = await db
    .from('platform_calibration')
    .select('*')
    .order('created_time', { ascending: false })
    .limit(1)

  const { points, score, n } = result.data![0]?.data as any

  return {
    props: {
      points,
      score,
      n,
    },
    revalidate: 60 * 60, // Regenerate after an hour
  }
}

export default function CalibrationPage(props: {
  points: { x: number; y: number }[]
  score: number
  n: number
}) {
  const { points, score, n } = props

  return (
    <Page>
      <SEO
        title={`Platform calibration`}
        description="Manifold's overall track record"
      />
      <Col className="w-full rounded px-4 py-6 sm:px-8 xl:w-[125%]">
        <Col className="max-w-[800px]">
          <Title>Platform calibration</Title>

          <div className="mb-4">Manifold's overall track record.</div>

          <div className="bg-canvas-0 relative w-full max-w-[600px] self-center rounded-md p-4 pr-12">
            <div className="absolute top-0 bottom-0 right-4 flex items-center">
              <span className="text-ink-800 text-sm [writing-mode:vertical-rl]">
                Resolution probability
              </span>
            </div>

            <SizedContainer className="aspect-square w-full pr-8 pb-8">
              {(w, h) => (
                <CalibrationChart points={points} width={w} height={h} />
              )}
            </SizedContainer>
            <div className="text-ink-800 text-center text-sm">
              Question probability
            </div>
          </div>

          <div className="prose prose-sm text-ink-600 my-4 max-w-[800px]">
            <b>Interpretation</b>
            <ul>
              <li>
                The chart shows the probability of a binary question resolving
                to YES given that the question is currently displaying a
                probability of x%. Perfect calibration would result in all
                points being on the line.
              </li>

              <li>
                Methodology: {formatPct(SAMPLING_P)} of all past bets in public
                resolved binary questions with {TRADER_THRESHOLD} or more
                traders are sampled to get the average probability before and
                after the bet. This probability is then bucketed and used to
                compute the proportion of questions that resolve YES. Sample
                size: {formatLargeNumber(n)} bets. Updates every hour.
              </li>

              <li>
                This methodology uses trade-weighted rather than time-weighted
                calibration, which may <i>significantly undercount</i> overall
                calibration, given that users who place large miscalibrated bets
                are more likely to be corrected immediately.
              </li>

              <li>
                <InfoTooltip text="Mean squared error of forecasted probability compared to the true outcome.">
                  Brier score
                </InfoTooltip>
                : {Math.round(score * 1e5) / 1e5}
              </li>
            </ul>
          </div>

          <WasabiCharts />
        </Col>
      </Col>
    </Page>
  )
}

type Point = { x: number; y: number }

export function CalibrationChart(props: {
  points: Point[]
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

  const px = (p: Point) => xScale(p.x)
  const py = (p: Point) => yScale(p.y)

  const [tooltip, setTooltip] = useState<Point | null>(null)

  return (
    <SVGChart w={width} h={height} xAxis={xAxis} yAxis={yAxis}>
      {/* points */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={px(p)}
          cy={py(p)}
          r={10}
          fill="indigo"
          onMouseEnter={() => setTooltip(p)}
          onMouseLeave={() => setTooltip(null)}
          style={{ cursor: 'pointer' }}
        />
      ))}
      {/* tooltip */}
      {tooltip && (
        <>
          {tooltip.x > 0.9 ? (
            <>
              <rect
                x={px(tooltip) - 110}
                y={py(tooltip) - 10}
                width={100}
                height={20}
                fill="white"
                style={{ zIndex: 100 }}
              />
              <text
                x={px(tooltip) - 60}
                y={py(tooltip) + 5}
                textAnchor="middle"
                style={{ fill: 'blue', zIndex: 100 }}
              >
                ({formatPct(tooltip.x)}, {formatPct(tooltip.y)})
              </text>
            </>
          ) : (
            <>
              <rect
                x={px(tooltip) - 30}
                y={py(tooltip) - 25}
                width={100}
                height={20}
                fill="white"
                style={{ zIndex: 100 }}
              />
              <text
                x={px(tooltip)}
                y={py(tooltip) - 10}
                textAnchor="bottom"
                style={{ fill: 'blue', zIndex: 100 }}
              >
                ({formatPct(tooltip.x)}, {formatPct(tooltip.y)})
              </text>
            </>
          )}
        </>
      )}
      {/* line x = y */}
      <line
        x1={xScale(0)}
        y1={yScale(0)}
        x2={xScale(1)}
        y2={yScale(1)}
        stroke="rgb(99 102 241)"
        strokeWidth={1}
        strokeDasharray="4 8"
      />
    </SVGChart>
  )
}

export function WasabiCharts() {
  return (
    <>
      <p className="text-ink-500 mt-8">
        More charts courtesy of <Linkify text="@wasabipesto" />; originally
        found{' '}
        <SiteLink
          className="font-bold"
          href="https://wasabipesto.com/manifold/markets/"
        >
          here.
        </SiteLink>
      </p>
      <Spacer h={4} />
      <iframe
        className="w-full border-0"
        height={3750}
        src="https://wasabipesto.com/manifold/markets/"
        frameBorder="0"
        allowFullScreen
      />
    </>
  )
}
