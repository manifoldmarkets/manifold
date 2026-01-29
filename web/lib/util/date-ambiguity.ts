// Detects ambiguous date formats in text and suggests clearer alternatives

export type AmbiguousDateMatch = {
  original: string
  interpretation1: string // Assuming first number is day
  interpretation2: string // Assuming first number is month
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function formatDate(day: number, month: number, year: number): string {
  return `${day} ${MONTHS[month - 1]} ${year}`
}

function normalizeYear(yearStr: string): number {
  const year = parseInt(yearStr.replace(/^'/, ''), 10)
  if (year < 100) {
    // 2-digit year: assume 2000s for now (00-99 -> 2000-2099)
    return 2000 + year
  }
  return year
}

function isValidDay(n: number): boolean {
  return n >= 1 && n <= 31
}

function isValidMonth(n: number): boolean {
  return n >= 1 && n <= 12
}

function isAmbiguous(a: number, b: number): boolean {
  // Both numbers could be either day or month
  return isValidMonth(a) && isValidMonth(b) && isValidDay(a) && isValidDay(b)
}

function isYearLike(s: string): boolean {
  const cleaned = s.replace(/^'/, '')
  // 4 digits starting with 19 or 20, or 2 digits
  return /^(19|20)\d{2}$/.test(cleaned) || /^\d{2}$/.test(cleaned)
}

/**
 * Detects ambiguous date patterns in text.
 * Returns array of matches with both possible interpretations.
 */
export function detectAmbiguousDates(text: string): AmbiguousDateMatch[] {
  const matches: AmbiguousDateMatch[] = []

  // Pattern: 3 numbers separated by common delimiters (-, /, ., space, comma)
  // Also handles ordinal suffixes (1st, 2nd, 3rd, 4th, etc.)
  // Also handles apostrophe years ('26)
  const pattern =
    /\b(\d{1,4})(?:st|nd|rd|th)?[-/.,\s](\d{1,2})(?:st|nd|rd|th)?[-/.,\s]('?\d{2,4})\b/gi

  // Also check compact formats (no separators): 01042026 (DDMMYYYY)
  // Note: YYYYMMDD is ISO 8601 basic format and unambiguous, so we don't check it
  const patternCompact = /\b(\d{2})(\d{2})((?:19|20)\d{2})\b/g

  let match

  // Standard patterns (D-M-Y or M-D-Y)
  while ((match = pattern.exec(text)) !== null) {
    const [original, first, second, third] = match
    const firstNum = parseInt(first, 10)
    const secondNum = parseInt(second, 10)

    // Only flag as ambiguous if the year is LAST (D-M-Y or M-D-Y formats)
    // Year-first formats (Y-M-D) are unambiguous - no region uses year-day-month
    // Check if first is a 4-digit year (YYYY) - if so, skip (it's year-first and unambiguous)
    const firstIs4DigitYear = /^(19|20)\d{2}$/.test(first)
    if (isYearLike(third) && !firstIs4DigitYear) {
      const year = normalizeYear(third)
      // first and second are day/month candidates
      if (isAmbiguous(firstNum, secondNum)) {
        matches.push({
          original,
          interpretation1: formatDate(firstNum, secondNum, year), // first=day, second=month
          interpretation2: formatDate(secondNum, firstNum, year), // first=month, second=day
        })
      }
    }
    // Skip year-first patterns - they're always unambiguous (YYYY-MM-DD, YYYY/MM/DD, etc.)
  }

  // Year-first patterns (Y-M-D) - these are ALWAYS unambiguous
  // When a 4-digit year comes first, it's universally understood as year-month-day (ISO order)
  // No region uses year-day-month format, so we skip all year-first dates
  // This applies to: 2025-10-12, 2025/10/12, 2025.10.12, etc.

  // Compact format: DDMMYYYY
  while ((match = patternCompact.exec(text)) !== null) {
    const [original, first, second, yearStr] = match
    const firstNum = parseInt(first, 10)
    const secondNum = parseInt(second, 10)
    const year = parseInt(yearStr, 10)

    if (isAmbiguous(firstNum, secondNum)) {
      matches.push({
        original,
        interpretation1: formatDate(firstNum, secondNum, year),
        interpretation2: formatDate(secondNum, firstNum, year),
      })
    }
  }

  // Compact format: YYYYMMDD - this is ISO 8601 basic format, unambiguous (always year-month-day)
  // So we skip flagging these as ambiguous

  // Deduplicate by original string
  const seen = new Set<string>()
  return matches.filter((m) => {
    if (seen.has(m.original)) return false
    seen.add(m.original)
    return true
  })
}
