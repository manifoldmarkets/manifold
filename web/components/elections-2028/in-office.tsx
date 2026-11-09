import { ReactNode } from 'react'

import officeholdersFile from 'web/public/data/election-officeholders.json'
import { MapView } from 'web/lib/politics/election-map'
import {
  delegateOf,
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
// state on the President map, its delegation (DC and the territories: their
// delegate). A 2026 winner who takes the seat follows the holder.

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
      const vacant = OFFICEHOLDERS.vacant[place]
      if (r) lines.push(['Representative', <SeatText key="rep" seat={r} />])
      else if (vacant)
        lines.push([
          'Representative',
          <span key="rep" className="text-right">
            Vacant
            {vacant.elected && (
              <span className={own.muted}>
                {' '}
                → {holderText(vacant.elected)}, elected 2026
              </span>
            )}
          </span>,
        ])
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
  // DC and the territories have a delegate in the House and no senators.
  if (!place.includes('-') && !OFFICEHOLDERS.senate[st]) {
    const delegate = delegateOf(OFFICEHOLDERS, st)
    if (delegate)
      lines.push(['Delegate', <SeatText key="delegate" seat={delegate} />])
  }
  if (lines.length === 0) return null
  return (
    <section className={own.others} aria-label="In office">
      {lines.map(([label, value], i) => (
        <span key={i}>
          <span className={own.muted}>{label}</span>
          {value}
        </span>
      ))}
      {!compact && (
        <span className={own.muted}>
          In office as of{' '}
          {new Date(`${OFFICEHOLDERS.asOf}T12:00:00Z`).toLocaleDateString(
            'en-US',
            { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }
          )}
        </span>
      )}
    </section>
  )
}

function SeatText(props: { seat: Seat; note?: string }) {
  const { seat, note } = props
  return (
    <span className="text-right">
      {holderText(seat)}
      {note && <span className={own.muted}> · {note}</span>}
      {seat.elected && (
        <span className={own.muted}>
          {' '}
          → {holderText(seat.elected)}, elected 2026
        </span>
      )}
    </span>
  )
}
