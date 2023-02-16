import { OgCardProps } from 'common/contract-details'
import clsx from 'clsx'
import { Sparkline } from './graph'
import { base64toPoints, Point } from 'common/edge/og'

// See https://github.com/vercel/satori#documentation for styling restrictions
export function OgMarket(props: OgCardProps) {
  const {
    question,
    numTraders,
    volume,
    creatorName,
    creatorAvatarUrl,
    probability,
    numericValue,
    resolution,
    topAnswer,
    points,
  } = props
  const data = points ? (base64toPoints(points) as Point[]) : []

  return (
    <div className="flex h-full w-full flex-col items-stretch justify-between bg-white py-8">
      <div
        className={clsx(
          'flex overflow-hidden px-24 text-5xl leading-tight text-indigo-700',
          topAnswer ? 'max-h-56' : 'max-h-[20rem]'
        )}
      >
        {question}
      </div>
      {data.length ? (
        <div className="flex w-full pr-24">
          <Sparkline
            data={data}
            height={300}
            aspectRatio={3.2}
            min={0}
            max={1}
            className="mr-4"
          />
          {resolution ? (
            <Resolution
              resolution={resolution}
              label={probability ?? numericValue}
            />
          ) : (
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            <TimeProb date={data.at(-1)!.x} prob={data.at(-1)!.y} />
          )}
        </div>
      ) : topAnswer ? (
        <div className="flex w-full flex-row items-center justify-between px-24">
          <Answer {...props} />
        </div>
      ) : (
        <div className="flex w-full flex-row items-center justify-end px-24">
          {resolution && !topAnswer ? (
            <Resolution
              resolution={resolution}
              label={probability ?? numericValue}
            />
          ) : numericValue ? (
            <NumericValue number={numericValue} />
          ) : null}
        </div>
      )}

      {/* Bottom row */}
      <div className="flex w-full flex-row items-center justify-between px-24 text-3xl text-gray-600">
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

function Answer(props: OgCardProps) {
  const { probability, topAnswer, resolution } = props
  return (
    <>
      <span className="max-h-[9rem] w-[880px] overflow-hidden text-5xl">
        {topAnswer}
      </span>
      {!resolution && (
        <div className="flex flex-col items-center">
          <span className="text-6xl">{probability}</span>
          <span className="text-4xl">chance</span>
        </div>
      )}
    </>
  )
}

function NumericValue(props: { number: string }) {
  return (
    <div className="flex flex-col items-center justify-center">
      <span className="text-6xl">{props.number}</span>
      <span className="text-4xl">expected</span>
    </div>
  )
}

function Resolution(props: { resolution: string; label?: string }) {
  const { resolution, label } = props

  const text = {
    YES: 'YES',
    NO: 'NO',
    MKT: label ?? 'MANY',
    CANCEL: 'N/A',
  }[resolution]

  const color = {
    YES: 'text-teal-500',
    NO: 'text-red-500',
    MKT: 'text-blue-500',
    CANCEL: 'text-yellow-500',
  }[resolution]

  return (
    <div className={`flex flex-col ${color} items-center justify-center`}>
      <span className="text-4xl">resolved</span>
      <span className="text-6xl">{text}</span>
    </div>
  )
}

function TimeProb(props: { date: number; prob: number }) {
  const { date, prob } = props

  return (
    <div className="relative flex w-32">
      <div
        className="absolute right-0 flex flex-col items-center"
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
