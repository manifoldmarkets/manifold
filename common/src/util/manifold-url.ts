const MARKET_SLUG_REGEX = /^[a-z0-9-]+$/i

export type ManifoldMarketUrl = {
  username: string
  slug: string
  origin: string
}

export const isManifoldHostname = (hostname: string) => {
  const normalizedHostname = hostname.toLowerCase()
  return (
    normalizedHostname === 'manifold.markets' ||
    normalizedHostname === 'manifold.love' ||
    normalizedHostname === 'localhost' ||
    normalizedHostname.endsWith('.manifold.markets') ||
    normalizedHostname.endsWith('.manifold.love')
  )
}

const isHttpUrl = (url: URL) =>
  url.protocol === 'https:' || url.protocol === 'http:'

const matchesOrigin = (url: URL, additionalOrigin?: string) => {
  if (!additionalOrigin) return false
  try {
    const parsedOrigin = new URL(additionalOrigin)
    return isHttpUrl(parsedOrigin) && url.origin === parsedOrigin.origin
  } catch {
    return false
  }
}

const getMarketPath = (url: URL) => {
  const parts = url.pathname.split('/').filter(Boolean)
  const marketParts = parts[0] === 'embed' ? parts.slice(1) : parts
  if (marketParts.length !== 2) return null

  const [username, slug] = marketParts
  if (!username || !MARKET_SLUG_REGEX.test(slug)) return null
  return { username, slug }
}

export const matchManifoldMarketUrl = (
  text: string,
  additionalOrigin?: string
): ManifoldMarketUrl | null => {
  try {
    const url = new URL(text.trim())
    if (!isHttpUrl(url)) return null
    if (
      !isManifoldHostname(url.hostname) &&
      !matchesOrigin(url, additionalOrigin)
    ) {
      return null
    }

    const marketPath = getMarketPath(url)
    if (!marketPath) return null
    return { ...marketPath, origin: url.origin }
  } catch {
    return null
  }
}

export const getManifoldMarketEmbedUrl = (
  text: string,
  additionalOrigin?: string
) => {
  const market = matchManifoldMarketUrl(text, additionalOrigin)
  if (!market) return null
  return `${market.origin}/embed/${market.username}/${market.slug}`
}

export const getMarketUrlFromManifoldEmbedUrl = (
  text: string
): string | null => {
  try {
    const url = new URL(text)
    if (!isHttpUrl(url) || !isManifoldHostname(url.hostname)) return null

    const parts = url.pathname.split('/').filter(Boolean)
    if (parts[0] !== 'embed') return null
    const marketPath = getMarketPath(url)
    if (!marketPath) return null

    url.pathname = `/${marketPath.username}/${marketPath.slug}`
    return url.toString()
  } catch {
    return null
  }
}
