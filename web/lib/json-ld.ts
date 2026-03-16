// Schema.org JSON-LD structured data builders.
// Accept only primitives — no imports from common/ types.
// See docs/structured-data-implementation-plan.md for full spec.

// ── Types ──────────────────────────────────────────────────────

export type MarketJsonLdInput = {
  question: string
  description: string // Pre-converted to plain text by caller
  url: string // Full URL: https://manifold.markets/user/slug
  creatorName: string
  creatorUsername: string
  createdTime: number // Epoch ms
  closeTime?: number
  resolutionTime?: number
  lastUpdatedTime?: number
  resolution?: string // 'YES' | 'NO' | 'MKT' | 'CANCEL'
  outcomeType: string
  probability?: number // Current prob for binary
  uniqueBettorCount: number
  answers?: Array<{ text: string; prob: number; resolution?: string }>
  coverImageUrl?: string
  visibility: string
  deleted?: boolean
}

export type PostJsonLdInput = {
  title: string
  body: string // Pre-converted to plain text
  url: string
  creatorName: string
  creatorUsername: string
  createdTime: number
  commentCount: number
  visibility: string
  comments: Array<{
    text: string
    authorName: string
    authorUsername: string
    createdTime: number
  }>
}

export type PersonJsonLdInput = {
  name: string
  username: string
  avatarUrl?: string
  bio?: string
  website?: string
  twitterHandle?: string
  createdTime: number
}

// ── Helpers ────────────────────────────────────────────────────

export function safeIsoDate(epochMs?: number): string | undefined {
  if (!epochMs || !Number.isFinite(epochMs) || epochMs <= 0) return undefined
  return new Date(epochMs).toISOString()
}

function formatHumanDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  const truncated = text.slice(0, maxLength)
  const lastSpace = truncated.lastIndexOf(' ')
  return (
    (lastSpace > maxLength * 0.8 ? truncated.slice(0, lastSpace) : truncated) +
    '...'
  )
}

function getVagueLabel(probability: number): string {
  const p = Math.max(0, Math.min(1, probability))
  if (p < 0.05) return 'Almost certainly not'
  if (p < 0.2) return 'Unlikely'
  if (p < 0.4) return 'Probably not'
  if (p < 0.6) return 'Roughly even odds'
  if (p < 0.8) return 'Likely'
  if (p < 0.95) return 'Very likely'
  return 'Almost certainly'
}

/** Unicode-escape <, >, & to prevent XSS in inline <script> tags.
 *  Matches the pattern Next.js uses for __NEXT_DATA__. */
export function sanitizeJsonLd(obj: object): string {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
}

function isValidHttpsUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:'
  } catch {
    return false
  }
}

const MANIFOLD_ORG = {
  '@type': 'Organization',
  name: 'Manifold Markets',
  url: 'https://manifold.markets',
}

const EXCLUDED_OUTCOME_TYPES = new Set([
  'STONK',
  'BOUNTIED_QUESTION',
  'POLL',
  'MULTI_NUMERIC',
  'DATE',
  'QUADRATIC_FUNDING',
])

const EXCLUDED_RESOLUTIONS = new Set(['MKT', 'CANCEL'])

// ── Builders ───────────────────────────────────────────────────

export function buildMarketQAPage(
  input: MarketJsonLdInput
): Record<string, unknown> | null {
  if (input.visibility !== 'public' || input.deleted) return null
  if (EXCLUDED_OUTCOME_TYPES.has(input.outcomeType)) return null
  if (input.resolution && EXCLUDED_RESOLUTIONS.has(input.resolution))
    return null

  const answerResult = formatMarketAnswer(input)
  if (!answerResult) return null

  const question: Record<string, unknown> = {
    '@type': 'Question',
    name: input.question,
    text: truncateText(input.description, 5000),
    url: input.url,
    datePublished: safeIsoDate(input.createdTime),
    dateModified: safeIsoDate(input.lastUpdatedTime),
    author: {
      '@type': 'Person',
      name: input.creatorName,
      url: `https://manifold.markets/${input.creatorUsername}`,
    },
    answerCount: 1,
    [answerResult.key]: answerResult.answer,
    interactionStatistic: {
      '@type': 'InteractionCounter',
      interactionType: 'https://schema.org/InteractAction',
      userInteractionCount: input.uniqueBettorCount,
    },
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'QAPage',
    mainEntity: question,
  }
}

function formatMarketAnswer(
  input: MarketJsonLdInput
): {
  key: 'suggestedAnswer' | 'acceptedAnswer'
  answer: Record<string, unknown>
} | null {
  const { outcomeType, resolution } = input
  const dateLabel = input.lastUpdatedTime
    ? formatHumanDate(input.lastUpdatedTime)
    : 'today'
  const isoDate = safeIsoDate(
    resolution ? input.resolutionTime : input.lastUpdatedTime
  )

  // Resolved binary
  if (
    outcomeType === 'BINARY' &&
    (resolution === 'YES' || resolution === 'NO')
  ) {
    const resolvedDate = input.resolutionTime
      ? formatHumanDate(input.resolutionTime)
      : 'unknown date'
    return {
      key: 'acceptedAnswer',
      answer: {
        '@type': 'Answer',
        text: `${
          resolution === 'YES' ? 'Yes' : 'No'
        } — resolved on ${resolvedDate} by Manifold Markets prediction market.`,
        datePublished: isoDate,
        author: MANIFOLD_ORG,
      },
    }
  }

  // Active binary
  if (outcomeType === 'BINARY' && !resolution) {
    if (input.probability == null) return null
    const p = Math.max(0, Math.min(1, input.probability))
    const pct = Math.round(p * 100)
    const label = getVagueLabel(p)
    return {
      key: 'suggestedAnswer',
      answer: {
        '@type': 'Answer',
        text: `${label} — Manifold Markets prediction market estimates a ${pct}% chance (${input.uniqueBettorCount.toLocaleString()} traders, as of ${dateLabel}).`,
        url: input.url,
        dateModified: isoDate,
        author: MANIFOLD_ORG,
      },
    }
  }

  // Resolved multi-choice
  if (outcomeType === 'MULTIPLE_CHOICE' && resolution) {
    const winner = input.answers?.find((a) => a.resolution === 'YES')
    if (!winner) return null
    const resolvedDate = input.resolutionTime
      ? formatHumanDate(input.resolutionTime)
      : 'unknown date'
    return {
      key: 'acceptedAnswer',
      answer: {
        '@type': 'Answer',
        text: `${winner.text} — resolved on ${resolvedDate} by Manifold Markets prediction market.`,
        datePublished: isoDate,
        author: MANIFOLD_ORG,
      },
    }
  }

  // Active multi-choice
  if (outcomeType === 'MULTIPLE_CHOICE' && !resolution) {
    const top3 = (input.answers ?? [])
      .filter((a) => !a.resolution)
      .sort((a, b) => b.prob - a.prob)
      .slice(0, 3)
    if (top3.length === 0) return null
    const names =
      top3.length === 1
        ? top3[0].text
        : top3.length === 2
        ? `${top3[0].text} and ${top3[1].text}`
        : `${top3[0].text}, followed by ${top3[1].text} and ${top3[2].text}`
    return {
      key: 'suggestedAnswer',
      answer: {
        '@type': 'Answer',
        text: `Per Manifold Markets prediction market, ${names} ${
          top3.length === 1 ? 'is' : 'are'
        } most likely. See the market for live updates (${input.uniqueBettorCount.toLocaleString()} traders, as of ${dateLabel}).`,
        url: input.url,
        dateModified: isoDate,
        author: MANIFOLD_ORG,
      },
    }
  }

  // Active pseudo-numeric / number
  if (
    (outcomeType === 'PSEUDO_NUMERIC' || outcomeType === 'NUMBER') &&
    !resolution
  ) {
    if (input.probability == null) return null
    return {
      key: 'suggestedAnswer',
      answer: {
        '@type': 'Answer',
        text: `The current median estimate is ${input.probability} according to Manifold Markets prediction market (as of ${dateLabel}).`,
        url: input.url,
        dateModified: isoDate,
        author: MANIFOLD_ORG,
      },
    }
  }

  // Resolved pseudo-numeric/number → skip
  return null
}

export function buildPostDiscussion(
  input: PostJsonLdInput
): Record<string, unknown> | null {
  if (input.visibility !== 'public') return null

  const comments = input.comments.slice(0, 5).map((c) => ({
    '@type': 'Comment',
    text: truncateText(c.text, 500),
    datePublished: safeIsoDate(c.createdTime),
    author: {
      '@type': 'Person',
      name: c.authorName,
      url: `https://manifold.markets/${c.authorUsername}`,
    },
  }))

  return {
    '@context': 'https://schema.org',
    '@type': 'DiscussionForumPosting',
    headline: input.title,
    text: truncateText(input.body, 5000),
    url: input.url,
    datePublished: safeIsoDate(input.createdTime),
    author: {
      '@type': 'Person',
      name: input.creatorName,
      url: `https://manifold.markets/${input.creatorUsername}`,
    },
    interactionStatistic: {
      '@type': 'InteractionCounter',
      interactionType: 'https://schema.org/CommentAction',
      userInteractionCount: input.commentCount,
    },
    ...(comments.length > 0 ? { comment: comments } : {}),
  }
}

export function buildPersonProfile(
  input: PersonJsonLdInput
): Record<string, unknown> | null {
  const sameAs: string[] = []
  if (input.twitterHandle) {
    sameAs.push(`https://twitter.com/${input.twitterHandle}`)
  }
  if (input.website && isValidHttpsUrl(input.website)) {
    sameAs.push(input.website)
  }

  const person: Record<string, unknown> = {
    '@type': 'Person',
    name: input.name,
    url: `https://manifold.markets/${input.username}`,
    identifier: input.username,
    alternateName: `@${input.username}`,
  }
  if (input.avatarUrl) person.image = input.avatarUrl
  if (input.bio) person.description = truncateText(input.bio, 500)
  if (sameAs.length > 0) person.sameAs = sameAs

  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    mainEntity: person,
  }
}

export function buildBreadcrumbs(
  items: Array<{ name: string; url?: string }>
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => {
      const element: Record<string, unknown> = {
        '@type': 'ListItem',
        position: i + 1,
        name: item.name,
      }
      // Per Google docs, last item should omit the `item` URL
      if (item.url) element.item = item.url
      return element
    }),
  }
}
