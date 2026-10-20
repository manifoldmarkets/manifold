import { useEffect, useState } from 'react'
import { LiteMarket } from 'common/api/market-types'
import { api } from 'web/lib/api/api'

const STOP_WORDS = new Set(
  (
    'will the a an of to in on by for and or be is are at as with from that ' +
    'this whether than before after any its their his her into over under ' +
    'more less least most about during between what which who when how does ' +
    'do did has have had been being was were not no yes end new least'
  ).split(' ')
)
const MONTH = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i

/**
 * Market search matches every word, so a whole question finds nothing.
 * From a question, a few queries of falling length: names first, then the
 * other content words.
 */
export function keywordQueries(question: string) {
  const words = question
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/['’]s$/i, ''))
    .filter(
      (w) =>
        w.length > 2 &&
        !STOP_WORDS.has(w.toLowerCase()) &&
        !/^\d+$/.test(w) &&
        !MONTH.test(w)
    )
  const isName = (w: string) => /^\p{Lu}/u.test(w)
  const ranked = [...words.filter(isName), ...words.filter((w) => !isName(w))]
  return [4, 3, 2]
    .map((n) => ranked.slice(0, n).join(' '))
    .filter((q, i, all) => q && all.indexOf(q) === i)
}

/**
 * Open markets matching what the reader typed, after a pause. With
 * `fromQuestion`, the text is a market question and is searched as a few
 * shorter keyword queries, stopping at the first that finds anything.
 */
export function useMarketSearch(
  term: string,
  opts: {
    limit?: number
    minLength?: number
    delayMs?: number
    fromQuestion?: boolean
  } = {}
) {
  const { limit = 5, minLength = 3, delayMs = 350, fromQuestion } = opts
  const [results, setResults] = useState<LiteMarket[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    const q = term.trim()
    if (q.length < minLength) {
      setResults([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        let found: LiteMarket[] = []
        for (const query of fromQuestion ? keywordQueries(q) : [q]) {
          found = await api('search-markets', {
            term: query,
            filter: 'open',
            limit,
          })
          if (cancelled || found.length > 0) break
        }
        if (!cancelled) setResults(found)
      } catch (e) {
        console.error(e)
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, delayMs)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [term, limit, minLength, delayMs, fromQuestion])
  return { results, loading }
}

/** A search result's price in a few characters. */
export const litePrice = (m: LiteMarket) => {
  if (typeof m.probability === 'number' && Number.isFinite(m.probability))
    return `${Math.round(m.probability * 100)}%`
  const top = [...(m.answers ?? [])].sort(
    (a, b) => b.probability - a.probability
  )[0]
  return top ? `${top.text} ${Math.round(top.probability * 100)}%` : ''
}

export const litePath = (m: LiteMarket) => {
  try {
    return new URL(m.url).pathname
  } catch {
    return m.url
  }
}
