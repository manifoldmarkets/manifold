import { OgCardProps } from 'common/contract-details'
import clsx from 'clsx'
import { Sparkline, ogPoint } from './graph'
import { formatPercent } from 'common/util/format'

// Notes for working with this:
// - Some css elements are missing or broken (e.g. 'gap' and 'text-ellipsis' and 'line-clamp')
// - I also can't make things overflow hidden in only one direction
// - Every element should have `flex` set
export function OgMarket(props: OgCardProps) {
  const {
    question,
    creatorName,
    creatorAvatarUrl,
    numericValue,
    resolution,
    topAnswer,
    probability,
    points,
  } = props
  const data = JSON.parse(points) as ogPoint[]

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
      <div className="flex w-full flex-row justify-center self-stretch">
        {data.length ? (
          <>
            {TimeProb({ date: data[0].x, prob: data[0].y })}
            <Sparkline
              data={data}
              height={300}
              aspectRatio={3}
              min={0}
              max={1}
            />
            {TimeProb({
              date: data[data.length - 1].x,
              prob: data[data.length - 1].y,
            })}
          </>
        ) : null}

        {/* answer */}
        {resolution && !topAnswer
          ? ResolutionDiv(props)
          : numericValue
          ? NumericValueDiv(props)
          : topAnswer
          ? AnswerDiv(props)
          : // : probability != undefined
            // ? ProbabilityDiv(props)
            null}
      </div>

      {/* Bottom row */}
      <div className="flex flex-row items-center justify-between self-stretch px-24 text-2xl text-gray-600">
        <div className="flex">
          {/* Profile image */}
          {creatorAvatarUrl && (
            <img
              className="mr-4 h-8 w-8 rounded-full bg-white"
              src={creatorAvatarUrl}
            />
          )}
          <span>{creatorName}</span>
        </div>

        <span>$M69 bet</span>

        <span>420 traders</span>

        {/* Manifold logo */}
        <div className="flex">
          <img
            className="mr-3 h-12 w-12"
            src="https://manifold.markets/logo.svg"
            width="40"
            height="40"
          />
          <div
            className="mt-3 flex text-3xl lowercase"
            style={{ fontFamily: 'Major Mono Display' }}
          >
            Manifold Markets
          </div>
        </div>
      </div>
    </div>
  )
}

function AnswerDiv(props: OgCardProps) {
  const { probability, topAnswer, resolution } = props
  return (
    <div className="flex w-full flex-row items-center px-24">
      <div className="flex max-h-[3.8rem] w-full justify-start overflow-hidden pr-4 text-5xl">
        {topAnswer}
      </div>
      {!resolution && (
        <div className="flex flex-col">
          <div className="flex text-6xl">{probability}</div>
          <div className="flex w-full justify-center text-4xl">chance</div>
        </div>
      )}
    </div>
  )
}

function NumericValueDiv(props: OgCardProps) {
  return (
    <div className="flex flex-col">
      <div className="flex flex-row text-6xl">{props.numericValue}</div>
      <div className="flex w-full flex-row justify-center text-4xl">
        expected
      </div>
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
    <div className={`flex flex-col ${color}`}>
      <div className="flex w-full justify-center text-4xl">resolved</div>
      <div className="flex text-center text-6xl">{text}</div>
    </div>
  )
}

function TimeProb(props: { date: number; prob: number }) {
  const { date, prob } = props

  return (
    <div className="flex w-32">
      <div
        className="absolute flex h-full flex-col items-center"
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
