import { resolution } from 'common/contract'

export default function MarketPage() {
  // This endpoint is just used to debug the html for the og card
  // found at /api/og/market.tsx
  return OgMarket({ question: 'My default question?' })
}

// Ideally, these would live in /api/og/market.tsx, but when I tried that
// the import breaks for unknown reasons
export type OgMarketProps = {
  question: string
  creatorName?: string
  creatorAvatarUrl?: string
  creatorUsername?: string
  metadata?: string
  probability?: string
  resolution?: resolution
}

// Notes for working with this:
// - Some css elements are missing or broken (e.g. 'gap')
// - Every element should have `flex` set
export function OgMarket(props: OgMarketProps) {
  return (
    <div className="flex h-full w-full flex-col bg-white px-24">
      {/* <!-- Profile image --> */}
      <div className="absolute left-24 top-8 flex flex-row ">
        <img
          className="mr-6 flex h-24 w-24 items-center justify-center rounded-full bg-white"
          // Fill in with a placeholder image if missing
          src={props.creatorAvatarUrl ?? 'https://via.placeholder.com/150.png'}
          alt=""
        />
        <div className="mt-3 flex flex-col">
          <div className="flex text-3xl text-gray-900">{props.creatorName}</div>
          <div className="flex text-3xl text-gray-500">
            @{props.creatorUsername}
          </div>
        </div>
      </div>

      {/* <!-- Manifold logo --> */}
      <div className="absolute right-24 top-8 flex">
        <a className="flex flex-row" href="/">
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
        </a>
      </div>

      <div className="flex max-h-40 w-full flex-row justify-between pt-36">
        <div className="mr-12 flex text-6xl leading-tight text-indigo-700">
          {props.question.slice(0, 100)}
        </div>
        {props.resolution ? ResolutionDiv(props) : ProbabilityDiv(props)}
      </div>

      {/* <!-- Metadata --> */}
      <div className="absolute bottom-16 left-24 flex">
        <div className="flex max-w-[80vw] bg-white text-3xl text-gray-500">
          {props.metadata}
        </div>
      </div>
    </div>
  )
}

function ProbabilityDiv(props: OgMarketProps) {
  return (
    <div className="flex flex-col text-teal-500">
      <div className="flex text-8xl">{props.probability}</div>
      <div className="flex text-4xl">chance</div>
    </div>
  )
}

function ResolutionDiv(props: OgMarketProps) {
  const { resolution, probability } = props
  if (!resolution) {
    return <div></div>
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
