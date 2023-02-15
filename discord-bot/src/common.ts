import { User } from 'discord.js'
import { LiteMarket, Manifold } from 'manifold-sdk'
import { manifoldMap } from './storage.js'

// Channel ID : Market ID
export const channelMarkets: { [k: string]: string } = {}
export const registerHelpMessage =
  'You must first register your Manifold Markets API key with /register. Go to https://manifold.markets/profile to get your API key.'
export async function getAPIInstance(user: User, notifyUser?: boolean) {
  if (!user?.id || !manifoldMap[user.id]) {
    if (notifyUser) await user.send(registerHelpMessage)
    return null
  }
  const key = manifoldMap[user.id]
  return new Manifold(key)
}

const api = new Manifold()
const marketsCache = {
  // No guarantees about order except that the newest market is always in markets[0]
  markets: [] as LiteMarket[], //     markets: await api.getAllMarkets(),
  updateTime: Date.now(),
}

export async function allMarkets() {
  // cache still valid for 60 seconds
  if (Date.now() - marketsCache.updateTime < 1000 * 60)
    return marketsCache.markets

  const newestInCacheID = marketsCache.markets[0].id
  infloop: for (;;) {
    const newest1000Markets = await api.getMarkets({})
    if (!newest1000Markets.length) {
      marketsCache.updateTime = Date.now()
      return marketsCache.markets
    }

    for (const market of newest1000Markets) {
      if (market.id === newestInCacheID) break infloop
      marketsCache.markets.unshift(market)
    }
  }

  marketsCache.updateTime = Date.now()
  return marketsCache.markets
}

export async function getMarketByTitle(
  query: string,
  options?: { exact: boolean }
) {
  query = query.toLowerCase().trim()
  for (const m of await allMarkets()) {
    if (options?.exact) {
      if (m.question.toLowerCase().trim() === query)
        return api.getMarket({ id: m.id })
    } else {
      if (m.question.toLowerCase().includes(query))
        return api.getMarket({ id: m.id })
    }
  }
  return null
}

export async function getMarketByID(id: string) {
  try {
    return api.getMarket({ id })
  } catch (e) {
    return null
  }
}
