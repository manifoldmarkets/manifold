import { createHash } from 'crypto'
import { sortBy, sumBy } from 'lodash'
import { Contract } from 'common/contract'
import { fetchLinkPreview } from 'common/link-preview'
import { isFaviconAllowed } from 'common/favicon-allowlist'
import { isNewsCategory, NewsCategory, NewsStory } from 'common/news-feed'
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
import {
  dedupeSources,
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
 * 4. Refetch the linked contracts, drop any no longer open, rank, and keep
 *    the top few hundred stories.
 *
 * Reads prod; writes nothing to the database.
 */

export type StoryMemo = {
  id: string
  /** In memory only; not written to the disk cache. */
  embedding?: number[]
  candidateIds: string[]
  contractIds: string[]
  forecastable?: boolean
  category: NewsCategory
  verifiedAt: number
  imageTriedAt?: number
  /** Ids of raw items that merged into this story, so they are not embedded
   * again on the next refresh. */
  aliases?: string[]
}

export type NewsFeedBuild = {
  stories: NewsStory[]
  contractsById: Record<string, Contract>
  memos: Record<string, StoryMemo>
  updatedTime: number
  spotlight?: { contractId: string; storyId: string }
}

/** Stories older than this drop off the feed. */
const KEEP_STORIES_MS = 3 * DAY_MS
const MAX_STORIES = 400
/** Same story from another outlet, by embedding similarity. */
const MERGE_SIMILARITY = 0.82
/** Raw item ids remembered per story after merging. */
const MAX_ALIASES = 40
/** A verifier call that takes longer than this is treated as failed. */
const VERIFY_TIMEOUT_MS = 60_000
/** Below this no market is worth asking the verifier about. */
const CANDIDATE_FLOOR = 0.35
const CANDIDATES_PER_STORY = 12
/** Without the verifier, keep only near-certain neighbours. */
const FALLBACK_SIMILARITY = 0.6
const REVERIFY_AFTER_MS = 12 * HOUR_MS
const IMAGES_PER_REFRESH = 24
const IMAGE_TIMEOUT_MS = 6_000
const FRESHNESS_HALF_LIFE_H = 36
const SPOTLIGHT_WINDOW_MS = 2 * DAY_MS

const EMBED_CONCURRENCY = 6
const DB_CONCURRENCY = 6
const AI_CONCURRENCY = 8
const IMAGE_CONCURRENCY = 3

const storyIdFor = (origin: string, key: string) =>
  createHash('sha1').update(`${origin}|${key}`).digest('hex').slice(0, 16)

const cosine = (a: number[], b: number[]) => {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom > 0 ? dot / denom : 0
}

const embeddingText = (s: {
  topic?: string
  headline: string
  summary?: string
}) =>
  `${s.topic ? s.topic + ': ' : ''}${s.headline}${
    s.summary && s.summary !== s.headline ? ' ' + s.summary : ''
  }`

const toStory = (id: string, r: RawStory): NewsStory => ({
  id,
  headline: r.headline,
  summary: r.summary,
  topic: r.topic,
  category: r.category,
  origin: r.origin,
  publishedTime: r.publishedTime,
  updatedTime: r.publishedTime,
  sources: dedupeSources(r.sources),
  contractIds: [],
  candidateIds: [],
  score: 0,
})

/** Another outlet's item on a story we have: fold its sources in. */
const absorb = (story: NewsStory, r: RawStory) => {
  story.sources = dedupeSources([...story.sources, ...r.sources])
  story.updatedTime = Math.max(story.updatedTime, r.publishedTime)
  if (story.category === 'other' && r.category !== 'other')
    story.category = r.category
  // The portal's sentence is better context than a headline.
  if (r.origin === 'wikipedia' && story.origin === 'google-news') {
    story.summary = r.summary
    story.topic = story.topic ?? r.topic
  } else if (!story.summary && r.summary) {
    story.summary = r.summary
  }
}

type Candidate = { contract: Contract; similarity: number }

/** The nearest open, public, unresolved markets to a story's embedding. */
async function findCandidateMarkets(
  pg: SupabaseDirectClient,
  embedding: number[]
): Promise<Candidate[]> {
  const rows = await pg.tx(async (t) => {
    // The HNSW scan returns at most ef_search rows before the join filters
    // closed and unlisted markets out, so widen it.
    await t.none('set local hnsw.ef_search = 300')
    return t.map(
      `select ${contractColumnsToSelectWithPrefix('c')},
              1 - (ce.embedding <=> $1::vector) as similarity
       from contract_embeddings ce
       join contracts c on c.id = ce.contract_id
       where c.resolution_time is null
         and c.visibility = 'public'
         and c.deleted = false
         and c.close_time > now()
         and c.outcome_type in ('BINARY', 'MULTIPLE_CHOICE', 'PSEUDO_NUMERIC', 'NUMBER', 'MULTI_NUMERIC', 'DATE')
       order by ce.embedding <=> $1::vector
       limit $2`,
      [JSON.stringify(embedding), CANDIDATES_PER_STORY],
      (r) => ({
        contract: convertContract(r) as Contract,
        similarity: Number(r.similarity),
      })
    )
  })
  return rows.filter(
    (r) =>
      Number.isFinite(r.similarity) &&
      r.similarity >= CANDIDATE_FLOOR &&
      isEligibleRelatedMarket(r.contract)
  )
}

const describePrice = (c: Contract) => {
  if (c.outcomeType === 'BINARY' && 'prob' in c && Number.isFinite(c.prob))
    return `${Math.round(c.prob * 100)}% yes`
  if ('answers' in c && Array.isArray(c.answers) && c.answers.length > 0) {
    const top = [...c.answers].sort((a, b) => b.prob - a.prob)[0]
    return `top answer "${top.text}" ${Math.round(top.prob * 100)}%`
  }
  return c.outcomeType.toLowerCase()
}

type Verdict = {
  contractIds: string[]
  forecastable?: boolean
  category?: NewsCategory
}

/** Ask Gemini which candidates the story actually bears on. */
async function verifyLinks(
  story: NewsStory,
  candidates: Candidate[]
): Promise<Verdict> {
  if (candidates.length === 0) return { contractIds: [] }
  const list = candidates
    .map(
      (c, i) =>
        `${i + 1}. id=${c.contract.id} | ${c.contract.question} | closes ${
          c.contract.closeTime
            ? new Date(c.contract.closeTime).toISOString().slice(0, 10)
            : 'n/a'
        } | ${describePrice(c.contract)}`
    )
    .join('\n')
  const prompt = `You match news stories to prediction markets on Manifold Markets.

Story (published ${new Date(story.publishedTime).toISOString().slice(0, 10)}):
Headline: ${story.headline}
${
  story.summary && story.summary !== story.headline
    ? `Context: ${story.summary}\n`
    : ''
}${
    story.topic ? `Running story: ${story.topic}\n` : ''
  }Reported by: ${story.sources.map((s) => s.name).join(', ')}

Candidate markets:
${list}

Return only JSON in this shape:
{"relevant": ["<id>", ...], "forecastable": true, "category": "politics"}

Rules:
- Put a market in "relevant" only if the story is about the event, actor or question the market's outcome turns on, so that a trader who read the story should update their probability. Sharing a topic, a country or a word is not enough.
- Order "relevant" strongest first. An empty list is a fine answer.
- "forecastable": true when the story implies an open question about what happens next that would make a good market.
- "category": the single best fit from politics, world, economy, tech, science, sport, culture, other.`

  try {
    const res = await withTimeout(
      promptAI<{
        relevant?: unknown
        forecastable?: unknown
        category?: unknown
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
const stripContract = (c: Contract): Contract => {
  const slim = { ...c, description: '' } as Contract & {
    coverImageUrl?: string
  }
  delete slim.coverImageUrl
  return slim
}

async function fetchContracts(pg: SupabaseDirectClient, ids: string[]) {
  if (ids.length === 0) return [] as Contract[]
  return pg.map(
    `select ${contractColumnsToSelectWithPrefix('c')}
     from contracts c where c.id = any($1)`,
    [ids],
    (r) => convertContract(r) as Contract
  )
}

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([
    p,
    new Promise<undefined>((resolve) =>
      setTimeout(() => resolve(undefined), ms)
    ),
  ])

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

export async function buildNewsFeed(
  prev: NewsFeedBuild | undefined,
  now = Date.now()
): Promise<NewsFeedBuild> {
  const pg = createSupabaseDirectClient()
  const raw = await gatherRawStories(now)
  log('news-feed: gathered raw items', {
    raw: raw.length,
    wikipedia: raw.filter((r) => r.origin === 'wikipedia').length,
    google: raw.filter((r) => r.origin === 'google-news').length,
  })

  // 1. Carry the recent stories forward.
  const stories = new Map<string, NewsStory>()
  for (const s of prev?.stories ?? []) {
    if (now - s.updatedTime < KEEP_STORIES_MS) stories.set(s.id, { ...s })
  }
  const memos: Record<string, StoryMemo> = {}
  for (const [id, m] of Object.entries(prev?.memos ?? {})) {
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
    if (existing) absorb(existing, r)
    else if (!fresh.has(id)) fresh.set(id, r)
  }

  // Stories carried over from the disk cache have no vectors; re-embed them
  // so new coverage can still merge into them.
  const reEmbed = [...stories.values()].filter((s) => !memos[s.id]?.embedding)
  await mapAsync(
    reEmbed,
    async (s) => {
      const embedding = await generateEmbeddings(embeddingText(s))
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
      stories.set(f.id, toStory(f.id, f.raw))
      memos[f.id] = {
        id: f.id,
        candidateIds: [],
        contractIds: [],
        category: f.raw.category,
        verifiedAt: 0,
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
      absorb(target, f.raw)
      const tm = memos[target.id]
      if (tm) tm.aliases = [...(tm.aliases ?? []), f.id].slice(-MAX_ALIASES)
      merged++
      continue
    }
    stories.set(f.id, toStory(f.id, f.raw))
    memos[f.id] = {
      id: f.id,
      embedding: f.embedding,
      candidateIds: [],
      contractIds: [],
      category: f.raw.category,
      verifiedAt: 0,
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
        const candidates = await findCandidateMarkets(pg, m.embedding)
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
      const verdict = await verifyLinks(s, candidates)
      m.candidateIds = candidates.map((c) => c.contract.id)
      m.contractIds = verdict.contractIds
      m.forecastable = verdict.forecastable
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

  // 4. Fresh contract state for everything linked; drop what closed.
  const linkedIds = [
    ...new Set(Object.values(memos).flatMap((m) => m.contractIds)),
  ]
  const contracts = await fetchContracts(pg, linkedIds)
  const contractsById: Record<string, Contract> = {}
  for (const c of contracts) {
    if (isEligibleRelatedMarket(c, now)) contractsById[c.id] = stripContract(c)
  }

  const assembled: NewsStory[] = []
  for (const s of stories.values()) {
    const m = memos[s.id]
    const contractIds = (m?.contractIds ?? []).filter((id) => contractsById[id])
    const story: NewsStory = {
      ...s,
      category: s.category === 'other' && m?.category ? m.category : s.category,
      contractIds,
      candidateIds: m?.candidateIds ?? [],
      forecastable: m?.forecastable,
      score: 0,
    }
    story.score = scoreStory(
      story,
      contractIds.map((id) => contractsById[id]),
      now
    )
    assembled.push(story)
  }

  // 5. Thumbnails for linked stories whose first link is a known outlet. The
  //    favicon allowlist doubles as the set of hosts we are willing to fetch
  //    from: citations are user-editable on the portal, so never follow an
  //    arbitrary host from the server.
  const wantImage = assembled
    .filter(
      (s) =>
        s.contractIds.length > 0 &&
        !s.image &&
        !memos[s.id]?.imageTriedAt &&
        s.sources[0] &&
        !isAggregatorLink(s.sources[0].url) &&
        isFaviconAllowed(hostnameOf(s.sources[0].url) ?? '')
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, IMAGES_PER_REFRESH)
  await mapAsync(
    wantImage,
    async (s) => {
      memos[s.id].imageTriedAt = now
      try {
        const preview = await withTimeout(
          fetchLinkPreview(s.sources[0].url),
          IMAGE_TIMEOUT_MS
        )
        if (preview?.image && /^https:\/\//.test(preview.image))
          s.image = preview.image
      } catch {
        // No preview: the card renders without one.
      }
    },
    IMAGE_CONCURRENCY
  )

  // 6. Rank, cap, and pick the spotlight.
  const ranked = sortBy(assembled, (s) => -s.score).slice(0, MAX_STORIES)
  const kept = new Set(ranked.map((s) => s.id))
  for (const id of Object.keys(memos)) if (!kept.has(id)) delete memos[id]
  const usedContractIds = new Set(ranked.flatMap((s) => s.contractIds))
  for (const id of Object.keys(contractsById))
    if (!usedContractIds.has(id)) delete contractsById[id]

  let spotlight: NewsFeedBuild['spotlight']
  let bestBettors = -1
  for (const s of ranked) {
    if (now - s.updatedTime > SPOTLIGHT_WINDOW_MS) continue
    for (const id of s.contractIds) {
      const c = contractsById[id]
      const bettors = c?.uniqueBettorCount ?? 0
      if (c && c.outcomeType === 'BINARY' && bettors > bestBettors) {
        bestBettors = bettors
        spotlight = { contractId: id, storyId: s.id }
      }
    }
  }

  return { stories: ranked, contractsById, memos, updatedTime: now, spotlight }
}
