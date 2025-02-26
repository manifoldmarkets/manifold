/* eslint-disable jsx-a11y/alt-text */
import { OgCardProps } from 'common/contract-seo'
import clsx from 'clsx'
import { ProbGraph } from './graph'
import { base64toFloat32Points, Point } from 'common/edge/og'
import Logo from 'web/public/logo.svg'

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
  const probabilityAsFloat = probability
    ? parseFloat(probability.replace('%', ''))
    : undefined
  const data = points ? (base64toFloat32Points(points) as Point[]) : []
  const numTraders = Number(props.numTraders ?? 0)
  const showGraph = data && data.length > 5

  return (
    <div
      className="relative flex h-full w-full flex-col items-stretch bg-indigo-700"
      style={{
        backgroundImage: 'linear-gradient(to bottom, #4338ca, #818cf8)',
      }}
    >
      {/* Manifold logo */}
      <div className="mx-auto flex items-center">
        <Logo stroke="#ffffff" width={48} height={48} />

        <span
          className="ml-0.5 text-3xl font-thin uppercase text-white"
          style={{ fontFamily: 'var(--font-main), Figtree-light' }}
        >
          Manifold
        </span>
      </div>
      <div className="m-4 mt-1 flex flex-col rounded-lg bg-white px-6 py-4 text-black shadow-lg">
        {/* Details */}
        <div className="mb-1 flex w-full flex-row justify-between text-sm text-gray-600">
          <div className="flex items-center">
            {/* Profile image */}
            {creatorAvatarUrl && (
              <img
                className="mr-1 h-5 w-5 rounded-full bg-white"
                src={creatorAvatarUrl}
              />
            )}
            <span>{creatorName}</span>
          </div>
          {!!numTraders && (
            <div className={'flex items-center'}>
              <svg
                className="mr-0.5 h-4 w-4 text-gray-500"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z"
                  clipRule="evenodd"
                />
              </svg>

              {numTraders.toLocaleString('en-US')}
            </div>
          )}
        </div>
        <div
          className={clsx(
            'flex max-h-[90px] overflow-hidden text-2xl leading-tight text-black'
          )}
        >
          {question}
        </div>
        {topAnswer ? (
          <Answer {...props} /> // TODO: more answers
        ) : showGraph ? (
          <div className="flex w-full shrink justify-center">
            <ProbGraph
              color={numericValue ? '#14bbFF' : '#14b8a6'}
              data={data}
              // height={80 + 32}
              // aspectRatio={5.07}
              height={80}
              aspectRatio={7.1}
            />
          </div>
        ) : bountyLeft ? (
          <BountyLeft bountyLeft={bountyLeft} />
        ) : (
          <div className="flex h-8" />
        )}
        {!topAnswer && (probability || numericValue || resolution) && (
          <div className="flex w-full flex-row justify-center text-2xl text-white">
            {probabilityAsFloat && !resolution ? (
              <>
                <div
                  className={
                    'mr-4 flex h-12 w-1/2 items-center justify-center rounded-lg bg-teal-500'
                  }
                >
                  Yes {probabilityAsFloat.toFixed(0)}%
                </div>
                <div
                  className={
                    'flex h-12 w-1/2 items-center justify-center rounded-lg bg-red-500'
                  }
                >
                  No {(100 - probabilityAsFloat).toFixed(0)}%
                </div>
              </>
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
      </div>
    </div>
  )
}

function Answer(props: OgCardProps) {
  const { probability, topAnswer, resolution } = props
  const probabilityAsFloat = probability
    ? parseFloat(probability.replace('%', ''))
    : 0

  return (
    <div
      className="my-auto mt-8 flex w-full flex-row items-center justify-between rounded px-4 py-2 text-xl text-black"
      style={{
        backgroundImage: `linear-gradient(to right, #e0e7ff ${probabilityAsFloat}%, #f3f4f6 ${probabilityAsFloat}%)`,
      }}
    >
      {/*  overflow-hidden */}
      <span className="max-h-7 overflow-hidden">{topAnswer}</span>
      {probability && (
        <div className="my-auto flex font-semibold">
          <span
            className={clsx(
              !!resolution && 'mr-1 font-normal text-gray-500 line-through'
            )}
          >
            {probability}
          </span>
          {!!resolution && <span>100%</span>}
        </div>
      )}
    </div>
  )
}

function EndValue(props: { value: string; label: string }) {
  return (
    <div className="z-20 flex flex-col items-center justify-center">
      <span className="text-3xl">{props.value}</span>
      <span className="text-xl">{props.label}</span>
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
    YES: 'bg-teal-500',
    NO: 'bg-red-600',
    MKT: 'bg-blue-500',
    CANCEL: 'bg-amber-400',
  }[resolution]

  return (
    <div
      className={`flex min-w-[15rem] flex-col rounded-lg px-12 py-2 text-white ${color} items-center justify-center`}
    >
      <span className="text-2xl">{text}</span>
    </div>
  )
}

function BountyLeft(props: { bountyLeft: string }) {
  const { bountyLeft } = props
  return (
    <div className="mx-auto flex flex-col text-center text-6xl text-gray-700">
      <span className="mx-auto flex flex-row">M{bountyLeft}</span>
      <span className="mx-auto text-xl text-gray-600">bounty</span>
    </div>
  )
}
