import { OG_CARD_HEIGHT, OG_CARD_WIDTH } from 'common/edge/og'
import Logo from 'web/public/logo.svg'

// Evergreen copy in the same gradient frame and white card as market embeds.
export function OgSports() {
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

        <div className="flex flex-1 flex-col items-center justify-center">
          <span
            className="flex text-gray-900"
            style={{ fontSize: 80, lineHeight: 1.1 }}
          >
            Know the game?
          </span>
          <span
            className="flex text-indigo-700"
            style={{ fontSize: 80, lineHeight: 1.1 }}
          >
            Make the call.
          </span>
          <span className="mt-4 flex text-gray-500" style={{ fontSize: 28 }}>
            Trade with the crowd.
          </span>
        </div>

        <div className="flex justify-center" style={{ gap: 12 }}>
          {['NFL', 'NBA', 'MLB', 'NHL', 'Soccer', '+ more'].map((sport) => (
            <span
              key={sport}
              className="flex rounded-lg bg-indigo-50 text-indigo-700"
              style={{ padding: '8px 20px', fontSize: 22 }}
            >
              {sport}
            </span>
          ))}
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
