import { ReactNode } from 'react'

import officeholdersFile from 'web/public/data/election-officeholders.json'
import { MapView } from 'web/lib/politics/election-map'
import {
  governorOf,
  holderText,
  houseDelegation,
  OfficeholdersFile,
  representativeOf,
  Seat,
  senatorsOf,
} from 'web/lib/politics/officeholders'
import own from './election-map.module.css'

const OFFICEHOLDERS = officeholdersFile as OfficeholdersFile

// Who holds the offices behind a place on the map, for its card: both
// senators (with when each seat is next up, so the ones not on the 2028
// ballot are there too), the governor, the House member or, for a whole
// state on the President map, its delegation. A 2026 winner who takes the
// seat in January follows the holder.

type Office = 'senate' | 'governor' | 'house' | 'delegation'

function officesFor(place: string, view: MapView): Office[] {
  const district = place.includes('-')
  if (district) return ['house']
  const mode =
    view.mode === 'primary'
      ? view.office === 'S'
        ? 'senate'
        : view.office === 'G'
        ? 'governor'
        : 'president'
      : view.mode
  if (mode === 'president') return ['senate', 'governor', 'delegation']
  if (mode === 'senate') return ['senate']
  if (mode === 'governor') return ['governor']
  return []
}

export function InOffice(props: {
  place: string
  view: MapView
  // The hover card keeps to the senators and governor; the pinned card adds
  // the House delegation.
  compact?: boolean
}) {
  const { place, view, compact } = props
  const st = place.split('-')[0]
  const lines: [string, ReactNode][] = []
  for (const office of officesFor(place, view)) {
    if (office === 'senate') {
      const senators = senatorsOf(OFFICEHOLDERS, st)
      senators.forEach((s, i) =>
        lines.push([
          i === 0 ? 'Senators' : '',
          <SeatText
            key={s.name}
            seat={s}
            note={s.next === 2028 ? 'up in 2028' : `next up ${s.next}`}
          />,
        ])
      )
    }
    if (office === 'governor') {
      const g = governorOf(OFFICEHOLDERS, st)
      if (g) lines.push(['Governor', <SeatText key="gov" seat={g} />])
    }
    if (office === 'house') {
      const r = representativeOf(OFFICEHOLDERS, place)
      if (r) lines.push(['Representative', <SeatText key="rep" seat={r} />])
      else if (OFFICEHOLDERS.vacant.includes(place))
        lines.push(['Representative', <span key="rep">Vacant</span>])
    }
    if (office === 'delegation' && !compact) {
      const d = houseDelegation(OFFICEHOLDERS, st)
      if (d.total > 1)
        lines.push([
          'House',
          <span key="del">
            {[d.D && `${d.D} D`, d.R && `${d.R} R`, d.I && `${d.I} I`]
              .filter(Boolean)
              .join(' · ')}
          </span>,
        ])
    }
  }
  if (lines.length === 0) return null
  return (
    <div className={own.others} aria-label="In office">
      {lines.map(([label, value], i) => (
        <span key={i}>
          <span className={own.muted}>{label}</span>
          {value}
        </span>
      ))}
    </div>
  )
}

function SeatText(props: { seat: Seat; note?: string }) {
  const { seat, note } = props
  return (
    <span className="text-right">
      {holderText(seat)}
      {note && <span className={own.muted}> · {note}</span>}
      {seat.elected && (
        <span className={own.muted}> → {holderText(seat.elected)} in Jan.</span>
      )}
    </span>
  )
}
