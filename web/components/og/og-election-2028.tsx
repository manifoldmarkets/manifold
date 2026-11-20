import Logo from 'web/public/logo.svg'

// The /election share card after the midterms: the 2028 presidency by party,
// and each party's nominee frontrunner with their face. 1200x630, laid out
// natively like the 2026 card.
export const OG_ELECTION_2028_WIDTH = 1200
export const OG_ELECTION_2028_HEIGHT = 630

export type OgElection2028Props = {
  dem?: string // Democratic % (0-100) in the party market
  rep?: string
  demName?: string // the Democratic nominee frontrunner's short name
  demPct?: string
  demPhoto?: string // file key under /political-candidates, e.g. "ossoff"
  repName?: string
  repPct?: string
  repPhoto?: string
  asOf?: string
  // Set by the route from the request, never from the query.
  origin?: string
}

// Mirrors the site's party colours (state-election-map.tsx), which can't be
// imported into the edge bundle.
const DEM_COLOR = '#5671ba'
const REP_COLOR = '#c25555'
const OTHER_COLOR = '#d1d5db'

function parsePct(pct: string | undefined) {
  if (pct === undefined || !/^\d{1,3}$/.test(pct)) return undefined
  const parsed = parseInt(pct)
  return parsed <= 100 ? parsed : undefined
}

// Untrusted query text: short, letters and a few punctuation marks only.
const parseName = (name: string | undefined) =>
  name && name.length <= 24 && /^[\p{L} .'’-]+$/u.test(name) ? name : undefined

const parsePhoto = (key: string | undefined) =>
  key && /^[a-z0-9-]{1,32}$/.test(key) ? key : undefined

const parseAsOf = (asOf: string | undefined) =>
  asOf && asOf.length <= 40 && /^[A-Za-z0-9 ,:.]+$/.test(asOf)
    ? asOf
    : undefined

function Leader(props: {
  name?: string
  pct?: number
  photo?: string
  origin?: string
  race: string
  color: string
}) {
  const { name, pct, photo, origin, race, color } = props
  if (!name || pct === undefined) return null
  return (
    <div className="flex flex-row items-center">
      <div
        className="flex overflow-hidden rounded-full"
        style={{
          width: 104,
          height: 104,
          border: `5px solid ${color}`,
          backgroundColor: '#e5e7eb',
        }}
      >
        {photo && origin && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${origin}/political-candidates/${photo}.png`}
            width={94}
            height={94}
            style={{ objectFit: 'cover' }}
            alt=""
          />
        )}
      </div>
      <div className="ml-5 flex flex-col">
        <span className="flex text-gray-900" style={{ fontSize: 40 }}>
          {`${name} ${pct}%`}
        </span>
        <span className="flex text-gray-500" style={{ fontSize: 24 }}>
          {race}
        </span>
      </div>
    </div>
  )
}

export function OgElection2028(props: OgElection2028Props) {
  const dem = parsePct(props.dem)
  const rep = parsePct(props.rep)
  const other =
    dem !== undefined && rep !== undefined ? Math.max(0, 100 - dem - rep) : 0
  const asOf = parseAsOf(props.asOf)
  const origin = props.origin

  return (
    <div
      className="flex flex-col bg-white"
      style={{
        width: OG_ELECTION_2028_WIDTH,
        height: OG_ELECTION_2028_HEIGHT,
        padding: '44px 64px 36px',
        fontFamily: 'Figtree',
      }}
    >
      <div className="flex w-full flex-row items-center justify-between">
        <div className="flex flex-row items-center">
          <Logo className="mr-2 h-14 w-14" stroke="#4338ca" />
          <span
            className="flex uppercase text-indigo-700"
            style={{ fontSize: 36, fontFamily: 'Figtree-light' }}
          >
            Manifold
          </span>
        </div>
        <span
          className="flex rounded-full text-indigo-700"
          style={{
            fontSize: 24,
            padding: '6px 18px',
            backgroundColor: '#eef2ff',
          }}
        >
          manifold.markets/election
        </span>
      </div>

      <div
        className="flex text-gray-900"
        style={{ fontSize: 60, marginTop: 22, lineHeight: 1.1 }}
      >
        Who wins the White House in 2028?
      </div>

      {dem !== undefined && rep !== undefined && (
        <div className="flex w-full flex-col" style={{ marginTop: 26 }}>
          <div className="flex w-full flex-row items-end justify-between">
            <span
              className="flex"
              style={{ color: DEM_COLOR, fontSize: dem >= rep ? 60 : 44 }}
            >
              {`Democrats ${dem}%`}
            </span>
            <span
              className="flex"
              style={{ color: REP_COLOR, fontSize: rep > dem ? 60 : 44 }}
            >
              {`Republicans ${rep}%`}
            </span>
          </div>
          <div
            className="mt-3 flex w-full flex-row overflow-hidden rounded-full"
            style={{ height: 22, backgroundColor: OTHER_COLOR }}
          >
            <div
              className="flex h-full"
              style={{ width: `${dem}%`, backgroundColor: DEM_COLOR }}
            />
            <div className="flex h-full" style={{ width: `${other}%` }} />
            <div
              className="flex h-full"
              style={{ width: `${rep}%`, backgroundColor: REP_COLOR }}
            />
          </div>
        </div>
      )}

      <div className="flex w-full flex-1 flex-row items-center justify-between">
        <Leader
          name={parseName(props.demName)}
          pct={parsePct(props.demPct)}
          photo={parsePhoto(props.demPhoto)}
          origin={origin}
          race="to be the Democratic nominee"
          color={DEM_COLOR}
        />
        <Leader
          name={parseName(props.repName)}
          pct={parsePct(props.repPct)}
          photo={parsePhoto(props.repPhoto)}
          origin={origin}
          race="to be the Republican nominee"
          color={REP_COLOR}
        />
      </div>

      <div
        className="flex w-full flex-row items-end justify-between text-gray-500"
        style={{ fontSize: 22 }}
      >
        <span className="flex">Play-money prediction markets</span>
        {asOf && <span className="flex">{`Updated ${asOf}`}</span>}
      </div>
    </div>
  )
}
