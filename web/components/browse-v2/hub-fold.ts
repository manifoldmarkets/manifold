import { Contract } from 'common/contract'

// Markets that live in a hub (Sports, Elections) and that browse visitors
// rarely open from the main feed: small house-made sports and race markets
// are opened far less often than other markets shown at the same position,
// yet took up a large share of the feed. Popular house markets (20+ traders)
// stay in the feed. Perps were folded too at first, but at the same position
// they are opened about as often as other markets, so they stay in the feed.
const HUB_CREATORS = new Set(['ManifoldSports', 'ManifoldPolitics'])
// localStorage: this device wants hub markets shown in the list.
export const SHOW_HUB_MARKETS_KEY = 'browse-v2-show-hub-markets'
const HUB_MIN_TRADERS = 20

export const isHubMarket = (c: Contract) =>
  HUB_CREATORS.has(c.creatorUsername) &&
  (c.uniqueBettorCount ?? 0) < HUB_MIN_TRADERS
