import Logo from 'web/public/logo.svg'

// Size the election card is laid out at: the 1200x630 that X's
// summary_large_image (and Facebook/LinkedIn) display at full width. The old
// 600x315 card looked soft when platforms scaled it up.
export const OG_ELECTION_WIDTH = 1200
export const OG_ELECTION_HEIGHT = 630

export type OgElectionProps = {
  // Republican % (0-100) in the House- and Senate-control markets, from
  // getControlRepPct (YES = Republicans hold the chamber).
  houseRep?: string
  senateRep?: string
  // When the odds were read, preformatted by formatOgAsOf ("Oct 6, 2026,
  // 9:30 PM ET"). The card is a snapshot, so it says when it was taken.
  asOf?: string
}

// These mirror the interactive map's party colors (state-election-map.tsx),
// which can't be imported here without dragging client components and hooks
// into the edge bundle.
const DEM_COLOR = '#5671ba'
const REP_COLOR = '#c25555'
const OTHER_COLOR = '#d1d5db'

function parsePct(pct: string | undefined) {
  if (pct === undefined || !/^\d{1,3}$/.test(pct)) return undefined
  const parsed = parseInt(pct)
  return parsed <= 100 ? parsed : undefined
}

// Untrusted query text: printable, short, and only what a timestamp needs.
function parseAsOf(asOf: string | undefined) {
  if (!asOf || asOf.length > 40 || !/^[A-Za-z0-9 ,:.]+$/.test(asOf))
    return undefined
  return asOf
}

// One chamber: its name, both parties' odds (leader emphasized), and the
// page's two-tone bar.
function ChamberRow(props: { chamber: string; repPct: number }) {
  const { chamber, repPct } = props
  const demPct = 100 - repPct
  const repLeads = repPct > demPct
  return (
    <div className="flex w-full flex-col">
      <div className="flex w-full flex-row items-end justify-between">
        <div className="flex flex-col">
          <span className="flex text-gray-500" style={{ fontSize: 26 }}>
            {`${chamber} control`}
          </span>
          <span
            className="flex"
            style={{
              color: DEM_COLOR,
              fontSize: repLeads ? 40 : 56,
              lineHeight: 1.1,
            }}
          >
            {`Democrats ${demPct}%`}
          </span>
        </div>
        <span
          className="flex"
          style={{
            color: REP_COLOR,
            fontSize: repLeads ? 56 : 40,
            lineHeight: 1.1,
          }}
        >
          {`Republicans ${repPct}%`}
        </span>
      </div>
      <div
        className="mt-4 flex w-full flex-row overflow-hidden rounded-full"
        style={{ height: 22, backgroundColor: OTHER_COLOR }}
      >
        <div
          className="flex h-full"
          style={{ width: `${demPct}%`, backgroundColor: DEM_COLOR }}
        />
        <div
          className="flex h-full"
          style={{ width: `${repPct}%`, backgroundColor: REP_COLOR }}
        />
      </div>
    </div>
  )
}

export function OgElection(props: OgElectionProps) {
  const houseRep = parsePct(props.houseRep)
  const senateRep = parsePct(props.senateRep)
  const asOf = parseAsOf(props.asOf)

  return (
    <div
      className="flex flex-col bg-white"
      style={{
        width: OG_ELECTION_WIDTH,
        height: OG_ELECTION_HEIGHT,
        padding: '48px 64px 40px',
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
        style={{ fontSize: 64, marginTop: 28, lineHeight: 1.1 }}
      >
        2026 Midterms — live odds
      </div>

      <div
        className="flex w-full flex-1 flex-col justify-center"
        style={{ gap: 40 }}
      >
        {houseRep !== undefined && (
          <ChamberRow chamber="House" repPct={houseRep} />
        )}
        {senateRep !== undefined && (
          <ChamberRow chamber="Senate" repPct={senateRep} />
        )}
        {houseRep === undefined && senateRep === undefined && (
          <div className="flex text-gray-500" style={{ fontSize: 36 }}>
            Senate, House and every state race, priced by traders.
          </div>
        )}
      </div>

      <div
        className="flex w-full flex-row items-end justify-between text-gray-500"
        style={{ fontSize: 22 }}
      >
        <span className="flex">
          {senateRep !== undefined
            ? 'Senate: a 50–50 split counts as Republican (VP tiebreak).'
            : 'Play-money prediction markets'}
        </span>
        {asOf && <span className="flex">{`Updated ${asOf}`}</span>}
      </div>
    </div>
  )
}
