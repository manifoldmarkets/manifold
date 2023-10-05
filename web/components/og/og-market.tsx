import { OgCardProps } from 'common/contract-seo'
import clsx from 'clsx'
import { ProbGraph } from './graph'
import { base64toPoints, Point } from 'common/edge/og'

// See https://github.com/vercel/satori#documentation for styling restrictions
export function OgMarket(props: OgCardProps) {
  const {
    question,
    creatorName,
    creatorAvatarUrl,
    probability,
    numericValue,
    resolution,
    topAnswer,
    points,
    bountyLeft,
  } = props

  const data = points ? (base64toPoints(points) as Point[]) : []
  const numTraders = Number(props.numTraders ?? 0)

  const showGraph = data && data.length > 5

  return (
    <div className="relative flex h-full w-full flex-col items-stretch justify-between bg-white pt-8">
      <div
        className={clsx(
          'flex overflow-hidden px-16 leading-tight text-indigo-700',
          showGraph ? 'h-[190px]  text-5xl' : 'h-[300px]  text-6xl'
        )}
      >
        {question}
      </div>
      {topAnswer ? (
        <div className="flex w-full flex-row items-center justify-between px-16">
          <Answer {...props} />
        </div>
      ) : showGraph ? (
        <div className=" flex w-full justify-center">
          <ProbGraph
            color={numericValue ? '#14bbFF' : undefined}
            data={data}
            height={250}
            aspectRatio={5}
          />
        </div>
      ) : bountyLeft ? (
        <BountyLeft bountyLeft={bountyLeft} />
      ) : null}
      {!topAnswer && (probability || numericValue || resolution) && (
        <div
          className={
            'absolute flex h-fit w-full justify-center ' +
            (showGraph ? 'top-[22rem]' : 'top-[23rem]')
          }
        >
          {probability && !resolution ? (
            <div className={'flex justify-center text-5xl text-white'}>
              <div
                className={
                  'mr-6 flex h-24 w-2/5 items-center justify-center rounded-md bg-green-500 pt-2'
                }
              >
                Yes {((data[data.length - 1]?.y ?? 0.5) * 100).toFixed(0)}%
              </div>
              <div
                className={
                  'ml-6 flex h-24 w-2/5 items-center justify-center rounded-md bg-red-600 pt-2'
                }
              >
                No {((1 - (data[data.length - 1]?.y ?? 0.5)) * 100).toFixed(0)}%
              </div>
            </div>
          ) : resolution ? (
            <Resolution
              resolution={resolution}
              label={numericValue ?? probability}
            />
          ) : numericValue ? (
            <EndValue value={numericValue} label="expected" />
          ) : probability ? (
            <EndValue value={probability} label="chance" />
          ) : null}
        </div>
      )}

      {/* Bottom row */}
      <div className="flex w-full flex-row items-center justify-between px-8 text-3xl text-gray-600">
        {/* Details */}
        <div className="flex pt-4">
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

          {!!numTraders && (
            <div className={'flex items-center'}>
              {numTraders.toLocaleString('en-US')} traders
            </div>
          )}
        </div>

        {/* Manifold logo */}
        <div className="flex items-center pb-2">
          <img
            className="mr-3 h-28 w-28"
            src="https://manifold.markets/logo.svg"
            width="60"
            height="60"
          />
          <span
            className="text-6xl lowercase"
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
      {!resolution && probability && (
        <EndValue value={probability} label="chance" />
      )}
    </>
  )
}

function EndValue(props: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center">
      <span className="text-6xl">{props.value}</span>
      <span className="text-4xl">{props.label}</span>
    </div>
  )
}

function Resolution(props: { resolution: string; label?: string }) {
  const { resolution, label } = props

  const text = {
    YES: 'Yes',
    NO: 'No',
    MKT: label ?? 'Many',
    CANCEL: 'Canceled',
  }[resolution]

  const color = {
    YES: 'bg-teal-600',
    NO: 'bg-red-600',
    MKT: 'bg-blue-500',
    CANCEL: 'bg-amber-400',
  }[resolution]

  return (
    <div
      className={`flex min-w-[30rem] flex-col rounded-lg px-24 pb-2 pt-4 text-white ${color} items-center justify-center`}
    >
      <span className="text-7xl">{text}</span>
    </div>
  )
}

function BountyLeft(props: { bountyLeft: string }) {
  const { bountyLeft } = props
  return (
    <div className="mx-auto flex flex-col text-center text-9xl">
      <div className="mx-auto flex flex-row text-teal-600">M{bountyLeft}</div>
      <span className="mx-auto text-5xl text-gray-600">bounty</span>
    </div>
  )
}
