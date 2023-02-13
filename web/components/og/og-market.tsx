import { OgCardProps } from 'common/contract-details'
import clsx from 'clsx'
import { Sparkline, ogPoint } from './graph'
import { base64toPoints } from 'common/edge/og'

// Notes for working with this:
// - Some css elements are missing or broken (e.g. 'gap' and 'text-ellipsis' and 'line-clamp')
// - I also can't make things overflow hidden in only one direction
// - Every element should have `flex` set
export function OgMarket(props: OgCardProps) {
  const {
    question,
    numTraders,
    volume,
    creatorName,
    creatorAvatarUrl,
    numericValue,
    resolution,
    topAnswer,
    points,
  } = props
  const data = points ? (base64toPoints(points) as ogPoint[]) : []

  return (
    <div className="flex h-full w-full flex-col justify-between bg-white py-8">
      <div
        className={clsx(
          'flex overflow-hidden px-24 text-5xl leading-tight text-indigo-700',
          topAnswer ? 'max-h-56' : 'max-h-[20rem]'
        )}
      >
        {question}
      </div>
      <div className="relative flex w-full flex-row justify-center">
        {data.length ? (
          <>
            {TimeProb({ date: data[0].x, prob: data[0].y })}
            <Sparkline
              data={data}
              height={300}
              aspectRatio={2.5}
              min={0}
              max={1}
            />
            {resolution
              ? ResolutionDiv(props)
              : TimeProb({
                  date: data[data.length - 1].x,
                  prob: data[data.length - 1].y,
                })}
          </>
        ) : (
          <div className="flex w-full flex-row items-center justify-end px-24">
            {resolution && !topAnswer
              ? ResolutionDiv(props)
              : numericValue
              ? NumericValueDiv(props)
              : topAnswer
              ? AnswerDiv(props)
              : null}
          </div>
        )}
      </div>

      {/* Bottom row */}
      <div className="flex w-full flex-row items-center justify-between self-stretch px-24 text-3xl text-gray-600">
        {/* Details */}
        <div className="flex items-center">
          <div className="mr-6 flex items-center">
            {/* Profile image */}
            {creatorAvatarUrl && (
              <img
                className="mr-2 h-12 w-12 rounded-full bg-white"
                src={creatorAvatarUrl}
              />
            )}
            <span>{creatorName}</span>
          </div>

          <span className="mr-6">$M{volume} bet</span>

          <span className="mr-6">{numTraders} traders</span>
        </div>

        {/* Manifold logo */}
        <div className="flex items-center">
          <img
            className="mr-3 h-12 w-12"
            src="https://manifold.markets/logo.svg"
            width="40"
            height="40"
          />
          <span
            className="text-4xl lowercase"
            style={{ fontFamily: 'Major Mono Display' }}
          >
            Manifold
          </span>
        </div>
      </div>
    </div>
  )
}

function AnswerDiv(props: OgCardProps) {
  const { probability, topAnswer, resolution } = props
  return (
    <>
      <div className="flex max-h-[9rem] w-full justify-start overflow-hidden pr-8 text-5xl">
        {topAnswer}
      </div>
      {!resolution && (
        <div className="flex flex-col">
          <div className="flex text-6xl">{probability}</div>
          <div className="flex w-full justify-center text-4xl">chance</div>
        </div>
      )}
    </>
  )
}

function NumericValueDiv(props: OgCardProps) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-6xl">{props.numericValue}</span>
      <span className="text-4xl">expected</span>
    </div>
  )
}

function ResolutionDiv(props: OgCardProps) {
  const { resolution, probability, numericValue } = props
  if (!resolution) {
    return <div className={'hidden'} />
  }
  const text = {
    YES: 'YES',
    NO: 'NO',
    MKT: probability ?? numericValue ?? 'MANY',
    CANCEL: 'N/A',
  }[resolution]

  const color = {
    YES: 'text-teal-500',
    NO: 'text-red-500',
    MKT: 'text-blue-500',
    CANCEL: 'text-yellow-500',
  }[resolution]

  return (
    <div className={`flex flex-col ${color} items-center`}>
      <span className="text-4xl">resolved</span>
      <span className="text-6xl">{text}</span>
    </div>
  )
}

function TimeProb(props: { date: number; prob: number }) {
  const { date, prob } = props

  return (
    <div className="flex w-32">
      <div
        className="absolute flex flex-col items-center"
        style={{ top: `${(1 - prob) * 100 - 20}%` }}
      >
        <span className="text-6xl">{formatPercent(prob)}</span>
        <span className="text-2xl">{dateFormat(date)}</span>
      </div>
    </div>
  )
}

const dateFormat = Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
}).format

// copied from format.ts
export function formatPercent(zeroToOne: number) {
  // Show 1 decimal place if <2% or >98%, giving more resolution on the tails
  const decimalPlaces = zeroToOne < 0.02 || zeroToOne > 0.98 ? 1 : 0
  const percent = zeroToOne * 100
  return percent.toFixed(decimalPlaces) + '%'
}
