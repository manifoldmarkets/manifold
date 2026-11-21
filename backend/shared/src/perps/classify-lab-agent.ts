import Anthropic from '@anthropic-ai/sdk'
import { LabClassificationSubjectType } from 'shared/perps/lab-classifications'

// Research agent for the Chinese-lab index: where is this publisher
// headquartered, and — for an anonymous model — has anyone official said who
// published it?
//
// The open-weight agent gets by on HuggingFace alone because its question has
// a mechanical answer: a repo either carries public weight files or it does
// not. This question does not. Headquarters and attribution live in press
// releases, company pages, OpenRouter's own changelog and the publisher's
// announcements, so this agent is given web search and graded on the URL it
// cites — which must be one the search actually returned in this session, so a
// citation can never be invented. The model only ever sees search results; a
// URL it did not get from a result came from memory, and memory is exactly
// what a model released after its training data cannot be answered from.
//
// NOTHING here is applied. Every answer lands as a recommendation on the row,
// with the evidence line and source URL prefilled for the operator to confirm.
// There is no deterministic equivalent of "the publisher declared a repo" for
// a headquarters, so unlike the open-weight watcher this path never writes a
// verdict on its own. The two populations differ in what the answer means:
//   - PENDING subject: the operator has not decided. The recommendation is
//     what they would otherwise have had to type.
//   - PROVISIONAL subject: the operator defaulted to non-Chinese because
//     nothing could be found. A `chinese` finding contradicts a verdict the
//     index is publishing, and the watcher alerts on it as such.

// Same model and the same reasoning as classify-model-agent.ts: search-and-
// cite, nothing applied without a human, so the tier buys shortlist quality,
// not correctness. Web search is billed per search on top of tokens, which is
// why MAX_WEB_SEARCHES is the cost lever rather than the turn count.
const CLASSIFIER_MODEL =
  process.env.PERPS_CLASSIFIER_MODEL || 'claude-haiku-5-5'
const MAX_TURNS = 8
const MAX_TOKENS = 8_000
const MAX_WEB_SEARCHES = 6
/** Catalog descriptions are prose blurbs; this is plenty of context. */
const MAX_DESCRIPTION_CHARS = 600

export type LabAgentVerdict =
  | {
      verdict: 'chinese' | 'non-chinese'
      /** The company, as the cited source names it. */
      publisher: string
      /** City and country of the principal place of business. */
      headquarters: string
      /** A URL from this session's search results that states it. */
      sourceUrl: string
      reasoning: string
    }
  /** An anonymous model that no official source has attributed. */
  | { verdict: 'unattributed'; reasoning: string }
  | { verdict: 'unresolved'; reasoning: string }

export type LabAgentSearch = {
  query: string
  results: { title: string; url: string }[]
  /** False when a paused response has not delivered this search's result yet. */
  completed?: boolean
  /** Set when the search itself failed (rate limit, unavailable). */
  error?: string
}

const hasCompletedSearch = (searches: LabAgentSearch[]) =>
  searches.some(
    (search) => search.completed !== false && search.error === undefined
  )

export type LabAgentClassification = {
  subjectType: LabClassificationSubjectType
  subjectSlug: string
  verdict: LabAgentVerdict
  /** Every web search the verdict rests on, in order — the audit trail. */
  searches: LabAgentSearch[]
  /** Why a proposed placement was downgraded, when it was. */
  rejectedReason?: string
  /**
   * True when the run failed for an infrastructural reason rather than
   * reaching a conclusion — no key, the API unreachable, turns exhausted. The
   * caller uses this to decide whether to start a research cooldown.
   */
  transient?: boolean
}

export type LabAgentSubject = {
  subjectType: LabClassificationSubjectType
  subjectSlug: string
  /** OpenRouter display names — one for a model, several for an author. */
  openRouterNames: string[]
  /** OpenRouter's prose blurbs, when the subject is in the catalog. */
  descriptions: string[]
  /** Base permaslugs under this subject. */
  relatedPermaslugs: string[]
  /** Whether OpenRouter lists the subject right now. */
  inCatalog: boolean
  /** True when re-checking a default verdict rather than researching afresh. */
  provisional: boolean
}

const SYSTEM_PROMPT = `You research AI model publishers for a published market index. The index measures what fraction of tokens on OpenRouter go to models from labs headquartered in China, and it settles real money, so a wrong call moves a market.

THE TEST, and the only test: where is the publisher's headquarters — its principal place of business?
- Headquartered in China -> chinese.
- Headquartered anywhere else -> non-chinese.

Nationality of founders, where the model was trained, Chinese-language ability, a Chinese investor, or a parent company's stake do not count. A Chinese lab's model served under a different OpenRouter author slug is classified by the slug's author, not by the model's ancestry.

For an ANONYMOUS model (a stealth or cloaked preview), the question is first whether it has been publicly ATTRIBUTED: has the publisher, or OpenRouter, confirmed who made it? A reveal counts only from an official source — the publisher's own announcement, OpenRouter's model page or changelog, or a reputable news report quoting one. Community speculation, benchmark fingerprinting and "it feels like" threads are not attribution. If there is no official attribution, say unattributed — that is the correct and useful answer, not a failure.

You are almost certainly being asked about a publisher or model newer than your training data. Do not answer from memory or from what a name resembles. Search, every time, and base your verdict only on what the searches returned in this session.

When you have looked enough, call submit_attribution exactly once. Cite ONLY a URL that appeared in your search results — one that states the headquarters (or the attribution) directly. If you could not establish headquarters from an official or reputable source, say unresolved rather than guessing.`

const WEB_SEARCH: Anthropic.WebSearchTool20250305 = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: MAX_WEB_SEARCHES,
}

const SUBMIT: Anthropic.Tool = {
  name: 'submit_attribution',
  description:
    'Submit the final verdict. Call this exactly once, when your searches are done.',
  input_schema: {
    type: 'object',
    properties: {
      verdict: {
        type: 'string',
        enum: ['chinese', 'non-chinese', 'unattributed', 'unresolved'],
      },
      publisher: {
        type: 'string',
        description:
          'Required for chinese/non-chinese: the company that published the model, as the source names it.',
      },
      headquarters: {
        type: 'string',
        description:
          'Required for chinese/non-chinese: city and country of the principal place of business.',
      },
      sourceUrl: {
        type: 'string',
        description:
          'Required for chinese/non-chinese: ONE URL from your search results that states the headquarters (or, for an anonymous model, the official attribution).',
      },
      reasoning: {
        type: 'string',
        description:
          'What you searched and what came back. Name the sources you relied on and any you discounted.',
      },
    },
    required: ['verdict', 'reasoning'],
  },
}

const userPrompt = (subject: LabAgentSubject) => {
  const lines = [
    `Research this OpenRouter ${
      subject.subjectType === 'author' ? 'publisher (author slug)' : 'model'
    }.`,
    '',
    `subject: ${subject.subjectSlug}`,
    `OpenRouter display name(s): ${
      subject.openRouterNames.length > 0
        ? subject.openRouterNames.join('; ')
        : '(unknown)'
    }`,
  ]
  if (subject.subjectType === 'author')
    lines.push(
      `models under this author: ${
        subject.relatedPermaslugs.length > 0
          ? subject.relatedPermaslugs.join(', ')
          : '(none recorded)'
      }`
    )
  for (const description of subject.descriptions)
    lines.push(
      `OpenRouter description: ${description.slice(0, MAX_DESCRIPTION_CHARS)}`
    )
  lines.push(
    `listed in OpenRouter's catalog right now: ${
      subject.inCatalog
        ? 'yes'
        : 'no — anonymous previews are usually delisted when revealed under ' +
          "the publisher's own slug, so search for the reveal"
    }`
  )
  lines.push(
    `status: ${
      subject.provisional
        ? 'provisionally classified non-Chinese because nothing could be ' +
          'found at the time; you are re-checking whether that has changed'
        : 'awaiting classification'
    }`
  )
  lines.push(
    '',
    "Note the author segment is the OpenRouter publisher slug, which often differs from the company's name. Search rather than assuming."
  )
  return lines.join('\n')
}

/**
 * Research one subject and return a verdict plus the evidence behind it.
 *
 * Never throws on a classification failure — an unreachable API or a
 * malformed answer comes back as `unresolved`, which the caller treats the
 * same as "leave it as it is". A subject this cannot settle is a queue item,
 * not an outage.
 */
export const classifyLabSubjectWithAgent = async (
  subject: LabAgentSubject
): Promise<LabAgentClassification> => {
  const { subjectType, subjectSlug } = subject
  const searches: LabAgentSearch[] = []
  const unresolved = (
    reasoning: string,
    extra: Partial<LabAgentClassification> = {}
  ): LabAgentClassification => ({
    subjectType,
    subjectSlug,
    verdict: { verdict: 'unresolved', reasoning },
    searches,
    ...extra,
  })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey)
    return unresolved('ANTHROPIC_API_KEY not set', { transient: true })

  const anthropic = new Anthropic({ apiKey })
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userPrompt(subject) },
  ]
  // Server-side searches and their results arrive as separate blocks, and a
  // paused turn can split them across responses, so the pairing map outlives
  // a single response.
  const openSearches = new Map<string, LabAgentSearch>()
  let nudged = false

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    // max_uses applies to one Messages request, including a resumed turn.
    // Account for every attempted search across the whole research session.
    const remainingSearches = MAX_WEB_SEARCHES - searches.length
    if (remainingSearches <= 0)
      return unresolved('search budget exhausted before an attribution', {
        transient: !hasCompletedSearch(searches),
      })

    let response: Anthropic.Message
    try {
      response = await anthropic.messages.create({
        model: CLASSIFIER_MODEL,
        max_tokens: MAX_TOKENS,
        // No sampling parameters, for the reason given in
        // classify-model-agent.ts: the 5-series rejects them with a 400, and
        // this call stays portable across whatever PERPS_CLASSIFIER_MODEL is.
        system: SYSTEM_PROMPT,
        tools: [{ ...WEB_SEARCH, max_uses: remainingSearches }, SUBMIT],
        messages,
      })
    } catch (err) {
      return unresolved(`classifier request failed — ${err}`, {
        transient: true,
      })
    }

    messages.push({ role: 'assistant', content: response.content })
    collectSearches(response.content, openSearches, searches)

    // The server ran a search and paused the turn; re-sending the
    // conversation resumes it. Nothing to execute on our side.
    if (response.stop_reason === 'pause_turn') continue

    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    )
    const submission = toolUses.find((use) => use.name === SUBMIT.name)
    if (submission)
      return finalizeLabVerdict(
        subjectType,
        subjectSlug,
        submission.input,
        searches
      )

    if (toolUses.length > 0) {
      // Only one client tool exists, so this is a hallucinated name. Answer
      // it as an error rather than aborting: the model can recover.
      messages.push({
        role: 'user',
        content: toolUses.map(
          (use): Anthropic.ToolResultBlockParam => ({
            type: 'tool_result',
            tool_use_id: use.id,
            content: `Unknown tool ${use.name}. Use web_search to look and submit_attribution to answer.`,
            is_error: true,
          })
        ),
      })
      continue
    }

    // Prose instead of a submission. One nudge — Haiku sometimes narrates its
    // answer — then give up as transient so the next sweep retries.
    if (!nudged) {
      nudged = true
      messages.push({
        role: 'user',
        content:
          'Call submit_attribution now with your verdict and reasoning. Do not answer in prose.',
      })
      continue
    }
    return unresolved('agent stopped without submitting an attribution', {
      transient: true,
    })
  }

  return unresolved(`no attribution after ${MAX_TURNS} turns`, {
    transient: true,
  })
}

/** Pair server tool-use blocks with their result blocks into the audit trail. */
const collectSearches = (
  content: Anthropic.ContentBlock[],
  open: Map<string, LabAgentSearch>,
  searches: LabAgentSearch[]
) => {
  for (const block of content) {
    if (block.type === 'server_tool_use') {
      const input = block.input as Record<string, unknown> | null
      const query =
        typeof input?.query === 'string' ? input.query : JSON.stringify(input)
      const search: LabAgentSearch = { query, results: [], completed: false }
      open.set(block.id, search)
      searches.push(search)
    } else if (block.type === 'web_search_tool_result') {
      const search = open.get(block.tool_use_id)
      if (!search) continue
      search.completed = true
      if (Array.isArray(block.content))
        search.results = block.content.map((r) => ({
          title: r.title,
          url: r.url,
        }))
      else search.error = block.content.error_code
    }
  }
}

/**
 * Canonical form for comparing a cited URL against search-result URLs: scheme
 * dropped, host lowercased without `www.`, trailing slashes and fragment
 * stripped, query kept. Null for anything that is not an http(s) URL.
 */
export const normalizeUrl = (raw: string): string | null => {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  const path = url.pathname.replace(/\/+$/, '')
  return `${host}${path}${url.search}`
}

/**
 * Turn the agent's submission into a verdict we are willing to show a human.
 *
 * A placement needs a publisher, a headquarters and a source URL, and the URL
 * must be one a search in this session returned: the model never fetches
 * pages, so any other URL came from memory, and memory is what this agent
 * exists to avoid. Anything short of that downgrades to `unresolved` with the
 * reason recorded — a queue item, not a wrong prefill. `unattributed`, like a
 * closed open-weight verdict, is a negative claim and is only as good as the
 * searches behind it.
 */
export const finalizeLabVerdict = (
  subjectType: LabClassificationSubjectType,
  subjectSlug: string,
  input: unknown,
  searches: LabAgentSearch[]
): LabAgentClassification => {
  const fields = (input ?? {}) as Record<string, unknown>
  const field = (key: string) => {
    const value = fields[key]
    return typeof value === 'string' ? value.trim() : ''
  }
  const verdict = field('verdict')
  const reasoning = field('reasoning') || '(none given)'
  const base = { subjectType, subjectSlug, searches }
  const unresolved = (why: string, rejectedReason: string) => ({
    ...base,
    verdict: { verdict: 'unresolved' as const, reasoning: why },
    rejectedReason,
  })

  // HTTP 200 can still carry only web-search error blocks. Nothing was
  // researched in that case: do not present a negative finding or delay a
  // watched row for a week merely because the search service was unavailable.
  if (searches.length > 0 && !hasCompletedSearch(searches))
    return {
      ...unresolved(
        `no web search completed successfully - ${reasoning}`,
        'no successful web search'
      ),
      transient: true,
    }

  if (verdict === 'unattributed') {
    if (searches.length === 0)
      return unresolved(
        `claimed unattributed without running any searches — ${reasoning}`,
        'unattributed verdict rested on no searches'
      )
    return { ...base, verdict: { verdict: 'unattributed', reasoning } }
  }

  if (verdict !== 'chinese' && verdict !== 'non-chinese')
    return { ...base, verdict: { verdict: 'unresolved', reasoning } }

  const publisher = field('publisher')
  const headquarters = field('headquarters')
  if (!publisher || !headquarters)
    return unresolved(
      `${verdict} verdict named no publisher or headquarters — ${reasoning}`,
      'placement missing publisher or headquarters'
    )

  const sourceUrl = field('sourceUrl')
  const cited = normalizeUrl(sourceUrl)
  if (!cited)
    return unresolved(
      `${verdict} verdict cited no usable source URL — ${reasoning}`,
      'placement cited no source URL'
    )
  const seen = searches.some((search) =>
    search.results.some((result) => normalizeUrl(result.url) === cited)
  )
  if (!seen)
    return unresolved(
      `cited ${sourceUrl}, which no search in this session returned — ${reasoning}`,
      `uncited source URL: ${sourceUrl}`
    )

  return {
    ...base,
    verdict: { verdict, publisher, headquarters, sourceUrl, reasoning },
  }
}
