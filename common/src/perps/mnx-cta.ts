import { MnxInstrument, getMnxInstrument } from './mnx'

// Outbound links to MNX: which market gets one, where the href points, and
// the single event name every one of those clicks writes.
//
// Two halves that have to agree with each other:
//   - Manifold side: every click inserts a `user_events` row named
//     MNX_CLICK_EVENT carrying the placement, the market and the instrument.
//     The row has the clicker's user id (null when signed out, with the
//     device id already in `data` via track()), so "how many clicked, and
//     who" is one query against a table we own — not a number MNX has to
//     tell us.
//   - MNX side: the href carries utm tags built from the SAME placement
//     string, so their analytics and ours can be reconciled placement by
//     placement instead of compared as two unrelated totals.
//
// Both halves live here rather than in the components because both are
// contracts with something outside the component — a SQL query someone
// writes weeks later (see backend/scripts/count-mnx-clicks.ts) and a third
// party's analytics — so they need one testable definition instead of string
// literals sprinkled through JSX.

export const MNX_CLICK_EVENT = 'click mnx link'

// Placement, not page: a reader can reach MNX from the CTA card or from the
// source credit under the chart, and those are different clicks with
// different intent. The surface is part of the value because the /perps hub
// and a market page draw different traffic.
export const MNX_LINK_LOCATIONS = [
  'market page cta',
  'market page credit',
  'perps hub cta',
  'perps hub credit',
] as const

export type MnxLinkLocation = (typeof MNX_LINK_LOCATIONS)[number]

/** `utm_content` for a placement: the event's own location, hyphenated. */
export const mnxLinkContent = (location: MnxLinkLocation) =>
  location.replace(/\s+/g, '-')

/**
 * The MNX instrument page this market should offer a reader, or undefined
 * when it should offer none.
 */
export const getMnxTradeTarget = (contract: {
  oracleFeedId?: string
  isResolved?: boolean
}): MnxInstrument | undefined => {
  const instrument = getMnxInstrument(contract.oracleFeedId)
  // A settled market is precisely the case where the instrument may no longer
  // exist: MNX ending one is what pauses trading here pending administrative
  // settlement (see the note under the chart), so a "trade it on MNX" button
  // on a settled page is the one that can point at a delisted instrument. The
  // source credit keeps its link either way — that one is a credit, not a
  // promotion.
  return instrument && !contract.isResolved ? instrument : undefined
}

/**
 * An MNX url tagged with the placement the click came from, so MNX can
 * attribute the visit without us having to ask them for numbers.
 */
export const mnxLinkUrl = (url: string, location: MnxLinkLocation) => {
  try {
    const tagged = new URL(url)
    // set(), not append(): re-tagging a url that already carries utm params
    // replaces them instead of sending two of each.
    tagged.searchParams.set('utm_source', 'manifold')
    tagged.searchParams.set('utm_medium', 'referral')
    tagged.searchParams.set('utm_campaign', 'perps')
    tagged.searchParams.set('utm_content', mnxLinkContent(location))
    return tagged.toString()
  } catch {
    // A url we can't parse is still a link we shouldn't break. The
    // Manifold-side event is recorded either way, so a click is never lost
    // for want of a tag.
    return url
  }
}
