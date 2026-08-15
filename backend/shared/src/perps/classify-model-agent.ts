import Anthropic from '@anthropic-ai/sdk'
import { proposedRepoMatchesModel } from 'common/perps/weights-repo-match'
import {
  HuggingFaceVerification,
  searchHuggingFaceModels,
  listHuggingFaceOrgModels,
  verifyHuggingFaceWeights,
} from 'shared/huggingface'
import { log } from 'shared/utils'

// Agentic classifier for models the deterministic watcher could not settle.
//
// The watcher resolves a model on its own when the publisher declared a
// HuggingFace repo: fetch it, confirm public weight files, done. What it
// cannot do is the case that keeps freezing the feed — a model with no
// declared repo, where deciding requires actually looking: search HuggingFace
// for the name, list the publisher's org, notice that `solar-pro3-tokenizer`
// resolves while `solar-pro3` does not, and conclude the whole product line is
// API-only.
//
// That is a search procedure, not knowledge. It has to be, because these
// models postdate any model's training data — Grok 4.6 and Solar Pro 4 were
// released days before they entered the index. So the agent gets the same
// tools a human would use and is graded on evidence it produced in-session;
// asking a model whether a model it has never heard of is open-weights would
// be asking it to guess.
//
// WHAT THIS DOES AND DOES NOT DECIDE. An `open` verdict is machine-checkable:
// the cited repo must resolve, be public, carry weight files, and pass the
// name guard in common/perps/weights-repo-match. Those checks run after the
// agent returns, against the live API, so a fabricated repo fails on contact
// with reality rather than reaching the index. A `closed` verdict has no
// equivalent check — it is a negative claim, and the strongest form of it is
// "these searches came back empty". So closed comes back as a RECOMMENDATION
// with its evidence, for a human to confirm in one click. Auto-applying it is
// opt-in, and off by default: excluding an unknown model costs less index
// error than mis-siding one (see UNCLASSIFIED_TOKEN_SHARE_CAP), so waiting is
// genuinely cheaper than guessing.

// Haiku, not Opus, and the reasoning is about what actually protects the index.
//
// This is a search-and-cite task, not a reasoning task: the agent runs the HF
// searches a human would run and names a repo. Everything that makes an `open`
// verdict safe runs AFTER the model answers and does not care which model
// produced the citation — the repo is re-fetched from the live HuggingFace API
// and must carry public weight files, and the name must clear the deterministic
// guard in common/perps/weights-repo-match. A weaker model therefore cannot
// produce a WRONG `open`; it can only fail to find a repo that exists, which
// comes back as `unresolved` and lands in the human review queue. The failure
// mode degrades into queue depth, not into index error.
//
// The cost difference is the reason it matters. At Opus-5 rates a single
// classification runs ~$0.27 (roughly 30k input + 4.6k output across ~6 turns,
// history resent each turn); on Haiku the same session is ~$0.05. Combined with
// the ranked-only gate and the cooldown in update-model-classifications, that
// is the difference between a job that costs a few cents a day and one that
// does not fit in the budget this feed is worth.
//
// Override per-environment if a specific model ever proves necessary; the
// verification path is unchanged either way.
const CLASSIFIER_MODEL = process.env.PERPS_CLASSIFIER_MODEL || 'claude-haiku-4-5'
// No prompt caching here on purpose: Haiku 4.5's minimum cacheable prefix is
// 4096 tokens and this system prompt plus tool definitions is ~1.5k, so a
// cache_control breakpoint would silently never engage. (It WOULD engage on
// Opus 5, whose minimum is 512 — the two levers interact, and picking the
// cheaper model is worth more here than caching a prefix this small.)
const MAX_TURNS = 12
const MAX_TOKENS = 16_000

export type AgentVerdict =
  | {
      verdict: 'open'
      /** The repo the agent cited, re-verified below before it is trusted. */
      weights: string
      reasoning: string
    }
  | { verdict: 'closed'; reasoning: string }
  | { verdict: 'unresolved'; reasoning: string }

export type AgentClassification = {
  permaslug: string
  verdict: AgentVerdict
  /** Every tool call the agent made, in order — the audit trail for a verdict. */
  searches: { tool: string; input: unknown; result: string }[]
  /** Populated for an `open` verdict: the independent re-check of the citation. */
  confirmation?: HuggingFaceVerification
  /** Why a proposed `open` was downgraded, when it was. */
  rejectedReason?: string
}

const SYSTEM_PROMPT = `You classify AI models for a published market index. The index measures what fraction of tokens on OpenRouter go to models whose weights the public can download, and it settles real money, so a wrong call moves a market.

THE TEST, and the only test: are the model's weights publicly downloadable?
- Downloadable by any member of the public -> open.
- API-only -> closed.

This is deliberately not "open source". A click-through licence is still public: Llama and Gemma are gated on HuggingFace, but anyone can accept the terms and download, so they are open. Research-only access, discretionary approval, and private repos are not public.

You are almost certainly being asked about a model released after your training data ends. Do not answer from memory or from what a name resembles. Use the tools to look, every time, and base your verdict only on what the tools returned in this session.

Useful signals, learned from real cases:
- A publisher's org listing shows their whole line at once. A line that publishes ONLY tokenizer repos (e.g. "solar-pro2-tokenizer" resolving while "solar-pro2" does not) is an API-only line.
- Publishers often brand open and closed lines differently. Upstage ships weights as "Solar Open" while "Solar Pro" is API-only. A repo from the same org is not automatically the same model.
- Third-party quantisations (unsloth, TheBloke, GGUF conversions) are strong corroboration: nobody can quantise weights they could not download.
- A repo that resolves but carries no weight files does not count.

When you have looked enough, call submit_classification. Cite a repo ONLY if you saw it resolve with weight files in this session. If the searches came back empty, say closed and describe which searches you ran and what they returned. If you genuinely could not tell, say unresolved — that is a useful answer, and better than a confident wrong one.`

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'hf_search_models',
    description:
      'Search HuggingFace model repos by name fragment, across all orgs. Use this first to find out whether a weights repo exists anywhere. Returns repo ids with download counts.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Name fragment, e.g. "solar-pro4" or "DeepSeek-V4-Pro"',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'hf_list_org_models',
    description:
      "List a HuggingFace organization's repos, most recently modified first. Use this to see a publisher's whole line at once — it reveals tokenizer-only lines and separately branded open lines.",
    input_schema: {
      type: 'object',
      properties: {
        org: {
          type: 'string',
          description: 'HuggingFace org name, e.g. "upstage" or "deepseek-ai"',
        },
      },
      required: ['org'],
    },
  },
  {
    name: 'hf_get_model',
    description:
      'Fetch one HuggingFace repo and report whether it is public, gated, and how many actual weight files it carries. This is the decisive check for an open verdict.',
    input_schema: {
      type: 'object',
      properties: {
        repo: {
          type: 'string',
          description: 'Full repo id, e.g. "deepseek-ai/DeepSeek-V4-Pro-0813"',
        },
      },
      required: ['repo'],
    },
  },
  {
    name: 'submit_classification',
    description:
      'Submit the final verdict. Call this exactly once, when your searches are done.',
    input_schema: {
      type: 'object',
      properties: {
        verdict: {
          type: 'string',
          enum: ['open', 'closed', 'unresolved'],
        },
        weights: {
          type: 'string',
          description:
            'Required for `open`: the repo id you saw resolve with weight files. Omit otherwise.',
        },
        reasoning: {
          type: 'string',
          description:
            'What you searched and what came back. Name the repos you checked and what each returned.',
        },
      },
      required: ['verdict', 'reasoning'],
    },
  },
]

/**
 * Research one model and return a verdict plus the evidence behind it.
 *
 * Never throws on a classification failure — an unreachable API or a
 * malformed answer comes back as `unresolved`, which the caller treats the
 * same as "leave it pending". A model this cannot settle is not an outage; it
 * is a queue item.
 */
export const classifyModelWithAgent = async (params: {
  permaslug: string
  name?: string
  declaredHuggingFaceId?: string | null
}): Promise<AgentClassification> => {
  const { permaslug, name, declaredHuggingFaceId } = params
  const searches: AgentClassification['searches'] = []

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey)
    return {
      permaslug,
      verdict: {
        verdict: 'unresolved',
        reasoning: 'ANTHROPIC_API_KEY not set',
      },
      searches,
    }

  const anthropic = new Anthropic({ apiKey })
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content:
        `Classify this OpenRouter model.\n\n` +
        `permaslug: ${permaslug}\n` +
        `display name: ${name ?? '(unknown)'}\n` +
        `publisher-declared HuggingFace repo: ${
          declaredHuggingFaceId ?? 'none — OpenRouter reports no repo'
        }\n\n` +
        `Note the permaslug's leading segment is the OpenRouter publisher, ` +
        `which often differs from the HuggingFace org name (z-ai -> zai-org, ` +
        `deepseek -> deepseek-ai). Search rather than assuming.`,
    },
  ]

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let response: Anthropic.Message
    try {
      response = await anthropic.messages.create({
        model: CLASSIFIER_MODEL,
        max_tokens: MAX_TOKENS,
        // No sampling parameters, and deliberately not routed through the
        // shared promptClaude helper, which hardcodes temperature: 0. Haiku
        // accepts temperature, but the Opus/Sonnet 5 generation rejects
        // sampling parameters with a 400 — so promptClaude cannot be pointed
        // at those models at all, and this call stays portable across whatever
        // PERPS_CLASSIFIER_MODEL is set to. Worth knowing independently of
        // this file: any other promptClaude call site aimed at a 5-series
        // model fails the same way.
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      })
    } catch (err) {
      return {
        permaslug,
        verdict: {
          verdict: 'unresolved',
          reasoning: `classifier request failed — ${err}`,
        },
        searches,
      }
    }

    messages.push({ role: 'assistant', content: response.content })

    // A server-side tool run can pause mid-turn; re-sending the conversation
    // resumes it. Nothing to execute on our side.
    if (response.stop_reason === 'pause_turn') continue

    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    )
    if (toolUses.length === 0)
      return {
        permaslug,
        verdict: {
          verdict: 'unresolved',
          reasoning: 'agent stopped without submitting a classification',
        },
        searches,
      }

    const submission = toolUses.find(
      (use) => use.name === 'submit_classification'
    )
    if (submission)
      return finalizeVerdict(permaslug, submission.input, searches)

    const results: Anthropic.ToolResultBlockParam[] = []
    for (const use of toolUses) {
      const result = await runResearchTool(use.name, use.input)
      searches.push({ tool: use.name, input: use.input, result })
      results.push({
        type: 'tool_result',
        tool_use_id: use.id,
        content: result,
      })
    }
    // All results go back in ONE user message — splitting them trains the
    // model out of making parallel tool calls.
    messages.push({ role: 'user', content: results })
  }

  return {
    permaslug,
    verdict: {
      verdict: 'unresolved',
      reasoning: `no classification after ${MAX_TURNS} turns`,
    },
    searches,
  }
}

const runResearchTool = async (
  toolName: string,
  input: unknown
): Promise<string> => {
  const arg = (key: string): string => {
    const value = (input as Record<string, unknown> | null)?.[key]
    return typeof value === 'string' ? value.trim() : ''
  }

  try {
    if (toolName === 'hf_search_models') {
      const hits = await searchHuggingFaceModels(arg('query'))
      if (hits.length === 0) return 'No repos matched this query.'
      return hits
        .map((h) => `${h.id} (downloads: ${h.downloads ?? 0})`)
        .join('\n')
    }
    if (toolName === 'hf_list_org_models') {
      const repos = await listHuggingFaceOrgModels(arg('org'))
      if (repos.length === 0)
        return 'No repos found for that org (it may not exist under this name).'
      return repos
        .map((r) => `${r.id} (modified: ${r.lastModified ?? 'unknown'})`)
        .join('\n')
    }
    if (toolName === 'hf_get_model') {
      const verification = await verifyHuggingFaceWeights(arg('repo'))
      return verification.confirmed
        ? `PUBLIC WEIGHTS CONFIRMED: ${verification.repo}, ` +
            `${verification.evidence.weightFileCount} weight files, ` +
            `gated: ${verification.evidence.gated ?? 'no'}`
        : `NOT CONFIRMED: ${verification.reason}`
    }
    return `Unknown tool ${toolName}`
  } catch (err) {
    // Returned as a tool result rather than thrown: the agent can react to a
    // failed lookup, and one flaky call should not abort the classification.
    return `Tool error: ${err}`
  }
}

/**
 * Turn the agent's submission into a verdict we are willing to act on.
 *
 * An `open` claim is re-verified here against the live HuggingFace API — not
 * against anything the agent reported. Two independent things must hold: the
 * repo really carries public weight files, and its name really looks like this
 * model's (the Solar-Open2 trap). Failing either downgrades to `unresolved`
 * with the reason recorded, which is a queue item rather than a wrong price.
 */
const finalizeVerdict = async (
  permaslug: string,
  input: unknown,
  searches: AgentClassification['searches']
): Promise<AgentClassification> => {
  const fields = (input ?? {}) as Record<string, unknown>
  const verdict = typeof fields.verdict === 'string' ? fields.verdict : ''
  const reasoning =
    typeof fields.reasoning === 'string' ? fields.reasoning : '(none given)'
  const weights =
    typeof fields.weights === 'string' ? fields.weights.trim() : ''

  if (verdict === 'closed')
    return { permaslug, verdict: { verdict: 'closed', reasoning }, searches }

  if (verdict !== 'open')
    return {
      permaslug,
      verdict: { verdict: 'unresolved', reasoning },
      searches,
    }

  if (!weights)
    return {
      permaslug,
      verdict: {
        verdict: 'unresolved',
        reasoning: `claimed open with no weights repo cited — ${reasoning}`,
      },
      searches,
      rejectedReason: 'open verdict cited no repo',
    }

  if (!proposedRepoMatchesModel(permaslug, weights))
    return {
      permaslug,
      verdict: {
        verdict: 'unresolved',
        reasoning: `cited ${weights}, whose name does not match ${permaslug} — ${reasoning}`,
      },
      searches,
      rejectedReason: `name mismatch: ${weights}`,
    }

  const confirmation = await verifyHuggingFaceWeights(weights)
  if (!confirmation.confirmed)
    return {
      permaslug,
      verdict: {
        verdict: 'unresolved',
        reasoning: `cited ${weights}, which did not verify (${confirmation.reason}) — ${reasoning}`,
      },
      searches,
      confirmation,
      rejectedReason: `citation failed verification: ${confirmation.reason}`,
    }

  log(
    `[model-classifier] agent classified ${permaslug} open, citation ` +
      `${weights} independently re-verified`
  )
  return {
    permaslug,
    verdict: { verdict: 'open', weights: confirmation.repo, reasoning },
    searches,
    confirmation,
  }
}
