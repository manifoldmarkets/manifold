import { OgCardProps } from 'common/contract-details'
import clsx from 'clsx'

export default function MarketPage() {
  // This endpoint is just used to debug the html for the og card
  // found at /api/og/market.tsx
  return OgMarket({
    question: 'My default question?',
    creatorName: 'ian',
    creatorUsername: 'ian',
    metadata: '#cool',
  })
}

// Notes for working with this:
// - Some css elements are missing or broken (e.g. 'gap' and 'text-ellipsis' and 'line-clamp')
// - I also can't make things overflow hidden in only one direction
// - Every element should have `flex` set
//   - Empty elements can be set to 'hidden'
// - You can't use real react components with proper props, only constants
export function OgMarket(props: OgCardProps) {
  const {
    question,
    creatorName,
    creatorAvatarUrl,
    creatorUsername,
    metadata,
    numericValue,
    resolution,
    topAnswer,
    probability,
  } = props

  return (
    <div className="flex h-full w-full flex-col bg-white px-24">
      {/* <!-- Profile image --> */}
      <div className="absolute left-24 top-8 flex flex-row ">
        <img
          className="mr-6 flex h-24 w-24 items-center justify-center rounded-full bg-white"
          // Fill in with a placeholder image if missing
          src={creatorAvatarUrl ?? 'https://via.placeholder.com/150.png'}
          alt=""
        />
        <div className="mt-3 flex flex-col">
          <div className="flex text-3xl text-gray-900">{creatorName}</div>
          <div className="flex text-3xl text-gray-500">@{creatorUsername}</div>
        </div>
      </div>

      {/* <!-- Manifold logo --> */}
      <div className="absolute right-24 top-8 flex">
        <img
          className="mr-3 h-12 w-12"
          src="https:&#x2F;&#x2F;manifold.markets&#x2F;logo.svg"
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

      <div className="flex w-full flex-col pt-36">
        <div className="flex w-full flex-row justify-between">
          <div
            className={clsx(
              'flex  overflow-hidden text-6xl leading-tight text-indigo-700',
              topAnswer ? 'max-h-56 pr-8' : 'max-h-[20rem] pr-12'
            )}
          >
            {question}
          </div>
          {resolution && !topAnswer ? (
            ResolutionDiv(props)
          ) : numericValue ? (
            NumericValueDiv(props)
          ) : topAnswer || probability === undefined ? (
            <div className={'hidden'} />
          ) : (
            ProbabilityDiv(props)
          )}
        </div>
        {topAnswer ? AnswerDiv(props) : <div className={'hidden'} />}
      </div>
      {/* <!-- Metadata --> */}
      <div className="absolute bottom-12 left-24 flex">
        <div className="flex max-w-[80vw] bg-white text-3xl text-gray-500">
          {metadata}
        </div>
      </div>
    </div>
  )
}

function ProbabilityDiv(props: OgCardProps) {
  return (
    <div className="flex flex-col text-teal-500">
      <div className="flex flex-row text-8xl">{props.probability}</div>
      <div className="flex w-full flex-row justify-center text-4xl">chance</div>
    </div>
  )
}

function AnswerDiv(props: OgCardProps) {
  const { probability, topAnswer, resolution } = props
  return (
    <div className="mt-6 flex w-full flex-row items-center">
      <div className="flex max-h-[3.8rem] w-full justify-center overflow-hidden pr-4 text-6xl">
        {topAnswer}
      </div>
      {resolution ? (
        <div className={'hidden'} />
      ) : (
        <div className="flex flex-col text-teal-500">
          <div className="flex text-7xl">{probability}</div>
          <div className="flex w-full justify-center text-4xl">chance</div>
        </div>
      )}
    </div>
  )
}

function NumericValueDiv(props: OgCardProps) {
  return (
    <div className="flex flex-col text-blue-500">
      <div className="flex flex-row text-8xl">{props.numericValue}</div>
      <div className="flex w-full flex-row justify-center text-4xl">
        expected
      </div>
    </div>
  )
}

function ResolutionDiv(props: OgCardProps) {
  const { resolution, probability } = props
  if (!resolution) {
    return <div className={'hidden'} />
  }
  const text = {
    YES: 'YES',
    NO: 'NO',
    MKT: probability,
    CANCEL: 'N/A',
  }[resolution]
  const color = {
    YES: 'text-teal-500',
    NO: 'text-red-500',
    MKT: 'text-blue-500',
    CANCEL: 'text-yellow-500',
  }[resolution]

  return (
    <div className={`flex flex-col ${color} text-center`}>
      <div className="flex text-8xl">{text}</div>
      <div className="flex text-4xl">
        {resolution === 'CANCEL' ? '' : 'resolved'}
      </div>
    </div>
  )
}
