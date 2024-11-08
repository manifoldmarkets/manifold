/* eslint-disable jsx-a11y/alt-text */
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
  const probabilityAsFloat = probability
    ? parseFloat(probability.replace('%', ''))
    : undefined
  const data = points ? (base64toPoints(points) as Point[]) : []
  const numTraders = Number(props.numTraders ?? 0)
  const showGraph = data && data.length > 5

  return (
    <div className="relative flex h-full w-full flex-col items-stretch bg-gradient-to-b from-indigo-700 to-indigo-400">
      {/* Manifold logo */}
      <div className="mx-auto flex items-center gap-0.5">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          strokeWidth=".6"
        >
          <path
            d="M5.24854 17.0952L18.7175 6.80301L14.3444 20M5.24854 17.0952L9.79649 18.5476M5.24854 17.0952L4.27398 6.52755M14.3444 20L9.79649 18.5476M14.3444 20L22 12.638L16.3935 13.8147M9.79649 18.5476L12.3953 15.0668M4.27398 6.52755L10.0714 13.389M4.27398 6.52755L2 9.0818L4.47389 8.85643M12.9451 11.1603L10.971 5L8.65369 11.6611"
            stroke="#ffffff"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <span
          className="text-3xl font-thin uppercase text-white"
          style={{ fontFamily: 'var(--font-main), Figtree-light' }}
        >
          Manifold
        </span>
      </div>
      <div className="m-4 mt-1 flex h-full flex-col rounded-lg bg-white px-6 py-4 text-black shadow-lg">
        {/* Details */}
        <div className="mb-1 flex w-full flex-row justify-between text-gray-600">
          <div className="flex items-center">
            {/* Profile image */}
            {creatorAvatarUrl && (
              <img
                className="mr-1 h-6 w-6 rounded-full bg-white"
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
            'flex max-h-[6rem] overflow-hidden text-2xl leading-tight text-black'
          )}
        >
          {question}
        </div>
        {topAnswer ? (
          <div className="flex w-full flex-1">
            <div className="my-auto w-full">
              <Answer {...props} />
            </div>
          </div>
        ) : showGraph ? (
          <div className="-mx-6 flex w-[calc(100%+48px)] justify-center">
            <ProbGraph
              color={numericValue ? '#14bbFF' : '#14b8a6'}
              data={data}
              height={120}
              aspectRatio={5}
            />
          </div>
        ) : bountyLeft ? (
          <div className="flex w-full flex-1">
            <div className="my-auto w-full">
              <BountyLeft bountyLeft={bountyLeft} />
            </div>
          </div>
        ) : null}
        {!topAnswer && (probability || numericValue || resolution) && (
          <div
            className={
              'absolute left-0 right-0 flex w-full justify-center ' +
              (showGraph ? 'top-[13rem]' : 'top-[12rem]')
            }
          >
            {probabilityAsFloat && !resolution ? (
              <div className="mt-8 flex w-full flex-row justify-center gap-4 text-2xl text-white">
                <div
                  className={
                    'flex h-12 w-[calc(50%-3rem)] items-center justify-center rounded-lg bg-teal-500'
                  }
                >
                  Yes {probabilityAsFloat.toFixed(0)}%
                </div>
                <div
                  className={
                    'flex h-12 w-[calc(50%-3rem)] items-center justify-center rounded-lg bg-red-500 dark:bg-red-400'
                  }
                >
                  No {(100 - probabilityAsFloat).toFixed(0)}%
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
      </div>
    </div>
  )
}

function Answer(props: OgCardProps) {
  const { probability, topAnswer, resolution } = props
  const probabilityAsFloat = probability
    ? parseFloat(probability.replace('%', ''))
    : undefined

  return (
    <>
      <div className="relative my-auto mt-2 flex w-full flex-row justify-between overflow-hidden rounded bg-gray-100 px-4 py-2 text-xl text-black">
        <span className="relative z-10 max-h-[3.5rem] overflow-hidden">
          {topAnswer}
        </span>
        {probability && (
          <div className="relative z-10 my-auto font-semibold">
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
        <div
          className="absolute bottom-0 left-0 top-0 bg-indigo-200"
          style={{
            right: `${100 - (probabilityAsFloat ?? 0)}%`,
          }}
        />
      </div>
    </>
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
      className={`mt-8 flex min-w-[15rem] flex-col rounded-lg px-12 py-2 text-white ${color} items-center justify-center`}
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
