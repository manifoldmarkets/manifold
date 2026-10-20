import { track } from 'web/lib/service/analytics'

/**
 * What the news page measures. The funnel the concept is judged on:
 * panel expansions, market clicks, trades, creation starts and completed
 * publications. The rest explain the funnel (where readers drop out, what
 * they report).
 */
export type NewsEvent =
  /** The reader opened a story's markets and claims. */
  | 'news panel expand'
  | 'news panel collapse'
  /** The headline or thumbnail, out to the publisher. */
  | 'news headline click'
  /** A market's question, to its page. */
  | 'news market click'
  /** A Yes, No or Bet button on the page. */
  | 'news trade intent'
  /** A trade placed from the page's bet dialog. */
  | 'news trade'
  /** The reader pressed + Create market on a claim. */
  | 'news create start'
  /** First edit of a draft. */
  | 'news create edit'
  /** The reader chose an existing market instead of creating one. */
  | 'news create reuse'
  | 'news create cancel'
  /** The reader published a draft. */
  | 'news create publish'
  | 'news feedback open'
  | 'news feedback send'
  /** The "new stories" pill was shown, or pressed. */
  | 'news new stories shown'
  | 'news new stories show'
  | 'news claims more'
  | 'news outlook more'

export const trackNews = (
  event: NewsEvent,
  props?: Parameters<typeof track>[1]
) => track(event, props)
