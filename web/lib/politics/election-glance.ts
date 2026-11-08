// Compact readings of /election's secondary markets, so each section can draw
// them as one picture instead of a grid of market cards: ordered bucket
// markets (electoral votes, popular-vote margin, seats) as a strip, the
// balance-of-power markets as each office's Democratic chance, the off-year
// races by state, and a short label for each official market. Pure, no I/O.

import { sortBy, sumBy } from 'lodash'

import { placeIn } from './official-markets'

export type AnswerOdds = { id: string; text: string; p: number }

const isOther = (text: string) => /^other\b/i.test(text.trim())

// ---------------------------------------------------------------- buckets

// Where a bucket answer sits on its scale: electoral votes or seats ("Under
// 200", "230–269", "50", "360 or more") or a popular-vote margin with
// Democrats positive ("R+6 or more", "R+0 to R+3", "D+3 to D+6"). Undefined
// for anything else.
export function bucketAt(text: string): number | undefined {
  const t = text.trim()
  const margin = t.match(
    /^([DR])\+(\d+(?:\.\d+)?)\s*(?:to|–|-)\s*(?:[DR]\+)?(\d+(?:\.\d+)?)$/i
  )
  if (margin) {
    const sign = margin[1].toUpperCase() === 'D' ? 1 : -1
    return (sign * (Number(margin[2]) + Number(margin[3]))) / 2
  }
  const marginOpen = t.match(/^([DR])\+(\d+(?:\.\d+)?)\s*(?:or more|\+)$/i)
  if (marginOpen) {
    const sign = marginOpen[1].toUpperCase() === 'D' ? 1 : -1
    return sign * (Number(marginOpen[2]) + 0.5)
  }
  const under = t.match(/^(?:under|fewer than|less than)\s+(\d+)$/i)
  if (under) return Number(under[1]) - 0.5
  const range = t.match(/^(\d+)\s*(?:–|-|to)\s*(\d+)$/)
  if (range) return (Number(range[1]) + Number(range[2])) / 2
  const open = t.match(/^(\d+)\s*(?:or more|\+)$/i)
  if (open) return Number(open[1]) + 0.5
  if (/^\d+$/.test(t)) return Number(t)
  return undefined
}

// The bucket's label in a narrow cell: "<200", "230–269", "360+", "R+3–6",
// "D+9+".
export function bucketLabel(text: string): string {
  const t = text.trim()
  return t
    .replace(/^(?:under|fewer than|less than)\s+(\d+)$/i, '<$1')
    .replace(/^([DR])\+(\d+(?:\.\d+)?)\s*(?:to|–|-)\s*[DR]\+/i, '$1+$2–')
    .replace(/\s*or more$/i, '+')
    .replace(/(\d)\s*-\s*(\d)/, '$1–$2')
}

export type Bucket = {
  id: string
  text: string
  label: string
  p: number
  at: number
  // Which side of the threshold the bucket falls on; 'tie' for a count that
  // is neither side's (a 50–50 Senate, which the Vice President breaks).
  side: 'D' | 'R' | 'tie'
}

// A bucket market's answers in scale order, each with its side of
// `threshold` (270 electoral votes; a margin of 0; 51 Senate seats), and
// the count `tie` (50 Senate seats) on neither side. Undefined unless every
// answer but Other reads as a bucket: a market we can't order isn't a strip.
export function orderedBuckets(
  answers: AnswerOdds[],
  threshold: number,
  tie?: number
): Bucket[] | undefined {
  const named = answers.filter((a) => !isOther(a.text))
  if (named.length < 2) return undefined
  const placed = named.map((a) => ({ a, at: bucketAt(a.text) }))
  if (placed.some((x) => x.at === undefined)) return undefined
  return sortBy(placed, (x) => x.at).map(({ a, at }) => ({
    id: a.id,
    text: a.text,
    label: bucketLabel(a.text),
    p: Number.isFinite(a.p) ? a.p : 0,
    at: at as number,
    side: at === tie ? 'tie' : (at as number) >= threshold ? 'D' : 'R',
  }))
}

export const sideTotal = (buckets: Bucket[], side: Bucket['side']) =>
  sumBy(
    buckets.filter((b) => b.side === side),
    (b) => b.p
  )

// --------------------------------------------------- the other nominee

// An electoral-vote or seat bucket's range, inclusive ("Under 200" is 0–199,
// "50" is 50–50, "360 or more" runs to `total`). Undefined for anything that
// isn't a count range.
export function bucketRange(
  text: string,
  total: number
): [number, number] | undefined {
  const t = text.trim()
  const under = t.match(/^(?:under|fewer than|less than)\s+(\d+)$/i)
  if (under) return [0, Number(under[1]) - 1]
  const range = t.match(/^(\d+)\s*(?:–|-|to)\s*(\d+)$/)
  if (range) return [Number(range[1]), Number(range[2])]
  const open = t.match(/^(\d+)\s*(?:or more|\+)$/i)
  if (open) return [Number(open[1]), total]
  if (/^\d+$/.test(t)) return [Number(t), Number(t)]
  return undefined
}

// The same buckets from the other side: if every elector (or seat) goes to
// one of the two parties, the other gets `total` minus each count, so
// "Under 200" for the Democrat is "339 or more" for the Republican. Each
// keeps its answer and chance; sides are read against `threshold` on the new
// scale, with `tie` (a 50–50 Senate) on neither. Undefined unless every
// bucket is a count range.
export function otherNominee(
  buckets: Bucket[],
  total: number,
  threshold: number,
  tie?: number
): Bucket[] | undefined {
  const flipped = buckets.map((b) => {
    const range = bucketRange(b.text, total)
    if (!range) return undefined
    const lo = total - range[1]
    const hi = total - range[0]
    const label =
      lo === hi
        ? `${lo}`
        : hi >= total
        ? `${lo}+`
        : lo <= 0
        ? `<${hi + 1}`
        : `${lo}–${hi}`
    const text =
      lo === hi
        ? `${lo}`
        : hi >= total
        ? `${lo} or more`
        : lo <= 0
        ? `Under ${hi + 1}`
        : `${lo}–${hi}`
    return {
      ...b,
      label,
      text,
      at: (lo + hi) / 2,
      // The other side's: past the line is theirs (red for the
      // Republican).
      side: (lo === hi && lo === tie
        ? 'tie'
        : lo >= threshold
        ? 'R'
        : 'D') as Bucket['side'],
    }
  })
  if (flipped.some((b) => !b)) return undefined
  return sortBy(flipped as Bucket[], (b) => b.at)
}

// A seat-count market at a glance: the range holding the middle outcome,
// counted for the side it falls on ("D 54–56" seats, or "R 51–53" when the
// Democrats fall short), and the Democrats' chance of a majority (half a
// tie). Undefined for a market with no chance on it.
export function seatGlance(
  buckets: Bucket[],
  total: number,
  threshold: number,
  tie?: number
): { side: Bucket['side']; label: string; dem: number } | undefined {
  const all = sumBy(buckets, (b) => b.p)
  if (!(all > 0)) return undefined
  let below = 0
  const middle =
    buckets.find((b) => (below += b.p) >= all / 2) ??
    buckets[buckets.length - 1]
  const dem = (sideTotal(buckets, 'D') + sideTotal(buckets, 'tie') / 2) / all
  if (middle.side !== 'R') return { side: middle.side, label: middle.label, dem }
  const theirs = otherNominee(buckets, total, threshold, tie)?.find(
    (b) => b.id === middle.id
  )
  return theirs ? { side: 'R', label: theirs.label, dem } : undefined
}

// ---------------------------------------------------------- balance of power

const COMBO = /^([DR]) President, ([DR]) Senate, ([DR]) House/

export type ControlOdds = { president: number; senate: number; house: number }

// The Democrats' chance of each office from a balance-of-power market's
// eight D/R combinations: the sum of the combinations that give it to them,
// over the combinations read (so a stray answer doesn't skew it).
export function controlOdds(answers: AnswerOdds[]): ControlOdds | undefined {
  const combos = answers.flatMap((a) => {
    const m = a.text.match(COMBO)
    return m && Number.isFinite(a.p) ? [{ m, p: a.p }] : []
  })
  const total = sumBy(combos, (c) => c.p)
  if (combos.length === 0 || !(total > 0)) return undefined
  const dem = (i: number) =>
    sumBy(
      combos.filter((c) => c.m[i] === 'D'),
      (c) => c.p
    ) / total
  return { president: dem(1), senate: dem(2), house: dem(3) }
}

export const isBalanceOfPower = (answers: AnswerOdds[]) =>
  answers.some((a) => COMBO.test(a.text))

// ------------------------------------------------------------- off-year

export type OffYearRace = {
  state: string // two-letter
  office: string // "Governor", "House of Delegates", "U.S. Senate special"
  // Which race leads the state's row and colours it on the map.
  rank: number
  cycle: number
}

// A state race in an odd year, from its question ("Which party will control
// the Virginia House of Delegates after the 2027 election?"). Undefined for
// anything that isn't one state's race (the Speaker vote, a mayor, House
// specials anywhere).
export function offYearRace(question: string): OffYearRace | undefined {
  const state = placeIn(question)
  const year = question.match(/\b(20\d\d)\b/)
  if (!state || !year) return undefined
  const cycle = Number(year[1])
  if (cycle % 2 === 0) return undefined
  const q = question
  const [office, rank] = /governor|gubernatorial/i.test(q)
    ? ['Governor', 0]
    : /\bU\.?S\.? Senate\b/i.test(q)
    ? [/special/i.test(q) ? 'U.S. Senate special' : 'U.S. Senate', 1]
    : /House of Delegates/i.test(q)
    ? ['House of Delegates', 2]
    : /General Assembly|\bAssembly\b/i.test(q)
    ? ['Assembly', 2]
    : /\bHouse\b/i.test(q)
    ? ['House', 2]
    : /\bSenate\b/i.test(q)
    ? ['Senate', 3]
    : /mayor/i.test(q)
    ? ['Mayor', 4]
    : ['Race', 5]
  return { state, office: office as string, rank: rank as number, cycle }
}

// ----------------------------------------------------------- multi markets

// The named answer with the best chance (Other is a bucket, not a pick).
export function leadingAnswer(answers: AnswerOdds[]): AnswerOdds | undefined {
  const named = answers.filter((a) => !isOther(a.text) && Number.isFinite(a.p))
  return sortBy(named, (a) => -a.p)[0]
}

// A "who will run for the nomination" market, by party, for the primaries'
// field of faces. Undefined for anything else (a state's primary, say).
export function runningField(question: string): 'D' | 'R' | undefined {
  if (!/\bwill run\b/i.test(question)) return undefined
  if (/\bdemocratic\b/i.test(question)) return 'D'
  if (/\brepublican\b/i.test(question)) return 'R'
  return undefined
}

// The year a question names, if any ("the January 2027 Speaker vote").
export const yearIn = (question: string): number | undefined => {
  const y = question.match(/\b(20\d\d)\b/)
  return y ? Number(y[1]) : undefined
}

// ---------------------------------------------------------------- labels

// Short names for the official markets that render as one line.
export const MARKET_LABELS: Record<string, string> = {
  '2028-dem-contested-convention': 'Democratic convention goes past one ballot',
  '2028-gop-contested-convention': 'Republican convention goes past one ballot',
  '2028-ec-popular-split': 'The popular-vote winner loses',
  '2028-npvic-in-effect': 'National Popular Vote compact in effect',
  '2028-speaker-january-2029': 'Speaker of the House, January 2029',
  '2028-vp-winner': 'Elected vice president',
  '2028-tipping-point': 'Tipping-point state',
  '2028-popular-vote-margin': 'Popular-vote margin',
  '2028-dem-electoral-votes': "Democratic nominee's electoral votes",
  '2028-dem-nominee': 'Democratic nominee',
  '2028-gop-nominee': 'Republican nominee',
  '2032-winner': '2032 winner',
  '2032-president-US-general': '2032 White House, by party',
  '2032-dem-nominee': '2032 Democratic nominee',
  '2032-gop-nominee': '2032 Republican nominee',
  '2036-president-US-general': '2036 White House, by party',
  ...Object.fromEntries(
    [2028, 2030, 2032, 2034, 2036].flatMap((y) => [
      [`${y}-dem-senate-seats`, `Democratic Senate seats after ${y}`],
      [`${y}-dem-house-seats`, `Democratic House seats won in ${y}`],
    ])
  ),
}

// Where /election places the 2028 official markets that have no slot of
// their own: the conventions chapter, the national picture's strips and
// tipping-point bars, or a line among its facts. Anything a script adds
// later lands among the facts, so a new market never drops off the page.
export type More2028Place =
  | 'conventions'
  | 'electoralVotes'
  | 'margin'
  | 'tippingPoint'
  | 'senateSeats'
  | 'houseSeats'
  | 'facts'

export function placeMore2028(key: string | undefined): More2028Place {
  switch (key) {
    case '2028-dem-contested-convention':
    case '2028-gop-contested-convention':
    case '2028-vp-winner':
      return 'conventions'
    case '2028-dem-electoral-votes':
      return 'electoralVotes'
    case '2028-popular-vote-margin':
      return 'margin'
    case '2028-tipping-point':
      return 'tippingPoint'
    case '2028-dem-senate-seats':
      return 'senateSeats'
    case '2028-dem-house-seats':
      return 'houseSeats'
    default:
      return 'facts'
  }
}
