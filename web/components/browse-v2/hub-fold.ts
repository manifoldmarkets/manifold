import { Contract } from 'common/contract'

// Markets that live in a hub (Perps, Sports, Midterms) and that browse
// visitors rarely open from the main feed: perps, and small house-made
// sports and race markets, are clicked far less often than other markets
// shown at the same position, yet took up a large share of the feed.
// Popular house markets (20+ traders) stay in the feed.
const HUB_CREATORS = new Set(['ManifoldSports', 'ManifoldPolitics'])
const HUB_MIN_TRADERS = 20

export const isHubMarket = (c: Contract) =>
  c.outcomeType === 'PERP' ||
  (HUB_CREATORS.has(c.creatorUsername) &&
    (c.uniqueBettorCount ?? 0) < HUB_MIN_TRADERS)
