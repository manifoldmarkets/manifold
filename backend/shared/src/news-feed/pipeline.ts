import { createHash } from 'crypto'
import { countBy, sortBy, sumBy, uniq } from 'lodash'
import { Contract } from 'common/contract'
import { fetchLinkPreview } from 'common/link-preview'
import { isFaviconAllowed } from 'common/favicon-allowlist'
import {
  isNewsCategory,
  NewsArticle,
  NewsCategory,
  NewsStory,
} from 'common/news-feed'
import { isEligibleRelatedMarket } from 'common/related-markets'
import { convertContract } from 'common/supabase/contracts'
import { mapAsync } from 'common/util/promise'
import { DAY_MS, HOUR_MS } from 'common/util/time'
import { generateEmbeddings } from 'shared/helpers/openai-utils'
import { aiModels, promptAI } from 'shared/helpers/prompt-ai'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { contractColumnsToSelectWithPrefix, log } from 'shared/utils'
import { articleSources } from './articles'
import { ClaimsMemo, findArticlesAndClaims } from './claims'
import { findWikimediaImage, imageSource } from './images'
import {
  Candidate,
  cosine,
  describeMarket,
  findCandidateMarkets,
  withTimeout,
} from './markets'
import {
  dedupeSources,
  enabledSources,
  gatherRawStories,
  hostnameOf,
  isAggregatorLink,
  RawStory,
} from './sources'

/**
 * One refresh of the feed:
 *
 * 1. Gather raw items from the sources and fold them into the stories we
 *    already have (the feed is a rolling log, not a snapshot).
 * 2. Embed new items with the contracts' embedding model and merge items
 *    that are the same story from another outlet.
 * 3. For each story, pull the nearest open markets from `contract_embeddings`
 *    and ask Gemini which of them the story actually bears on.
 * 4. For linked stories, find an outlet's article on the story and read the
 *    checkable claims in it (see claims.ts).
 * 5. Refetch the linked contracts, drop any no longer open, rank, and keep
 *    the top few hundred stories.
 *
 * Reads prod; writes nothing to the database.
 */

export type StoryMemo = ClaimsMemo & {
  id: string
  /** In memory only; not written to the disk cache. */
  embedding?: number[]
  candidateIds: string[]
  contractIds: string[]
  forecastable?: boolean
  category: NewsCategory
  verifiedAt: number
  imageTriedAt?: number
  /** The subjects a Wikimedia picture was last looked for under, so a new
   * subject from the verifier gets another look. */
  imageTriedFor?: string
  /** Wikipedia article titles for what the story is about, best first: the
   * verifier's pick, then what the source linked. For the picture. */
  subjects?: string[]
  /** A publisher's standfirst, read by the matcher and never sent out. */
  context?: string
  /** Ids of raw items that merged into this story, so they are not embedded
   * again on the next refresh. */
  aliases?: string[]
}

export type NewsFeedBuild = {
  stories: NewsStory[]
  contractsById: Record<string, Contract>
  memos: Record<string, StoryMemo>
  updatedTime: number
}

/** Stories older than this drop off the feed. */
const KEEP_STORIES_MS = 3 * DAY_MS
/** Three days of the wire, newest first; the cap drops the oldest. */
const MAX_STORIES = 1200
/** Same story from another outlet, by embedding similarity. */
const MERGE_SIMILARITY = 0.82
/** Raw item ids remembered per story after merging. */
const MAX_ALIASES = 40
/** A verifier call that takes longer than this is treated as failed. */
const VERIFY_TIMEOUT_MS = 60_000
const CANDIDATES_PER_STORY = 12
/** Without the verifier, keep only near-certain neighbours. */
const FALLBACK_SIMILARITY = 0.6
const REVERIFY_AFTER_MS = 12 * HOUR_MS
const IMAGES_PER_REFRESH = 24
/** Two Wikipedia calls, or one outlet page. */
const IMAGE_TIMEOUT_MS = 10_000
const FRESHNESS_HALF_LIFE_H = 36

const EMBED_CONCURRENCY = 6
const DB_CONCURRENCY = 6
const AI_CONCURRENCY = 8
const IMAGE_CONCURRENCY = 3

const storyIdFor = (origin: string, key: string) =>
  createHash('sha1').update(`${origin}|${key}`).digest('hex').slice(0, 16)

const embeddingText = (s: {
  topic?: string
  headline: string
  summary?: string
  context?: string
}) => {
  const more =
    s.summary && s.summary !== s.headline ? s.summary : s.context ?? ''
  return `${s.topic ? s.topic + ': ' : ''}${s.headline}${
    more ? ' ' + more : ''
  }`
}

const isSameUtcDay = (a: number, b: number) =>
  new Date(a).toISOString().slice(0, 10) ===
  new Date(b).toISOString().slice(0, 10)

const toStory = (id: string, r: RawStory, now: number): NewsStory => ({
  id,
  headline: r.headline,
  summary: r.summary,
  topic: r.topic,
  category: r.category,
  origin: r.origin,
  publishedTime: r.publishedTime,
  // The portal has no times; a bullet that appears today counts from when
  // it appeared, so the feed stays chronological.
  updatedTime:
    r.origin === 'wikipedia' && isSameUtcDay(r.publishedTime, now)
      ? now
      : r.publishedTime,
  sources: dedupeSources(r.sources),
  contractIds: [],
  candidateIds: [],
  score: 0,
})

/** Another outlet's item on a story we have: fold its sources in, and
 * what it knows about the subject into the memo. */
const absorb = (story: NewsStory, r: RawStory, memo?: StoryMemo) => {
  if (memo) {
    if (r.entities?.length)
      memo.subjects = uniq([...(memo.subjects ?? []), ...r.entities])
    if (r.context && !memo.context) memo.context = r.context
  }
  story.sources = dedupeSources([...story.sources, ...r.sources])
  story.updatedTime = Math.max(story.updatedTime, r.publishedTime)
  if (story.category === 'other' && r.category !== 'other')
    story.category = r.category
  // The portal's sentence is better context than a headline, and the
  // portal edits its bullets, so a re-read refreshes the text.
  if (r.origin === 'wikipedia') {
    if (story.origin === 'wikipedia') story.headline = r.headline
    story.summary = r.summary
    story.topic = story.topic ?? r.topic
  } else if (!story.summary && r.summary) {
    story.summary = r.summary
  }
}

type Verdict = {
  contractIds: string[]
  forecastable?: boolean
  category?: NewsCategory
  /** The Wikipedia article on what the story is mainly about. */
  subject?: string
}

/** Ask Gemini which candidates the story actually bears on, and what it is
 * about (for its picture). */
async function verifyLinks(
  story: NewsStory,
  candidates: Candidate[],
  context?: string
): Promise<Verdict> {
  if (candidates.length === 0) return { contractIds: [] }
  const list = candidates
    .map((c, i) => `${i + 1}. ${describeMarket(c.contract)}`)
    .join('\n')
  const about =
    story.summary && story.summary !== story.headline ? story.summary : context
  const prompt = `You match news stories to prediction markets on Manifold Markets.

Story (published ${new Date(story.publishedTime).toISOString().slice(0, 10)}):
Headline: ${story.headline}
${about ? `Context: ${about}\n` : ''}${
    story.topic ? `Running story: ${story.topic}\n` : ''
  }Reported by: ${story.sources.map((s) => s.name).join(', ')}

Candidate markets:
${list}

Return only JSON in this shape:
{"relevant": ["<id>", ...], "forecastable": true, "category": "politics", "subject": "Benjamin Netanyahu"}

Rules:
- Put a market in "relevant" only if the story is about the event, actor or question the market's outcome turns on, so that a trader who read the story should update their probability. Sharing a topic, a country or a word is not enough.
- Order "relevant" strongest first. An empty list is a fine answer.
- "forecastable": true when the story implies an open question about what happens next that would make a good market.
- "category": the single best fit from politics, world, economy, tech, science, sport, culture, other.
- "subject": the exact title of the English Wikipedia article on the specific person, organisation, team, place or named event the story is mainly about (for example "Benjamin Netanyahu", "Rapid Support Forces", "2026 Israeli legislative election"), used for its picture. Never a general concept such as "Airstrike", "Election" or "Drone strike"; null when the story has no such subject.`

  try {
    const res = await withTimeout(
      promptAI<{
        relevant?: unknown
        forecastable?: unknown
        category?: unknown
        subject?: unknown
      }>(prompt, {
        model: aiModels.flash,
        parseAsJson: true,
        thinkingLevel: 'minimal',
      }),
      VERIFY_TIMEOUT_MS
    )
    if (!res) throw new Error('verifier timed out')
    const allowed = new Set(candidates.map((c) => c.contract.id))
    const ids = Array.isArray(res?.relevant)
      ? res.relevant.filter(
          (x): x is string => typeof x === 'string' && allowed.has(x)
        )
      : []
    return {
      contractIds: [...new Set(ids)],
      forecastable:
        typeof res?.forecastable === 'boolean' ? res.forecastable : undefined,
      category:
        typeof res?.category === 'string' && isNewsCategory(res.category)
          ? res.category
          : undefined,
      subject:
        typeof res?.subject === 'string' &&
        res.subject.trim().length > 0 &&
        res.subject.trim().length <= 120
          ? res.subject.trim()
          : undefined,
    }
  } catch (e) {
    log.warn('news-feed: verifier failed, keeping near neighbours', {
      storyId: story.id,
      error: e instanceof Error ? e.message : String(e),
    })
    return {
      contractIds: candidates
        .filter((c) => c.similarity >= FALLBACK_SIMILARITY)
        .map((c) => c.contract.id),
    }
  }
}

/** The contracts the page needs, without the heavy fields. */
export const stripContract = (c: Contract): Contract => {
  const slim = { ...c, description: '' } as Contract & {
    coverImageUrl?: string
  }
  delete slim.coverImageUrl
  return slim
}

export async function fetchContracts(pg: SupabaseDirectClient, ids: string[]) {
  if (ids.length === 0) return [] as Contract[]
  return pg.map(
    `select ${contractColumnsToSelectWithPrefix('c')}
     from contracts c where c.id = any($1)`,
    [ids],
    (r) => convertContract(r) as Contract
  )
}

const scoreStory = (story: NewsStory, contracts: Contract[], now: number) => {
  const ageHours = Math.max(0, now - story.updatedTime) / HOUR_MS
  const freshness = Math.pow(0.5, ageHours / FRESHNESS_HALF_LIFE_H)
  const bettors = sumBy(contracts, (c) => c.uniqueBettorCount ?? 0)
  const tradeable =
    contracts.length > 0
      ? 1 + Math.min(3, contracts.length) * 0.5 + Math.log10(1 + bettors) * 0.5
      : 0.15
  const breadth = Math.min(1.5, 1 + 0.1 * (story.sources.length - 1))
  const score = freshness * tradeable * breadth
  return Number.isFinite(score) ? score : 0
}

/**
 * A build as this configuration may serve it: only stories from enabled
 * sources, pictures the configuration licenses, and article text from the
 * providers it is configured for.
 * Applied to a cached build before it is served and before it is carried
 * into a refresh, so a cache from another configuration (the prototype's,
 * say) cannot leak its sources, and so the rule holds for every story, not
 * only the ones the claims step looks at.
 */
export function sanitizeForConfig(build: NewsFeedBuild): NewsFeedBuild {
  const origins = new Set(enabledSources())
  const providers = new Set(articleSources())
  const pictures = imageSource()
  const memos: Record<string, StoryMemo> = {}
  for (const [id, m0] of Object.entries(build.memos)) {
    const m = { ...m0 }
    const hasText =
      !!m.article ||
      !!m.claims ||
      m.claimsStatus === 'found' ||
      m.claimsStatus === 'none'
    const provider = m.articleProvider
    if (hasText && (!provider || !providers.has(provider))) {
      delete m.article
      delete m.claims
      delete m.articleProvider
      delete m.claimsStatus
      delete m.claimsAt
      m.articleCheckedAt = 0
    }
    if (m.article?.image && pictures !== 'outlets')
      m.article = { ...m.article, image: undefined }
    memos[id] = m
  }
  const stories = build.stories.flatMap((s0): NewsStory[] => {
    if (!origins.has(s0.origin)) return []
    const s = { ...s0 }
    const m = memos[s.id]
    if ((s.article || s.claims) && !m?.article && !m?.claims) {
      s.article = undefined
      s.claims = undefined
      s.claimsStatus = 'no-article'
    }
    if (s.article?.image && pictures !== 'outlets')
      s.article = { ...s.article, image: undefined }
    if (
      s.image &&
      (pictures === 'none' || (pictures !== 'outlets' && !s.imageCredit))
    ) {
      delete s.image
      delete s.imageCredit
    }
    return [s]
  })
  const kept = new Set(stories.map((s) => s.id))
  for (const id of Object.keys(memos)) if (!kept.has(id)) delete memos[id]
  return { ...build, stories, memos }
}

export async function buildNewsFeed(
  prev: NewsFeedBuild | undefined,
  now = Date.now(),
  /** Contracts to load and keep even when no story links them: markets
   * readers attached. */
  keepContractIds: string[] = []
): Promise<NewsFeedBuild> {
  const pg = createSupabaseDirectClient()
  const raw = await gatherRawStories(now, { since: prev?.updatedTime })
  log('news-feed: gathered raw items', {
    raw: raw.length,
    ...countBy(raw, (r) => r.origin),
  })

  // 1. Carry the recent stories forward, as this configuration allows them
  //    (a cache from another configuration must not leak its sources).
  const pictures = imageSource()
  const allowed = prev ? sanitizeForConfig(prev) : undefined
  const stories = new Map<string, NewsStory>()
  for (const s of allowed?.stories ?? []) {
    if (now - s.updatedTime < KEEP_STORIES_MS) stories.set(s.id, { ...s })
  }
  const memos: Record<string, StoryMemo> = {}
  for (const [id, m] of Object.entries(allowed?.memos ?? {})) {
    if (stories.has(id)) memos[id] = { ...m }
  }

  // 2. Fold raw items in. Known ids just refresh; the rest get embedded and
  //    either merge into a story we have or become one.
  const aliasToStory = new Map<string, string>()
  for (const m of Object.values(memos))
    for (const a of m.aliases ?? []) aliasToStory.set(a, m.id)
  const fresh = new Map<string, RawStory>()
  for (const r of raw) {
    const id = storyIdFor(r.origin, r.key)
    const existing = stories.get(id) ?? stories.get(aliasToStory.get(id) ?? '')
    if (existing) absorb(existing, r, memos[existing.id])
    else if (!fresh.has(id)) fresh.set(id, r)
  }

  // Stories carried over from the disk cache have no vectors; re-embed them
  // so new coverage can still merge into them.
  const reEmbed = [...stories.values()].filter((s) => !memos[s.id]?.embedding)
  await mapAsync(
    reEmbed,
    async (s) => {
      const embedding = await generateEmbeddings(
        embeddingText({ ...s, context: memos[s.id]?.context })
      )
      if (!embedding) return
      memos[s.id] = {
        ...(memos[s.id] ?? {
          id: s.id,
          candidateIds: [],
          contractIds: [],
          category: s.category,
          verifiedAt: 0,
        }),
        embedding,
      }
    },
    EMBED_CONCURRENCY
  )

  const embeddedFresh = await mapAsync(
    [...fresh.entries()],
    async ([id, r]) => ({
      id,
      raw: r,
      embedding: await generateEmbeddings(embeddingText(r)),
    }),
    EMBED_CONCURRENCY
  )

  const vectors = Object.values(memos)
    .filter((m): m is StoryMemo & { embedding: number[] } => !!m.embedding)
    .map((m) => ({ id: m.id, embedding: m.embedding }))

  let merged = 0
  let processed = 0
  const bestSims: number[] = []
  for (const f of sortBy(embeddedFresh, (f) => f.raw.publishedTime)) {
    // All-pairs cosine over a few hundred vectors is CPU-bound; yield so the
    // API keeps serving requests while this runs in-process.
    if (++processed % 20 === 0) await new Promise((r) => setImmediate(r))
    if (!f.embedding) {
      stories.set(f.id, toStory(f.id, f.raw, now))
      memos[f.id] = {
        id: f.id,
        candidateIds: [],
        contractIds: [],
        category: f.raw.category,
        verifiedAt: 0,
        subjects: f.raw.entities,
        context: f.raw.context,
      }
      continue
    }
    let best: { id: string; sim: number } | undefined
    for (const v of vectors) {
      const sim = cosine(f.embedding, v.embedding)
      if (!best || sim > best.sim) best = { id: v.id, sim }
    }
    if (best) bestSims.push(best.sim)
    const target =
      best && best.sim >= MERGE_SIMILARITY ? stories.get(best.id) : undefined
    if (target) {
      const tm = memos[target.id]
      absorb(target, f.raw, tm)
      if (tm) tm.aliases = [...(tm.aliases ?? []), f.id].slice(-MAX_ALIASES)
      merged++
      continue
    }
    stories.set(f.id, toStory(f.id, f.raw, now))
    memos[f.id] = {
      id: f.id,
      embedding: f.embedding,
      candidateIds: [],
      contractIds: [],
      category: f.raw.category,
      verifiedAt: 0,
      subjects: f.raw.entities,
      context: f.raw.context,
    }
    vectors.push({ id: f.id, embedding: f.embedding })
  }
  log('news-feed: stories after merge', {
    stories: stories.size,
    newItems: fresh.size,
    merged,
    // Nearest-neighbour similarity of each new item, to tune MERGE_SIMILARITY.
    nearest: {
      over90: bestSims.filter((s) => s >= 0.9).length,
      over85: bestSims.filter((s) => s >= 0.85).length,
      over80: bestSims.filter((s) => s >= 0.8).length,
      over75: bestSims.filter((s) => s >= 0.75).length,
      over70: bestSims.filter((s) => s >= 0.7).length,
    },
  })

  // 3. Candidates and verification for stories that need it.
  const toVerify = [...stories.values()].filter((s) => {
    const m = memos[s.id]
    return !!m?.embedding && now - m.verifiedAt > REVERIFY_AFTER_MS
  })
  const candidateContracts = new Map<string, Contract>()
  const candidatesByStory = new Map<string, Candidate[]>()
  await mapAsync(
    toVerify,
    async (s) => {
      const m = memos[s.id]
      if (!m.embedding) return
      try {
        const candidates = await findCandidateMarkets(
          pg,
          m.embedding,
          CANDIDATES_PER_STORY
        )
        candidatesByStory.set(s.id, candidates)
        for (const c of candidates)
          candidateContracts.set(c.contract.id, c.contract)
      } catch (e) {
        log.error('news-feed: candidate query failed', {
          storyId: s.id,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    },
    DB_CONCURRENCY
  )
  await mapAsync(
    toVerify.filter((s) => candidatesByStory.has(s.id)),
    async (s) => {
      const m = memos[s.id]
      const candidates = candidatesByStory.get(s.id) ?? []
      const verdict = await verifyLinks(s, candidates, m.context)
      m.candidateIds = candidates.map((c) => c.contract.id)
      m.contractIds = verdict.contractIds
      m.forecastable = verdict.forecastable
      if (verdict.subject)
        m.subjects = uniq([verdict.subject, ...(m.subjects ?? [])])
      if (verdict.category && s.category === 'other')
        m.category = verdict.category
      m.verifiedAt = now
    },
    AI_CONCURRENCY
  )
  log('news-feed: verified', {
    verified: toVerify.length,
    linked: toVerify.filter((s) => memos[s.id].contractIds.length > 0).length,
  })

  // 4. Claims, for stories with markets: the feed shows those by default.
  //    Without an article source there are none, and text another
  //    configuration read goes with them.
  if (articleSources().length === 0)
    for (const m of Object.values(memos)) {
      delete m.claims
      delete m.article
      delete m.articleProvider
      delete m.claimsStatus
    }
  let claimContractIds: string[] = []
  try {
    claimContractIds =
      articleSources().length === 0
        ? []
        : await findArticlesAndClaims(
            pg,
            [...stories.values()]
              .filter((s) => (memos[s.id]?.contractIds.length ?? 0) > 0)
              .map((s) => ({ story: s, memo: memos[s.id] })),
            now
          )
  } catch (e) {
    log.error('news-feed: claims step failed', {
      error: e instanceof Error ? e.message : String(e),
    })
  }

  // 5. Fresh contract state for everything linked; drop what closed.
  const linkedIds = [
    ...new Set([
      ...Object.values(memos).flatMap((m) => m.contractIds),
      ...claimContractIds,
      ...keepContractIds,
    ]),
  ]
  const contracts = await fetchContracts(pg, linkedIds)
  const contractsById: Record<string, Contract> = {}
  for (const c of contracts) {
    if (isEligibleRelatedMarket(c, now)) contractsById[c.id] = stripContract(c)
  }

  /** An article's own picture is the publisher's: outlets mode only. */
  const withoutPublisherImage = (a: NewsArticle | undefined) =>
    a && a.image && pictures !== 'outlets' ? { ...a, image: undefined } : a

  const assembled: NewsStory[] = []
  for (const s of stories.values()) {
    const m = memos[s.id]
    const contractIds = (m?.contractIds ?? []).filter((id) => contractsById[id])
    // A claim whose market has since closed has nothing to show beside it;
    // its draft was dropped when the match was made, so the claim goes.
    const claims = (m?.claims ?? [])
      .filter((c) => !c.matchId || contractsById[c.matchId])
      .map((c) => ({
        ...c,
        similarIds: c.similarIds.filter((id) => contractsById[id]),
      }))
    const read = m?.claimsStatus === 'found' || m?.claimsStatus === 'none'
    const story: NewsStory = {
      ...s,
      category: s.category === 'other' && m?.category ? m.category : s.category,
      contractIds,
      candidateIds: m?.candidateIds ?? [],
      forecastable: m?.forecastable,
      score: 0,
      article: read ? withoutPublisherImage(m?.article) : undefined,
      // An article's own picture is the publisher's: outlets mode only.
      image:
        (read && pictures === 'outlets' ? m?.article?.image : undefined) ??
        s.image,
      claims: read ? claims : undefined,
      claimsStatus: read
        ? claims.length > 0
          ? 'found'
          : 'none'
        : m?.claimsStatus ?? 'no-article',
    }
    story.score = scoreStory(
      story,
      contractIds.map((id) => contractsById[id]),
      now
    )
    assembled.push(story)
  }

  // 6. Pictures for linked stories, best first.
  //    'wikimedia': the lead photograph of the story's subject on Wikipedia,
  //    with its credit; a story is tried again when the verifier names a
  //    subject it was not tried under.
  //    'outlets' (prototype only): the first outlet's preview image. The
  //    favicon allowlist doubles as the set of hosts we are willing to fetch
  //    from: citations are user-editable on the portal, so never follow an
  //    arbitrary host from the server.
  const subjectsKey = (s: NewsStory) => (memos[s.id]?.subjects ?? []).join('|')
  const wantImage = assembled
    .filter((s) => {
      const m = memos[s.id]
      if (pictures === 'none' || s.contractIds.length === 0 || s.image || !m)
        return false
      if (pictures === 'wikimedia')
        return (
          (m.subjects?.length ?? 0) > 0 && m.imageTriedFor !== subjectsKey(s)
        )
      return (
        !m.imageTriedAt &&
        !!s.sources[0] &&
        !isAggregatorLink(s.sources[0].url) &&
        isFaviconAllowed(hostnameOf(s.sources[0].url) ?? '')
      )
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, IMAGES_PER_REFRESH)
  await mapAsync(
    wantImage,
    async (s) => {
      const m = memos[s.id]
      m.imageTriedAt = now
      try {
        if (pictures === 'wikimedia') {
          const result = await withTimeout(
            findWikimediaImage(m.subjects ?? []).then((found) => ({ found })),
            IMAGE_TIMEOUT_MS
          )
          // A timeout or failure is transient; only an answer, picture or
          // none, settles these subjects.
          if (!result) return
          m.imageTriedFor = subjectsKey(s)
          if (result.found) {
            s.image = result.found.image
            s.imageCredit = result.found.credit
          }
          return
        }
        const preview = await withTimeout(
          fetchLinkPreview(s.sources[0].url),
          IMAGE_TIMEOUT_MS
        )
        if (preview?.image && /^https:\/\//.test(preview.image))
          s.image = preview.image
      } catch {
        // No picture: the card renders without one.
      }
    },
    IMAGE_CONCURRENCY
  )

  // 7. Rank and cap. The API picks the spotlight per request.
  const ranked = sortBy(assembled, (s) => -s.updatedTime).slice(0, MAX_STORIES)
  const kept = new Set(ranked.map((s) => s.id))
  for (const id of Object.keys(memos)) if (!kept.has(id)) delete memos[id]
  const usedContractIds = new Set([
    ...ranked.flatMap((s) => [
      ...s.contractIds,
      ...(s.claims ?? []).flatMap((c) => [
        ...(c.matchId ? [c.matchId] : []),
        ...c.similarIds,
      ]),
    ]),
    ...keepContractIds,
  ])
  for (const id of Object.keys(contractsById))
    if (!usedContractIds.has(id)) delete contractsById[id]

  return { stories: ranked, contractsById, memos, updatedTime: now }
}
