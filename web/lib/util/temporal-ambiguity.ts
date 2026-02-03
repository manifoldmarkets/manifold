// Detects ambiguous temporal prepositions before dates and suggests clearer alternatives

export type AmbiguousTemporalMatch = {
  original: string // The matched phrase, e.g., "by 2027"
  alternatives: {
    label: string // Display text, e.g., "before 2027"
    replacement: string // Replacement text (same as label for now)
  }[]
}

const MONTHS =
  'January|February|March|April|May|June|July|August|September|October|November|December'
const MONTHS_SHORT = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec'
const QUARTERS = 'Q1|Q2|Q3|Q4'

// Words that when followed by "by" indicate it's not a deadline
// e.g., "stand by", "go by", "pass by", "abide by", "judged by"
const BY_EXCLUSION_PREFIXES =
  /\b(stand|go|pass|drive|stop|sit|walk|run|come|abide|abided|judge|judged|measure|measured|guide|guided|set|live|lived|swear|swore|multiply|multiplied|divide|divided)\s+$/i

// Phrases starting with "by" that are not deadlines
const BY_EXCLUSION_SUFFIXES =
  /^by\s+(the\s+time|the\s+end|then|now|definition|design|default|nature|law|far|chance|accident|heart|name|hand|way|means)/i

// Words that follow "by [year]" indicating it's a comparison, not a deadline
// e.g., "by 2027 standards", "by 2027 dollars", "by 2027 metrics"
const COMPARATIVE_SUFFIXES =
  /^\s+(standards?|metrics?|levels?|prices?|dollars?|estimates?|projections?|numbers?|figures?|criteria|benchmarks?|measures?|rules?|norms?|values?|rates?|terms|definitions?)\b/i

// Already-clear phrases that don't need suggestions
const CLEAR_PHRASES =
  /\b(by\s+EOY|by\s+end\s+of|before\s+|after\s+|starting\s+|ending\s+|from\s+.*\s+to\s+)/i

type PatternConfig = {
  pattern: RegExp
  getAlternatives: (
    match: RegExpMatchArray
  ) => AmbiguousTemporalMatch['alternatives']
}

const patterns: PatternConfig[] = [
  // "by [year]" - e.g., "by 2027"
  {
    pattern: /\bby\s+(20\d{2})\b/gi,
    getAlternatives: (match) => {
      const year = match[1]
      return [
        { label: `before ${year}`, replacement: `before ${year}` },
        { label: `by EOY ${year}`, replacement: `by EOY ${year}` },
      ]
    },
  },

  // "by [month] [year]" - e.g., "by January 2027" or "by Jan 2027"
  {
    pattern: new RegExp(
      `\\bby\\s+((?:${MONTHS}|${MONTHS_SHORT})\\s+20\\d{2})\\b`,
      'gi'
    ),
    getAlternatives: (match) => {
      const dateStr = match[1]
      return [
        { label: `before ${dateStr}`, replacement: `before ${dateStr}` },
        {
          label: `by end of ${dateStr}`,
          replacement: `by end of ${dateStr}`,
        },
      ]
    },
  },

  // "by [quarter] [year]" - e.g., "by Q2 2027"
  {
    pattern: new RegExp(`\\bby\\s+((${QUARTERS})\\s+20\\d{2})\\b`, 'gi'),
    getAlternatives: (match) => {
      const dateStr = match[1]
      return [
        { label: `before ${dateStr}`, replacement: `before ${dateStr}` },
        {
          label: `by end of ${dateStr}`,
          replacement: `by end of ${dateStr}`,
        },
      ]
    },
  },

  // "by [month]" without year - e.g., "by January"
  {
    pattern: new RegExp(
      `\\bby\\s+(${MONTHS}|${MONTHS_SHORT})\\b(?!\\s+20)`,
      'gi'
    ),
    getAlternatives: (match) => {
      const month = match[1]
      return [
        { label: `before ${month}`, replacement: `before ${month}` },
        {
          label: `by end of ${month}`,
          replacement: `by end of ${month}`,
        },
      ]
    },
  },

  // "until [year]" - e.g., "until 2027"
  {
    pattern: /\buntil\s+(20\d{2})\b/gi,
    getAlternatives: (match) => {
      const year = match[1]
      return [
        { label: `before ${year}`, replacement: `before ${year}` },
        { label: `through ${year}`, replacement: `through ${year}` },
      ]
    },
  },

  // "until [month] [year]" - e.g., "until January 2027"
  {
    pattern: new RegExp(
      `\\buntil\\s+((?:${MONTHS}|${MONTHS_SHORT})\\s+20\\d{2})\\b`,
      'gi'
    ),
    getAlternatives: (match) => {
      const dateStr = match[1]
      return [
        { label: `before ${dateStr}`, replacement: `before ${dateStr}` },
        { label: `through ${dateStr}`, replacement: `through ${dateStr}` },
      ]
    },
  },

  // "through [year]" - e.g., "through 2027"
  {
    pattern: /\bthrough\s+(20\d{2})\b/gi,
    getAlternatives: (match) => {
      const year = match[1]
      return [
        { label: `during ${year}`, replacement: `during ${year}` },
        { label: `by EOY ${year}`, replacement: `by EOY ${year}` },
      ]
    },
  },

  // "within [year]" - e.g., "within 2027"
  {
    pattern: /\bwithin\s+(20\d{2})\b/gi,
    getAlternatives: (match) => {
      const year = match[1]
      return [
        { label: `during ${year}`, replacement: `during ${year}` },
        { label: `by EOY ${year}`, replacement: `by EOY ${year}` },
      ]
    },
  },

  // "around [month] [year]" - e.g., "around March 2027"
  {
    pattern: new RegExp(
      `\\baround\\s+((?:${MONTHS}|${MONTHS_SHORT})\\s+20\\d{2})\\b`,
      'gi'
    ),
    getAlternatives: (match) => {
      const dateStr = match[1]
      return [
        { label: `in early ${dateStr}`, replacement: `in early ${dateStr}` },
        { label: `in late ${dateStr}`, replacement: `in late ${dateStr}` },
      ]
    },
  },

  // "around [year]" - e.g., "around 2027"
  {
    pattern: /\baround\s+(20\d{2})\b/gi,
    getAlternatives: (match) => {
      const year = match[1]
      return [
        { label: `in early ${year}`, replacement: `in early ${year}` },
        { label: `in late ${year}`, replacement: `in late ${year}` },
      ]
    },
  },
]

/**
 * Detects ambiguous temporal prepositions in text.
 * Returns array of matches with suggested alternatives.
 */
export function detectAmbiguousTemporalPhrases(
  text: string
): AmbiguousTemporalMatch[] {
  // Skip if text contains already-clear phrases that would overlap
  if (CLEAR_PHRASES.test(text)) {
    // Still check, but the clear phrase matching will handle exclusions below
  }

  const matches: AmbiguousTemporalMatch[] = []
  const seen = new Set<string>()

  for (const { pattern, getAlternatives } of patterns) {
    // Reset regex state
    pattern.lastIndex = 0

    let match
    while ((match = pattern.exec(text)) !== null) {
      const original = match[0]
      const matchIndex = match.index

      // Skip if we've already matched this phrase
      if (seen.has(original.toLowerCase())) continue

      // Check for exclusion prefixes (e.g., "stand by")
      const textBefore = text.slice(0, matchIndex)
      if (BY_EXCLUSION_PREFIXES.test(textBefore)) continue

      // Check for exclusion suffixes (e.g., "by the time")
      const textFromMatch = text.slice(matchIndex)
      if (BY_EXCLUSION_SUFFIXES.test(textFromMatch)) continue

      // Check for comparative suffixes (e.g., "by 2027 standards")
      const textAfterMatch = text.slice(matchIndex + original.length)
      if (COMPARATIVE_SUFFIXES.test(textAfterMatch)) continue

      // Check if this phrase is part of an already-clear phrase
      // Look at context around the match
      const contextStart = Math.max(0, matchIndex - 15)
      const contextEnd = Math.min(
        text.length,
        matchIndex + original.length + 15
      )
      const context = text.slice(contextStart, contextEnd)
      if (CLEAR_PHRASES.test(context)) continue

      seen.add(original.toLowerCase())
      matches.push({
        original,
        alternatives: getAlternatives(match),
      })
    }
  }

  return matches
}
