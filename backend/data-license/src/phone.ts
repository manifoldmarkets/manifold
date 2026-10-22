// ---------------------------------------------------------------------------
// phone.ts — phone-number detection for the text scrub.
//
// The old rule ("7+ digits with any separators") deleted forecasting content:
// in testing, nearly all of its matches were dates, ids, probabilities,
// decimals and number runs. This detector only considers
// phone-SHAPED strings, then checks each against libphonenumber's numbering
// plans:
//   - international: +<country code> then digits, optionally grouped
//   - North American: (201) 555-0123, 201-555-0123, 201.555.0123,
//     201 555 0123, with an optional leading 1 / +1
//   - trunk-prefixed national (UK, Australia, NZ, Ireland, India, Germany,
//     France): 0 then 9–10 more digits in two or three groups
// Excluded by shape: ISO and slash dates, times, decimals and percentages
// (a group touching '.5', ',5' or '%'), currency, thousands separators,
// ungrouped national digit runs (ids, timestamps, counts) and runs of
// numbers in a list ("100 250 500 1000").
// ---------------------------------------------------------------------------

import { CountryCode, parsePhoneNumberFromString } from 'libphonenumber-js/max'

// Not preceded by a word character or by anything that makes the digits part
// of a number, amount or path.
const BEFORE = String.raw`(?<![\w.,$€£¥₹%+/-])`
// Like BEFORE, but a + may also follow a phone cue word ("WhatsApp+1 …").
// Any other letter right before a + is code ("x+12015550123"), not a phone.
const BEFORE_PLUS = String.raw`(?:${BEFORE}|(?<=(?:whatsapp|phone|tel|call|text|mobile|cell|sms|number|contact)))`
// Not followed by more of a number, a percent sign or a word character.
const AFTER = String.raw`(?![\w%]|[.,]\d)`

const PATTERNS: {
  re: RegExp
  countries?: CountryCode[]
  minDigits?: number
}[] = [
  // +44 20 7946 0958, +1 (201) 555-0123, +15550100123, and spam-style
  // doubled separators: +1--(201)--555--01--23
  {
    re: new RegExp(
      String.raw`${BEFORE_PLUS}\+[1-9]\d{0,2}(?:[ .-]{0,3}\(?\d{1,4}\)?){1,5}[ .-]{0,3}\d{2,5}${AFTER}`,
      'gi'
    ),
  },
  // (201) 555-0123, 1-201-555-0123, 201.555.0123
  {
    re: new RegExp(
      String.raw`${BEFORE}(?:1[ .-]?)?(?:\(\d{3}\)[ .-]?|\d{3}[ .-])\d{3}[ .-]\d{4}${AFTER}`,
      'g'
    ),
    countries: ['US', 'CA'],
  },
  // 020 7946 0958, (020) 7946 0958, 020 79460958, 0491 570 006,
  // 01632 960 001, 01 42 68 53 00
  {
    re: new RegExp(
      String.raw`${BEFORE}(?:\(0\d{1,4}\)[ .-]?|0\d{1,4}[ .-])\d{2,8}(?:[ .-]\d{2,4}){0,3}${AFTER}`,
      'g'
    ),
    countries: ['GB', 'AU', 'NZ', 'IE', 'IN', 'DE', 'FR'],
    // real ones are 9-11 digits; 8 matched a data dump's "05 022430"
    minDigits: 9,
  },
]

// "+44.2079460958": a signed decimal, whatever its digits would dial
const SIGNED_DECIMAL_RE = /^\+?\d+[.,]\d+$/

function digitCount(s: string): number {
  return s.replace(/\D/g, '').length
}

// "100 250 500 1000": digits grouped only by spaces, next to another plain
// number, are a list, not a phone. (Dashes, dots or parens mark a phone even
// in a list: "201-555-0123, 201-555-0199".)
function inNumberRun(text: string, start: number, end: number): boolean {
  if (!/^\+?[\d ]+$/.test(text.slice(start, end))) return false
  const before = text.slice(0, start)
  const after = text.slice(end)
  return (
    /(?:^|[\s,;(])[\d.]+[ ,]{1,2}$/.test(before) ||
    /^[ ,]{1,2}[\d.]+(?:$|[\s,;)])/.test(after)
  )
}

function isValidPhone(
  candidate: string,
  countries?: CountryCode[],
  minDigits = 8
): boolean {
  const digits = digitCount(candidate)
  if (digits < minDigits || digits > 15) return false
  if (!countries) return !!parsePhoneNumberFromString(candidate)?.isValid()
  return countries.some((c) =>
    parsePhoneNumberFromString(candidate, c)?.isValid()
  )
}

/** Every phone number in `text`, as [start, end) spans, in order. */
export function findPhones(text: string): [number, number][] {
  if ((text.match(/\d/g)?.length ?? 0) < 8) return []
  const spans: [number, number][] = []
  for (const { re, countries, minDigits } of PATTERNS) {
    re.lastIndex = 0
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0
      const end = start + m[0].length
      if (spans.some(([s, e]) => start < e && end > s)) continue
      if (SIGNED_DECIMAL_RE.test(m[0]) || inNumberRun(text, start, end))
        continue
      if (isValidPhone(m[0], countries, minDigits)) spans.push([start, end])
    }
  }
  return spans.sort((a, b) => a[0] - b[0])
}

/** Replace each phone number in `text`; `onMatch` runs once per number. */
export function scrubPhones(
  text: string,
  replacement: string,
  onMatch: () => void
): string {
  const spans = findPhones(text)
  if (!spans.length) return text
  let out = ''
  let last = 0
  for (const [s, e] of spans) {
    out += text.slice(last, s) + replacement
    onMatch()
    last = e
  }
  return out + text.slice(last)
}
