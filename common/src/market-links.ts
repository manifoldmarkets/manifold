// A market can be linked to one other market, its parent: a prop or a line on
// a game, a sub-market of an election race, anything that's about a specific
// other market. Feeds can use links to show related markets beside a parent.
// Creation defaults ordinary markets and polls to the parent's close time.
// Explicit overrides and native no-close STONK/bounty defaults are preserved.
// Linking existing markets and later parent updates do not change deadlines.
//
// Links are one level deep: a parent is never itself linked to another
// market, so there are no chains and no loops.

import { NO_CLOSE_TIME_TYPES, OutcomeType } from './contract'

/** Polls may inherit a deadline; native no-close market types keep their default. */
export function canInheritLinkedCloseTime(
  outcomeType: OutcomeType | null | undefined
) {
  return (
    outcomeType != null &&
    (outcomeType === 'POLL' || !NO_CLOSE_TIME_TYPES.includes(outcomeType))
  )
}

export const MARKET_LINK_RELATIONS = ['line', 'prop', 'related'] as const
export type MarketLinkRelation = (typeof MARKET_LINK_RELATIONS)[number]

export const MARKET_LINK_RELATION_LABELS: Record<MarketLinkRelation, string> = {
  line: 'Line',
  prop: 'Prop',
  related: 'Related',
}

export type MarketLink = {
  childContractId: string
  parentContractId: string
  relation: MarketLinkRelation
  createdBy: string
  createdTime: number
}

/** The market on the other end of a link, enough to show and link to it. */
export type MarketLinkRef = {
  id: string
  question: string
  slug: string
  creatorId: string
  creatorUsername: string
  relation: MarketLinkRelation
  /** For what getLinkParentError checks: a closed parent takes no changes. */
  closeTime: number | null
  isResolved: boolean
}

/**
 * A market's parent and the markets linked to it. Markets that aren't public
 * are never named, only flagged or counted.
 */
export type MarketLinks = {
  parent: MarketLinkRef | null
  /** Linked to a market that's since been unlisted or deleted. */
  parentHidden: boolean
  children: MarketLinkRef[]
  /** All public children, including any past the returned page. */
  childCount: number
  /** Children that aren't public. They still keep this market a parent. */
  hiddenChildCount: number
}

/** What a would-be parent has to satisfy. */
export type LinkParentCandidate = {
  id: string
  visibility: string
  deleted: boolean
  isResolved: boolean
  closeTime: number | null
  /** The candidate is itself linked to another market. */
  isChild: boolean
}

/** Why `parent` can't be linked to, or undefined if it can. */
export function getLinkParentError(
  parent: LinkParentCandidate | null | undefined,
  childId?: string,
  now = Date.now()
): string | undefined {
  if (!parent || parent.deleted) return "The market to link to wasn't found."
  if (childId && parent.id === childId)
    return "A market can't be linked to itself."
  if (parent.visibility !== 'public')
    return 'Only public markets can be linked to.'
  if (parent.isResolved) return 'The market to link to has already resolved.'
  if (parent.closeTime != null && parent.closeTime <= now)
    return 'The market to link to has already closed.'
  if (parent.isChild)
    return 'That market is linked to another market itself. Link to that one instead.'
  return undefined
}

/** Why `child` can't be linked to anything, or undefined if it can. */
export function getLinkChildError(child: {
  visibility: string
  deleted: boolean
  /** Markets already linked to this one. */
  childCount: number
}): string | undefined {
  if (child.deleted) return "The market wasn't found."
  if (child.visibility !== 'public')
    return 'Only public markets can be linked to another market.'
  if (child.childCount > 0)
    return 'Other markets are linked to this one, so it has to stay a parent.'
  return undefined
}
