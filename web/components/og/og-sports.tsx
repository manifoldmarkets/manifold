import { OG_CARD_HEIGHT, OG_CARD_WIDTH } from 'common/edge/og'
import Logo from 'web/public/logo.svg'

// Evergreen artwork: shared links stay useful without stale fixtures or odds.
export function OgSports() {
  return (
    <div
      className="flex flex-col text-white"
      style={{
        width: OG_CARD_WIDTH * 2,
        height: OG_CARD_HEIGHT * 2,
        padding: '44px 60px 36px',
        fontFamily: 'Figtree',
        backgroundColor: '#1e1b4b',
        backgroundImage: 'linear-gradient(120deg, #0f172a, #312e81)',
      }}
    >
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center">
          <Logo className="mr-3 h-14 w-14" stroke="white" />
          <span
            className="flex uppercase"
            style={{ fontSize: 32, fontFamily: 'Figtree-light' }}
          >
            Manifold
          </span>
          <span
            className="ml-5 flex rounded-full bg-indigo-700"
            style={{ padding: '8px 18px', fontSize: 22 }}
          >
            SPORTS
          </span>
        </div>
        <span className="flex text-indigo-200" style={{ fontSize: 22 }}>
          manifold.markets/sports
        </span>
      </div>

      <div className="flex flex-1 items-center justify-between">
        <div className="flex flex-col">
          <span className="flex" style={{ fontSize: 80, lineHeight: 1.1 }}>
            Pick a game.
          </span>
          <span
            className="flex text-indigo-300"
            style={{ fontSize: 80, lineHeight: 1.1 }}
          >
            Make a call.
          </span>
          <span className="mt-6 flex text-indigo-100" style={{ fontSize: 30 }}>
            Trade with the crowd.
          </span>
        </div>
        <SportsIllustration />
      </div>

      <div className="flex items-center" style={{ gap: 12, marginBottom: 28 }}>
        {['NFL', 'NBA', 'MLB', 'NHL', 'SOCCER', '+ MORE'].map((sport) => (
          <span
            key={sport}
            className="flex rounded-full text-indigo-100"
            style={{
              border: '1px solid #6366f1',
              padding: '8px 20px',
              fontSize: 20,
            }}
          >
            {sport}
          </span>
        ))}
      </div>
      <div
        className="flex w-full items-center justify-between text-indigo-200"
        style={{ borderTop: '1px solid #4338ca', paddingTop: 20, fontSize: 22 }}
      >
        <span className="flex">Play-money prediction markets</span>
        <span className="flex">Live odds. Upcoming games. Season winners.</span>
      </div>
    </div>
  )
}

function SportsIllustration() {
  return (
    <svg
      width="380"
      height="320"
      viewBox="0 0 380 320"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Court markings give the artwork a sports setting at thumbnail size. */}
      <rect x="8" y="10" width="364" height="300" rx="36" stroke="#4338ca" />
      <path d="M8 160H372" stroke="#4338ca" />
      <circle cx="190" cy="160" r="62" stroke="#4338ca" />
      {/* Basketball */}
      <circle cx="244" cy="113" r="94" fill="#fb923c" />
      <g stroke="#9a3412" strokeWidth="4">
        <circle cx="244" cy="113" r="94" />
        <path d="M150 113H338M244 19V207M178 46C266 82 266 144 178 180M310 46C222 82 222 144 310 180" />
      </g>
      {/* Football */}
      <g transform="rotate(-32 115 220)">
        <path
          d="M10 220C58 126 172 126 220 220C172 314 58 314 10 220Z"
          fill="#a5b4fc"
          stroke="#1e1b4b"
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
      {/* Baseball */}
      <circle
        cx="286"
        cy="252"
        r="58"
        fill="#eef2ff"
        stroke="#1e1b4b"
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
