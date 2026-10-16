import { OG_CARD_HEIGHT, OG_CARD_WIDTH } from 'common/edge/og'
import { formatSportsOgAsOf, SportsOgMarket } from 'common/sports-og'
import Logo from 'web/public/logo.svg'

// The featured market is a dated snapshot; the artwork is the outage fallback.
export function OgSports({ market }: { market: SportsOgMarket | null }) {
  return (
    <div
      className="flex flex-col bg-indigo-700"
      style={{
        width: OG_CARD_WIDTH * 2,
        height: OG_CARD_HEIGHT * 2,
        fontFamily: 'Figtree',
        backgroundImage: 'linear-gradient(to bottom, #4338ca, #818cf8)',
      }}
    >
      <div
        className="flex shrink-0 items-center justify-center"
        style={{ height: 96 }}
      >
        <Logo stroke="white" width={96} height={96} />
        <span
          className="ml-1 flex uppercase text-white"
          style={{ fontSize: 60, fontFamily: 'Figtree-light' }}
        >
          Manifold
        </span>
      </div>

      <div
        className="flex flex-1 flex-col rounded-2xl bg-white shadow-lg"
        style={{ margin: '4px 32px 0', padding: '26px 48px 30px' }}
      >
        <div className="flex items-center justify-between">
          <span className="flex text-indigo-700" style={{ fontSize: 28 }}>
            Sports
          </span>
          <span className="flex text-gray-500" style={{ fontSize: 24 }}>
            manifold.markets/sports
          </span>
        </div>

        <div className="flex flex-1 items-center justify-between">
          <div className="flex flex-col" style={{ width: 570 }}>
            <span
              className="flex text-gray-900"
              style={{ fontSize: 68, lineHeight: 1.1 }}
            >
              Know the game?
            </span>
            <span
              className="flex text-indigo-700"
              style={{ fontSize: 68, lineHeight: 1.1 }}
            >
              Make the call.
            </span>
            <span className="mt-5 flex text-gray-500" style={{ fontSize: 28 }}>
              Trade with the crowd.
            </span>
            <div className="mt-8 flex" style={{ gap: 8 }}>
              {['NFL', 'NBA', 'MLB', 'NHL', 'Soccer', '+ more'].map((sport) => (
                <span
                  key={sport}
                  className="flex rounded-lg bg-indigo-50 text-indigo-700"
                  style={{ padding: '8px 14px', fontSize: 20 }}
                >
                  {sport}
                </span>
              ))}
            </div>
          </div>
          {market ? (
            <SportsMarketPreview market={market} />
          ) : (
            <div className="flex justify-center" style={{ width: 400 }}>
              <SportsIllustration width={304} height={256} />
            </div>
          )}
        </div>
      </div>

      <div
        className="flex shrink-0 items-center justify-between px-8 text-white"
        style={{ height: 68, fontSize: 26 }}
      >
        <span className="flex">Play-money prediction markets</span>
        <span className="flex">Free to play</span>
      </div>
    </div>
  )
}

const shorten = (text: string, length: number) =>
  text.length <= length ? text : text.slice(0, length - 1).trimEnd() + '…'

function SportsMarketPreview({ market }: { market: SportsOgMarket }) {
  const question = market.question.replace(/\s*\[official\]\s*$/i, '')
  const hasDraw = market.outcomes.length === 3
  return (
    <div
      className="flex shrink-0 flex-col rounded-2xl border border-indigo-200 bg-white shadow-lg"
      style={{ width: 400, padding: 22 }}
    >
      <div className="flex items-center justify-between">
        <span className="flex text-indigo-700" style={{ fontSize: 20 }}>
          Featured market
        </span>
        <span className="flex text-gray-500" style={{ fontSize: 18 }}>
          {shorten(market.league, 16)}
        </span>
      </div>
      <span
        className="my-4 flex overflow-hidden text-gray-900"
        style={{
          fontSize: hasDraw ? 24 : 26,
          lineHeight: 1.15,
          maxHeight: hasDraw ? 83 : 90,
        }}
      >
        {shorten(question, 78)}
      </span>
      <div className="flex flex-col" style={{ gap: 8 }}>
        {market.outcomes.map(({ name, prob }, index) => {
          const percent = Math.round(prob * 100)
          const color = ['#ccfbf1', '#e0e7ff', '#e5e7eb'][index]
          return (
            <div
              key={index}
              className="flex items-center justify-between rounded-lg text-gray-900"
              style={{
                padding: hasDraw ? '8px 14px' : '10px 14px',
                backgroundImage: `linear-gradient(to right, ${color} ${percent}%, #f3f4f6 ${percent}%)`,
              }}
            >
              <span
                className="flex overflow-hidden"
                style={{ fontSize: 20, lineHeight: 1.2, maxHeight: 24 }}
              >
                {shorten(name, 24)}
              </span>
              <span className="ml-2 flex shrink-0" style={{ fontSize: 22 }}>
                {`${percent}%`}
              </span>
            </div>
          )
        })}
      </div>
      <span className="mt-4 flex text-gray-500" style={{ fontSize: 16 }}>
        {`Odds as of ${formatSportsOgAsOf(market.asOf)}`}
      </span>
    </div>
  )
}

function SportsIllustration({
  width,
  height,
}: {
  width: number
  height: number
}) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 380 320"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="244" cy="113" r="94" fill="#fb923c" />
      <g stroke="#9a3412" strokeWidth="4">
        <circle cx="244" cy="113" r="94" />
        <path d="M150 113H338M244 19V207M178 46C266 82 266 144 178 180M310 46C222 82 222 144 310 180" />
      </g>
      <g transform="rotate(-32 115 220)">
        <path
          d="M10 220C58 126 172 126 220 220C172 314 58 314 10 220Z"
          fill="#a5b4fc"
          stroke="#312e81"
          strokeWidth="6"
        />
        <path d="M44 179V261M186 179V261" stroke="#eef2ff" strokeWidth="14" />
        <path
          d="M79 220H151M91 208V232M107 208V232M123 208V232M139 208V232"
          stroke="#312e81"
          strokeWidth="5"
          strokeLinecap="round"
        />
      </g>
      <circle
        cx="286"
        cy="252"
        r="58"
        fill="#eef2ff"
        stroke="#312e81"
        strokeWidth="6"
      />
      <path
        d="M253 206C285 227 285 277 253 298M319 206C287 227 287 277 319 298"
        stroke="#e11d48"
        strokeWidth="3"
      />
      <path
        d="M259 220L270 214M266 235L277 232M266 250H279M266 265L277 269M259 280L270 286M302 214L313 220M295 232L306 235M293 250H306M295 269L306 265M302 286L313 280"
        stroke="#e11d48"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}
