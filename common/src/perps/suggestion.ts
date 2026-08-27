// A user's pitch for a perpetual market: what they'd trade, and (optionally)
// the feed we'd measure it with. Ranked by one upvote per user on the /perps
// hub. Nothing downstream is automated yet — this is an input to the launch
// queue, not a market.
export type PerpSuggestion = {
  id: number
  userId: string
  name: string
  dataSource: string | null
  createdTime: number
  votes: number
  // Whether the requesting user has upvoted it (false when signed out).
  hasVoted: boolean
}

export const PERP_SUGGESTION_NAME_MIN = 3
export const PERP_SUGGESTION_NAME_MAX = 80
export const PERP_SUGGESTION_SOURCE_MAX = 300
// Per user per rolling day. Generous for a human, tight for a script.
export const PERP_SUGGESTIONS_PER_DAY = 5
