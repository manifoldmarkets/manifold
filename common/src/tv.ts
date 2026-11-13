// A Manifold TV event can show the live election board (the /election map,
// race movers, watchlist and trades) under its stream instead of one market.
// The schedule stores this id in tv_schedule.contract_id, which is free text
// with no foreign key, in place of a market id.
export const TV_ELECTION_BOARD_ID = 'election'

// What a scheduler types in the market box to get the board: "election", or
// a pasted link whose last path segment is /election. The modal already
// reduces links to that segment; this repeats it so the API accepts either.
export function isTVElectionBoardInput(slug: string) {
  const segment =
    slug
      .trim()
      .split('?')[0]
      .split('#')[0]
      .replace(/\/+$/, '')
      .split('/')
      .pop() ?? ''
  return ['election', 'elections'].includes(segment.toLowerCase())
}

export const isTVElectionBoard = (contractId: string | null | undefined) =>
  contractId === TV_ELECTION_BOARD_ID
