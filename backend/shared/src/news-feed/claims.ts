import { createHash } from 'crypto'
import { uniqBy } from 'lodash'
import {
  NEWS_SPEAKER_KINDS,
  NewsArticle,
  NewsClaim,
  NewsClaimsStatus,
  NewsMarketDraft,
  NewsSpeakerKind,
  NewsStory,
} from 'common/news-feed'
import { mapAsync } from 'common/util/promise'
import { DAY_MS, MINUTE_MS } from 'common/util/time'
import { generateEmbeddings } from 'shared/helpers/openai-utils'
import { aiModels, promptAI } from 'shared/helpers/prompt-ai'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import {
  fetchArticleIndex,
  IndexedArticle,
  isGNewsEnabled,
  readableOutlet,
  readArticle,
  searchGNews,
} from './articles'
import {
  Candidate,
  cosine,
  describeMarket,
  findCandidateMarkets,
  withTimeout,
} from './markets'
import { hostnameOf, isAggregatorLink } from './sources'

/**
 * Claims: short verbatim excerpts from a story's article that a market could
 * test, each with the market that tests it or a draft for one.
 *
 * 1. Find the article: an indexed outlet's own piece on the story, matched by
 *    embedding (or the story's own link when it is to an outlet we read).
 * 2. Read its body and ask the model for every forward-looking, checkable
 *    claim, copied exactly, with who made it, and a draft market that asks
 *    exactly what the claim asserts. Excerpts that are not verbatim in the
 *    body are dropped, as are drafts the model calls narrower or broader
 *    than the claim, and claims that cannot settle on public evidence.
 * 3. Look up the markets nearest each claim and ask which, if any, resolves
 *    on the same proposition. That market is shown beside the claim; the
 *    near misses are offered for reuse while drafting.
 *
 * Nothing is created: drafts wait for a reader to review and publish them.
 */

/** Bump to read every article again after changing the prompts. */
const CLAIMS_VERSION = 4

export type ClaimsMemo = {
  claimsVersion?: number
  article?: NewsArticle
  /** The provider the article came from, for the evaluation. */
  articleProvider?: IndexedArticle['provider']
  /** Article urls that failed to load or turned out to be another story. */
  articleRejected?: string[]
  articleCheckedAt?: number
  claims?: NewsClaim[]
  claimsStatus?: NewsClaimsStatus
  claimsAt?: number
}

type StoryRef = {
  story: NewsStory
  memo: ClaimsMemo & { embedding?: number[] }
}

/** An article on the same story, by embedding of its title and standfirst
 * against the story's. Merging stories uses 0.82 on headlines alone. */
const ARTICLE_MATCH_SIMILARITY = 0.75
/** How far an article's time may be from the story's. */
const ARTICLE_WINDOW_MS = 2 * DAY_MS
/** Look for an article again after this long, as outlets publish. */
const ARTICLE_RECHECK_MS = 30 * MINUTE_MS
/** Articles read per refresh, so a refresh stays a few minutes long. */
const CLAIMS_PER_REFRESH = 60
const CLAIMS_CONCURRENCY = 4
const EMBED_CONCURRENCY = 6
const EXTRACT_TIMEOUT_MS = 150_000
const MATCH_TIMEOUT_MS = 90_000
const CANDIDATES_PER_CLAIM = 8
/** Excerpts are short quotes, not passages. */
const MIN_EXCERPT_WORDS = 6
const MAX_EXCERPT_WORDS = 60
/** A guard against runaway output, not a product limit: articles rarely
 * hold more than a handful of claims that qualify. */
const MAX_CLAIMS = 30
const MAX_REJECTED = 6

/** Article embeddings by url, for the life of the process. */
const articleEmbeddings = new Map<string, number[]>()

/** Articles chosen but not yet read, by story id. In memory only: after a
 * restart a story still marked pending looks for its article again. */
const pendingArticles = new Map<string, IndexedArticle>()

const claimIdFor = (storyId: string, excerpt: string) =>
  createHash('sha1')
    .update(`${storyId}|${normalise(excerpt)}`)
    .digest('hex')
    .slice(0, 12)

// Quote marks, dashes and spaces differ between a page and a model's copy
// of it; compare on a normalised form and keep the article's own characters.
const normaliseChar = (c: string) =>
  /[‘’‚‛′`]/.test(c)
    ? "'"
    : /[“”„‟″]/.test(c)
    ? '"'
    : /[‐-―−]/.test(c)
    ? '-'
    : /\s/.test(c)
    ? ' '
    : c

const normalise = (s: string) =>
  [...s.trim()].map(normaliseChar).join('').replace(/ {2,}/g, ' ')

/** The article's own text for an excerpt, or undefined when the excerpt is
 * not word for word in the body. */
export function findVerbatim(body: string, excerpt: string) {
  const map: number[] = []
  let flat = ''
  for (let i = 0; i < body.length; i++) {
    const c = normaliseChar(body[i])
    if (c === ' ' && (flat.length === 0 || flat.endsWith(' '))) continue
    flat += c
    map.push(i)
  }
  const target = normalise(excerpt)
  // The model may wrap a quote in marks the article does not repeat there.
  const unwrapped = target.replace(/^["']+|["']+$/g, '').trim()
  for (const t of [target, unwrapped]) {
    if (t.length < 20) continue
    const at = flat.indexOf(t)
    if (at < 0) continue
    // A passage that appears twice could be either speaker's, and the
    // "read in context" link would land on the first; drop it.
    if (flat.indexOf(t, at + 1) >= 0) return undefined
    return body.slice(map[at], map[at + t.length - 1] + 1)
  }
  return undefined
}

const asString = (x: unknown, max = 600) =>
  typeof x === 'string' && x.trim() ? x.trim().slice(0, max) : undefined

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length

/** Questions that ask about the article rather than the world. */
const META_QUESTION =
  /\b(this|the) (article|report|story|claim|statement)\b|\bproven (right|wrong|true|false)\b|\bbe (true|accurate|correct)\b/i

type RawDraft = {
  question?: unknown
  yesMeansClaimTrue?: unknown
  criteria?: unknown
  definitions?: unknown
  closeDate?: unknown
  resolution?: unknown
  evidence?: unknown
  scope?: unknown
}

type RawClaim = {
  excerpt?: unknown
  speaker?: unknown
  speakerRole?: unknown
  speakerKind?: unknown
  proposition?: unknown
  resolvable?: unknown
  draft?: RawDraft
}

/** A draft we would put in front of a reader, or undefined. */
function validDraft(raw: RawDraft | undefined, now: number) {
  if (!raw || raw.scope !== 'same') return undefined
  // A question whose YES means the claim failed would put an inverted price
  // beside the quote.
  if (raw.yesMeansClaimTrue !== true) return undefined
  const question = asString(raw.question, 220)
  const criteria = asString(raw.criteria, 1500)
  const closeDate = asString(raw.closeDate, 20)
  if (!question || !criteria || !closeDate) return undefined
  if (!question.endsWith('?') || question.length < 15) return undefined
  if (META_QUESTION.test(question)) return undefined
  if (criteria.length < 40) return undefined
  if (!/^\d{4}-\d{2}-\d{2}$/.test(closeDate)) return undefined
  const closeTime = Date.parse(`${closeDate}T23:59:00Z`)
  if (
    !Number.isFinite(closeTime) ||
    closeTime < now + 2 * DAY_MS ||
    closeTime > now + 3 * 365 * DAY_MS
  )
    return undefined
  const evidence = (Array.isArray(raw.evidence) ? raw.evidence : [])
    .flatMap((e): NewsMarketDraft['evidence'] => {
      const rec = (e ?? {}) as Record<string, unknown>
      const name = asString(rec.name, 120)
      if (!name) return []
      const url = asString(rec.url, 400)
      return [
        { name, url: url && /^https:\/\/[^\s]+$/.test(url) ? url : undefined },
      ]
    })
    .slice(0, 6)
  // A market nobody can check is not one we offer.
  if (evidence.length === 0) return undefined
  const definitions = (Array.isArray(raw.definitions) ? raw.definitions : [])
    .flatMap((d): NewsMarketDraft['definitions'] => {
      const rec = (d ?? {}) as Record<string, unknown>
      const term = asString(rec.term, 80)
      const meaning = asString(rec.meaning, 400)
      return term && meaning ? [{ term, meaning }] : []
    })
    .slice(0, 6)
  return {
    question,
    criteria,
    definitions,
    closeTime,
    resolution:
      asString(raw.resolution, 400) ??
      'Resolves within 7 days of the close date, using the sources listed.',
    evidence,
  } satisfies NewsMarketDraft
}

type ExtractedClaim = {
  excerpt: string
  speaker: string
  speakerRole?: string
  speakerKind: NewsSpeakerKind
  proposition: string
  draft?: NewsMarketDraft
}

async function extractClaims(
  story: NewsStory,
  article: IndexedArticle,
  body: string,
  now: number
): Promise<{ sameEvent: boolean; claims: ExtractedClaim[] }> {
  const day = (t: number) => new Date(t).toISOString().slice(0, 10)
  const prompt = `You read news articles and find the claims in them that a prediction market could test.

Today is ${day(now)}.
Story: ${story.headline}${
    story.summary && story.summary !== story.headline
      ? `\nContext: ${story.summary}`
      : ''
  }
Article: "${article.title}" (${article.publisher}, ${day(
    article.publishedTime
  )})

Article text:
"""
${body}
"""

First decide whether the article reports on the same story. If it does not, return {"sameEvent": false, "claims": []}.

Otherwise find every claim that someone could bet on: a prediction, expectation, plan, promise, warning or forecast about something that will or will not happen, or a statement whose truth a future public event will settle. Include claims by people the article quotes and claims the article makes in its own voice.

For each claim return:
- "excerpt": the claim exactly as it appears in the article text, copied character for character as one continuous passage of ${MIN_EXCERPT_WORDS} to 45 words. Never paraphrase, shorten with an ellipsis, correct, or join separate passages. If the claim is a direct quote, copy the quoted words. Choose the passage so it makes sense to a reader who sees only it: when the claim leans on the sentence before ("The vote is now likely next week"), start from that sentence instead, still one continuous passage.
- "speaker": who makes the claim: the person's name, the organisation, or "${
    article.publisher
  }" when it is the article's own statement.
- "speakerRole": the speaker's role as the article gives it ("Ukraine's president", "chief economist at ING"), or "".
- "speakerKind": one of ${NEWS_SPEAKER_KINDS.join(
    ', '
  )}. Use "author" for the article's own voice.
- "proposition": one plain sentence saying what the claim says will happen or be true, keeping every number, threshold, place and date.
- "resolvable": true only if a yes/no market could settle exactly this claim from public evidence by a specific date without inventing definitions. False for vague claims ("things will get worse"), claims that need a private investigation or insider knowledge, opinions and value judgments, claims already settled when the article was written, and point forecasts with no direction or threshold ("growth of 1.1%" is not resolvable; "growth of at least 1.1%" is).
- "draft": only when resolvable, a market that asks exactly what the claim asserts:
  - "question": a standalone yes/no question that someone who never read the article understands. Name the people, places and event in full; include the threshold and the deadline. Phrase it so that YES means the claim comes true: for "X is out for the season" ask "Will X miss the rest of the season?", not "Will X play again?".
  - "yesMeansClaimTrue": true when a YES resolution means the claim came true.
  - "criteria": when it resolves YES and when NO, and what happens if the outcome is unclear or the event is cancelled.
  - "definitions": [{"term": "", "meaning": ""}] for any term that needs pinning down, using common usage or the article. Never invent specifics the claim does not contain; if the claim needs them, it is not resolvable.
  - "closeDate": "YYYY-MM-DD": the claim's own deadline when it has one, otherwise the earliest date by which the claim would clearly have come true, within two years.
  - "resolution": when and how it resolves after it closes.
  - "evidence": [{"name": "", "url": ""}] public sources anyone can check: official sites, results pages, major outlets. Give a url only when you are sure of it, else "".
  - "scope": "same" when the question tests exactly the claim, "narrower" or "broader" when it does not.

Do not include:
- facts the article reports as already having happened (casualty counts so far, votes already held, prices already reached);
- routine scheduling that is all but certain to go ahead as planned (an episode airing, a hearing date, a product shipping), unless the article treats it as in doubt;
- claims about the article or its accuracy;
- the same claim twice.

Return only JSON: {"sameEvent": true, "claims": [...]}. An empty list is a fine answer.`

  const res = await withTimeout(
    promptAI<{ sameEvent?: unknown; claims?: unknown }>(prompt, {
      model: aiModels.flash,
      parseAsJson: true,
      thinkingLevel: 'medium',
    }),
    EXTRACT_TIMEOUT_MS
  )
  if (!res) throw new Error('claim extraction timed out')
  if (res.sameEvent === false) return { sameEvent: false, claims: [] }

  const raw = (Array.isArray(res.claims) ? res.claims : []) as RawClaim[]
  const claims: ExtractedClaim[] = []
  let notVerbatim = 0
  for (const r of raw) {
    const said = asString(r.excerpt, 800)
    const speaker = asString(r.speaker, 120)
    if (!said || !speaker) continue
    const excerpt = findVerbatim(body, said)
    if (!excerpt) {
      notVerbatim++
      continue
    }
    const words = wordCount(excerpt)
    if (words < MIN_EXCERPT_WORDS || words > MAX_EXCERPT_WORDS) continue
    const kind = asString(r.speakerKind, 20) as NewsSpeakerKind | undefined
    claims.push({
      excerpt,
      speaker,
      speakerRole: asString(r.speakerRole, 120),
      speakerKind: kind && NEWS_SPEAKER_KINDS.includes(kind) ? kind : 'other',
      proposition: asString(r.proposition, 400) ?? excerpt,
      draft: r.resolvable === true ? validDraft(r.draft, now) : undefined,
    })
  }
  if (notVerbatim > 0)
    log('news-feed: dropped claims that were not verbatim', {
      storyId: story.id,
      notVerbatim,
      kept: claims.length,
    })
  return {
    sameEvent: true,
    claims: uniqBy(claims, (c) => normalise(c.excerpt)).slice(0, MAX_CLAIMS),
  }
}

type MatchVerdict = { direct?: string; similar: string[] }

/** Which candidate, if any, resolves on the same proposition as each claim. */
async function matchClaims(
  claims: ExtractedClaim[],
  candidates: Candidate[][]
): Promise<MatchVerdict[]> {
  const withCandidates = claims
    .map((c, i) => ({ c, i, list: candidates[i] }))
    .filter((x) => x.list.length > 0)
  const verdicts: MatchVerdict[] = claims.map(() => ({ similar: [] }))
  if (withCandidates.length === 0) return verdicts

  const blocks = withCandidates
    .map(
      ({ c, i, list }) =>
        `Claim ${i + 1}: ${c.proposition}\nQuoted: "${
          c.excerpt
        }"\nCandidates:\n${list
          .map((m) => `- ${describeMarket(m.contract)}`)
          .join('\n')}`
    )
    .join('\n\n')
  const prompt = `You check whether markets on Manifold, a prediction market, already test claims made in a news article.

A market is a DIRECT match for a claim only when its resolution turns on the same proposition: the same event and actors, with a threshold and deadline under which the market's probability is an estimate of whether the claim comes true. A claim with no deadline can be matched by a market on the same event with a reasonable deadline. A market on a related outcome, a different threshold or date, or a broader or narrower question is NOT a direct match. List it under "similar" when someone writing a market for this claim should see it first.

${blocks}

Return only JSON: {"results": [{"claim": 1, "direct": "<id or null>", "similar": ["<id>"]}]}
At most one direct id and at most three similar ids per claim, best first. Leave a claim out when no candidate fits.`

  const res = await withTimeout(
    promptAI<{ results?: unknown }>(prompt, {
      model: aiModels.flash,
      parseAsJson: true,
      thinkingLevel: 'low',
    }),
    MATCH_TIMEOUT_MS
  )
  if (!res) throw new Error('claim matching timed out')
  for (const r of (Array.isArray(res.results) ? res.results : []) as {
    claim?: unknown
    direct?: unknown
    similar?: unknown
  }[]) {
    const i = typeof r.claim === 'number' ? r.claim - 1 : -1
    if (!candidates[i]) continue
    const allowed = new Set(candidates[i].map((m) => m.contract.id))
    const direct =
      typeof r.direct === 'string' && allowed.has(r.direct)
        ? r.direct
        : undefined
    const similar = (Array.isArray(r.similar) ? r.similar : [])
      .filter((x): x is string => typeof x === 'string' && allowed.has(x))
      .filter((x) => x !== direct)
      .slice(0, 3)
    verdicts[i] = { direct, similar: [...new Set(similar)] }
  }
  return verdicts
}

/** Read one article's claims and match them. */
async function readClaims(
  pg: SupabaseDirectClient,
  story: NewsStory,
  article: IndexedArticle,
  body: string,
  now: number
) {
  const extracted = await extractClaims(story, article, body, now)
  if (!extracted.sameEvent || extracted.claims.length === 0)
    return { sameEvent: extracted.sameEvent, claims: [] as NewsClaim[] }

  const candidates = await mapAsync(
    extracted.claims,
    async (c) => {
      const embedding = await generateEmbeddings(c.proposition)
      if (!embedding) return [] as Candidate[]
      return findCandidateMarkets(pg, embedding, CANDIDATES_PER_CLAIM)
    },
    3
  )
  const verdicts = await matchClaims(extracted.claims, candidates)

  const claims: NewsClaim[] = []
  extracted.claims.forEach((c, i) => {
    const v = verdicts[i]
    // A claim earns a place by having a market that tests it, or a draft
    // a reader could publish. Anything else is just a quote.
    if (!v.direct && !c.draft) return
    claims.push({
      id: claimIdFor(story.id, c.excerpt),
      excerpt: c.excerpt,
      speaker: c.speaker,
      speakerRole: c.speakerRole,
      speakerKind: c.speakerKind,
      matchId: v.direct,
      matchBy: v.direct ? 'ai' : undefined,
      draft: v.direct ? undefined : c.draft,
      similarIds: v.similar,
    })
  })
  return { sameEvent: true, claims }
}

const toArticle = (
  a: IndexedArticle,
  page: { image?: string; title?: string }
): NewsArticle => ({
  url: a.url,
  // A link from the story itself carries no headline of its own; the
  // page's title is the outlet's.
  title: a.ownLink && page.title ? page.title : a.title,
  publisher: a.publisher,
  site: a.site,
  publishedTime: a.publishedTime,
  image: page.image ?? a.image,
})

/** An article from the story's own links, when one is to an outlet we read
 * (the Wikipedia portal cites outlets directly). */
function ownArticle(story: NewsStory): IndexedArticle | undefined {
  for (const s of story.sources) {
    if (isAggregatorLink(s.url)) continue
    const outlet = readableOutlet(s.url)
    if (!outlet) continue
    return {
      url: s.url,
      title: story.headline,
      publisher: outlet.publisher,
      site: outlet.site,
      publishedTime: story.publishedTime,
      provider: 'rss',
      ownLink: true,
    }
  }
  return undefined
}

/**
 * Give linked stories an article and read its claims. Bounded per refresh;
 * memos carry the results forward. Returns the contract ids the claims
 * reference, for the caller to load.
 */
export async function findArticlesAndClaims(
  pg: SupabaseDirectClient,
  refs: StoryRef[],
  now: number
) {
  // Claims read with older prompts are read again.
  for (const r of refs) {
    if (r.memo.claimsStatus && r.memo.claimsVersion !== CLAIMS_VERSION) {
      r.memo.claimsStatus = undefined
      r.memo.claims = undefined
      r.memo.article = undefined
      r.memo.articleCheckedAt = 0
      r.memo.claimsVersion = CLAIMS_VERSION
    }
  }

  // 1. Stories still looking for an article.
  const looking = refs.filter((r) => {
    if (!r.memo.embedding) return false
    const status = r.memo.claimsStatus
    // Pending from before a restart: the chosen article was not kept.
    if (status === 'pending') return !pendingArticles.has(r.story.id)
    return (
      (status === undefined || status === 'no-article') &&
      now - (r.memo.articleCheckedAt ?? 0) > ARTICLE_RECHECK_MS
    )
  })
  if (looking.length > 0) {
    let index: IndexedArticle[] = []
    try {
      index = await fetchArticleIndex(now)
    } catch (e) {
      log.warn('news-feed: article index failed', {
        error: e instanceof Error ? e.message : String(e),
      })
    }
    const fresh = index.filter((a) => !articleEmbeddings.has(a.url))
    await mapAsync(
      fresh,
      async (a) => {
        const e = await generateEmbeddings(
          a.description ? `${a.title}. ${a.description}` : a.title
        )
        if (e) articleEmbeddings.set(a.url, e)
      },
      EMBED_CONCURRENCY
    )

    const best: number[] = []
    for (const r of looking) {
      r.memo.articleCheckedAt = now
      const rejected = new Set(r.memo.articleRejected ?? [])
      const own = ownArticle(r.story)
      let pick: IndexedArticle | undefined =
        own && !rejected.has(own.url) ? own : undefined
      if (!pick && r.memo.embedding) {
        let top: { a: IndexedArticle; sim: number } | undefined
        for (const a of index) {
          if (rejected.has(a.url)) continue
          if (
            Math.abs(a.publishedTime - r.story.updatedTime) > ARTICLE_WINDOW_MS
          )
            continue
          const e = articleEmbeddings.get(a.url)
          if (!e) continue
          const sim = cosine(r.memo.embedding, e)
          if (!top || sim > top.sim) top = { a, sim }
        }
        if (top) best.push(top.sim)
        if (top && top.sim >= ARTICLE_MATCH_SIMILARITY) pick = top.a
      }
      if (!pick && isGNewsEnabled()) {
        try {
          const found = await searchGNews(r.story.headline, r.story.updatedTime)
          pick = found.find((a) => !rejected.has(a.url))
        } catch (e) {
          log.warn('news-feed: gnews search failed', {
            storyId: r.story.id,
            error: e instanceof Error ? e.message : String(e),
          })
        }
      }
      if (pick) {
        pendingArticles.set(r.story.id, pick)
        r.memo.claimsStatus = 'pending'
      } else {
        r.memo.claimsStatus = 'no-article'
      }
      r.memo.claimsVersion = CLAIMS_VERSION
    }
    log('news-feed: articles matched', {
      looking: looking.length,
      indexed: index.length,
      pending: looking.filter((r) => r.memo.claimsStatus === 'pending').length,
      // Nearest article similarity per story, to tune the threshold.
      nearest: {
        over85: best.filter((s) => s >= 0.85).length,
        over80: best.filter((s) => s >= 0.8).length,
        over78: best.filter((s) => s >= 0.78).length,
        over75: best.filter((s) => s >= 0.75).length,
        over70: best.filter((s) => s >= 0.7).length,
      },
    })
  }

  // 2. Read the articles waiting, newest stories first.
  const toRead = refs
    .filter(
      (r) =>
        r.memo.claimsStatus === 'pending' && pendingArticles.has(r.story.id)
    )
    .sort((a, b) => b.story.updatedTime - a.story.updatedTime)
    .slice(0, CLAIMS_PER_REFRESH)
  let read = 0
  let failed = 0
  await mapAsync(
    toRead,
    async (r) => {
      const article = pendingArticles.get(r.story.id)
      if (!article) return
      const reject = () => {
        r.memo.articleRejected = [
          ...(r.memo.articleRejected ?? []),
          article.url,
        ].slice(-MAX_REJECTED)
        r.memo.claimsStatus = 'no-article'
        // Try the next best article on the next refresh.
        r.memo.articleCheckedAt = 0
        pendingArticles.delete(r.story.id)
      }
      try {
        const body = await readArticle(article)
        if (!body) {
          failed++
          reject()
          return
        }
        const result = await readClaims(pg, r.story, article, body.text, now)
        if (!result.sameEvent) {
          reject()
          return
        }
        r.memo.article = toArticle(article, body)
        r.memo.articleProvider = article.provider
        r.memo.claims = result.claims
        r.memo.claimsStatus = result.claims.length > 0 ? 'found' : 'none'
        r.memo.claimsAt = now
        r.memo.claimsVersion = CLAIMS_VERSION
        pendingArticles.delete(r.story.id)
        read++
      } catch (e) {
        failed++
        log.warn('news-feed: reading claims failed', {
          storyId: r.story.id,
          url: article.url,
          error: e instanceof Error ? e.message : String(e),
        })
        reject()
      }
    },
    CLAIMS_CONCURRENCY
  )
  if (toRead.length > 0)
    log('news-feed: claims read', {
      read,
      failed,
      withClaims: toRead.filter((r) => r.memo.claimsStatus === 'found').length,
      claims: toRead.reduce((n, r) => n + (r.memo.claims?.length ?? 0), 0),
      hostnames: [
        ...new Set(toRead.map((r) => hostnameOf(r.memo.article?.url ?? ''))),
      ].filter(Boolean),
    })

  return [
    ...new Set(
      refs.flatMap((r) =>
        (r.memo.claims ?? []).flatMap((c) => [
          ...(c.matchId ? [c.matchId] : []),
          ...c.similarIds,
        ])
      )
    ),
  ]
}
