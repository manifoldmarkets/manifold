import { OG_CARD_HEIGHT, OG_CARD_WIDTH } from 'common/edge/og'
import { formatSportsOgAsOf, SportsOgMarket } from 'common/sports-og'
import { readableTextColor } from 'common/sports-team-colors'
import Logo from 'web/public/logo.svg'
import { OgSportGraphic } from './og-sport-graphic'

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
          <div className="flex flex-col" style={{ width: 500 }}>
            <span
              className="flex text-gray-900"
              style={{ fontSize: 62, lineHeight: 1.1 }}
            >
              Know the game?
            </span>
            <span
              className="flex text-indigo-700"
              style={{ fontSize: 62, lineHeight: 1.1 }}
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
                  style={{ padding: '8px 12px', fontSize: 18 }}
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
  const teams = market.outcomes.slice(0, 2)
  const draw = market.outcomes[2]
  const colors = teams.map((team, i) => team.color ?? ['#4f46e5', '#0f766e'][i])
  const when = market.startTime
    ? new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC',
        month: 'short',
        day: 'numeric',
        ...(market.kickoffKnown
          ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' as const }
          : {}),
      }).format(new Date(market.startTime)) +
      (market.kickoffKnown ? ' UTC' : '')
    : shorten(market.question.replace(/\s*\[official\]\s*$/i, ''), 48)
  return (
    <div
      className="relative flex shrink-0 flex-col overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-lg"
      style={{ width: 480 }}
    >
      <div
        className="relative flex flex-col"
        style={{
          padding: '18px 22px 20px',
          backgroundImage: `linear-gradient(to right, ${colors[0]}20, ${colors[1]}20)`,
        }}
      >
        <div
          className="absolute flex"
          style={{ left: 129, top: 65, opacity: 0.24 }}
        >
          <OgSportGraphic sport={market.sport} />
        </div>
        <div className="flex items-center justify-between">
          <span className="flex text-indigo-700" style={{ fontSize: 17 }}>
            Featured market
          </span>
          <span className="flex text-gray-600" style={{ fontSize: 17 }}>
            {shorten(market.league, 24)}
          </span>
        </div>
        <span
          className="mt-2 flex justify-center text-gray-600"
          style={{ fontSize: 17 }}
        >
          {when}
        </span>
        <div className="relative mt-4 flex" style={{ width: 434 }}>
          {teams.map((team, i) => (
            <div
              key={i}
              className="flex shrink-0 flex-col items-center"
              style={{ width: 196, marginLeft: i === 1 ? 42 : 0 }}
            >
              <div
                className="flex items-center justify-center rounded-2xl shadow-sm"
                style={{
                  width: 68,
                  height: 68,
                  backgroundColor: colors[i],
                  color: readableTextColor(colors[i]),
                }}
              >
                <span className="flex" style={{ fontSize: 25 }}>
                  {(team.shortName ?? team.name).slice(0, 3).toUpperCase()}
                </span>
              </div>
              <span
                className="mt-3 flex items-center justify-center overflow-hidden text-center text-gray-900"
                style={{ fontSize: 23, lineHeight: 1.15, height: 54 }}
              >
                {shorten(team.name, 30)}
              </span>
              <span
                className="mt-3 flex items-center justify-center rounded-xl"
                style={{
                  width: 132,
                  height: 54,
                  fontSize: 36,
                  backgroundColor: colors[i],
                  color: readableTextColor(colors[i]),
                }}
              >{`${Math.round(team.prob * 100)}%`}</span>
            </div>
          ))}
          <span
            className="absolute flex text-gray-500"
            style={{ left: 206, top: 79, fontSize: 16 }}
          >
            vs
          </span>
          {draw && (
            <div
              className="absolute flex flex-col items-center text-gray-600"
              style={{
                left: 184,
                bottom: 0,
                width: 66,
                height: 54,
                fontSize: 14,
              }}
            >
              <span className="flex">Draw</span>
              <span
                className="mt-1 flex"
                style={{ fontSize: 23 }}
              >{`${Math.round(draw.prob * 100)}%`}</span>
            </div>
          )}
        </div>
      </div>
      <div className="flex h-2 overflow-hidden">
        {market.outcomes.map((team, i) => (
          <div
            key={i}
            className="flex h-full"
            style={{
              width: `${team.prob * 100}%`,
              backgroundColor: i === 2 ? '#9ca3af' : colors[i],
            }}
          />
        ))}
      </div>
      <span
        className="flex justify-center py-3 text-gray-500"
        style={{ fontSize: 15 }}
      >
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
