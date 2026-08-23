import { log } from './utils'

// HuggingFace repo verification for the open-weight index.
//
// This automates exactly the check the methodology in
// `common/perps/open-weight-models.ts` demands of an `open` verdict: the repo
// resolves, is not private, and carries actual weight files. Nothing else here
// is authoritative — least of all a model's name.
//
// DIRECTIONALITY IS THE WHOLE DESIGN. A confirmed repo is proof the weights are
// public, so `open` can be decided by machine. A missing or unresolvable repo
// is NOT proof of the opposite: the index file documents several models with
// demonstrably public weights whose OpenRouter `hugging_face_id` was absent
// (Ling-2.6-flash, Qwen3-Embedding-8B, pplx-embed-v1, MiMo-V2-Flash,
// Trinity-Large-Preview, the TNG Chimera merges). So this module only ever
// returns "confirmed open" or "not confirmed" — it never concludes closed.
// Calling something closed stays a human judgement.

const HF_API = 'https://huggingface.co/api/models'
const FETCH_TIMEOUT_MS = 15_000

/** Extensions that constitute publicly downloadable weights. */
const WEIGHT_FILE_PATTERN = /\.(safetensors|bin|pt|pth|gguf|onnx|msgpack|h5)$/i

export type HuggingFaceVerification =
  | {
      confirmed: true
      repo: string
      /** Evidence recorded alongside the verdict so it can be re-audited. */
      evidence: {
        repo: string
        gated: string | boolean | null
        weightFileCount: number
        sampleWeightFiles: string[]
        checkedAt: string
      }
    }
  | { confirmed: false; repo: string | null; reason: string }

/**
 * Verify that `repo` holds publicly downloadable weights.
 *
 * Gating still counts as public — Llama and Gemma sit behind a licence any
 * member of the public can accept, and the methodology's line is "can anyone
 * get them", not "is the licence tidy". See `isPubliclyGettable` below for why
 * `"manual"` is on the accept side; any value HF invents later reads as
 * unresolved rather than silently confirming, per the directionality note
 * above. A private repo does not count, and neither does a repo with no weight
 * files (tokenizer-only publications are the exact trap Upstage's `solar-pro*`
 * line sets: `solar-pro3-tokenizer` resolves while the weights never shipped).
 */
export const verifyHuggingFaceWeights = async (
  repo: string
): Promise<HuggingFaceVerification> => {
  if (!repo || !repo.includes('/'))
    return { confirmed: false, repo: repo || null, reason: 'no repo id' }

  let res: Response
  try {
    res = await fetch(`${HF_API}/${encodeRepo(repo)}`, {
      headers: { 'user-agent': 'Manifold/1.0 (+https://manifold.markets)' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch (err) {
    return { confirmed: false, repo, reason: `fetch failed: ${err}` }
  }

  // HF answers 401 for both "private" and "does not exist" when unauthenticated,
  // so neither can be distinguished — and neither is confirmation.
  if (!res.ok)
    return {
      confirmed: false,
      repo,
      reason: `not public: ${res.status} ${res.statusText}`,
    }

  const body = (await res.json()) as {
    private?: boolean
    // Not a boolean: HF returns false | "auto" (click-through) | "manual"
    // (owner approves each request), and the three do not mean the same thing.
    gated?: string | boolean | null
    siblings?: { rfilename?: string }[]
  }
  if (body.private)
    return { confirmed: false, repo, reason: 'repo is private' }

  if (!isPubliclyGettable(body.gated))
    return {
      confirmed: false,
      repo,
      reason: `gating is not public: ${JSON.stringify(body.gated)}`,
    }

  const weightFiles = (body.siblings ?? [])
    .map((s) => s.rfilename ?? '')
    .filter((name) => WEIGHT_FILE_PATTERN.test(name))
  if (weightFiles.length === 0)
    return {
      confirmed: false,
      repo,
      reason: 'repo resolves but carries no weight files',
    }

  return {
    confirmed: true,
    repo,
    evidence: {
      repo,
      gated: body.gated ?? null,
      weightFileCount: weightFiles.length,
      sampleWeightFiles: weightFiles.slice(0, 5),
      checkedAt: new Date().toISOString(),
    },
  }
}

/**
 * Whether HF's `gated` value still leaves the weights gettable by anyone.
 *
 * An accept-list, not a reject-list, so a value HF adds later ("research",
 * "waitlist", whatever) fails closed into "unresolved" and waits for a human
 * instead of quietly counting on the open side of an executable index.
 *
 * `"manual"` is on the list, and that reverses an earlier reading of it. The
 * argument for excluding it was that the owner approves each request
 * individually, so the public cannot in fact get the weights. That is not what
 * the value means in practice for the repos this index actually contains:
 * Llama and Gemma report `"manual"`, anyone may accept the licence and
 * download, and the published seed classifies all eleven of them `open:true`
 * — `meta-llama/Llama-3.3-70B-Instruct`, `google/gemma-3-27b-it`, the Llama 4
 * pair, and the rest.
 *
 * So the two disagreed, and the disagreement had teeth in both directions:
 * the watcher could never auto-confirm a Llama or Gemma release, putting every
 * one of them in the review queue on a 48-hour clock; and the nightly
 * re-verification in `update-classification-audit.ts` reported all eleven
 * seeded entries as "no longer verifies" on its first run, which is exactly
 * the kind of standing false alarm that gets an alert ignored.
 *
 * The methodology's test is "can anyone get them", and for click-through and
 * accept-the-licence gating alike the answer is yes. Discretionary gating that
 * genuinely blocks the public would need a value HF does not currently emit,
 * and would land on the reject side by default.
 */
const isPubliclyGettable = (gated: string | boolean | null | undefined) =>
  gated == null || gated === false || gated === 'auto' || gated === 'manual'

/** Repo ids are `org/name`; the slash is structural and must not be escaped. */
const encodeRepo = (repo: string) =>
  repo.split('/').map(encodeURIComponent).join('/')

export type HuggingFaceRepoSummary = {
  id: string
  downloads?: number
  lastModified?: string
}

/**
 * Search repos by name fragment across every org.
 *
 * The decisive NEGATIVE signal: a global search for a model's name returning
 * nothing is the strongest available evidence that no public weights exist
 * anywhere. It is what settled Solar Pro 4 and Grok 4.6.
 */
export const searchHuggingFaceModels = async (
  query: string,
  limit = 20
): Promise<HuggingFaceRepoSummary[]> => {
  if (!query) return []
  return fetchRepoList(
    `${HF_API}?search=${encodeURIComponent(query)}&limit=${limit}`
  )
}

/**
 * List an org's repos, most recently modified first.
 *
 * Reveals what a single-repo lookup cannot: that a publisher ships weights
 * under a separately branded line (Upstage's Solar Open vs Solar Pro), or that
 * a line publishes tokenizers only.
 */
export const listHuggingFaceOrgModels = async (
  org: string,
  limit = 30
): Promise<HuggingFaceRepoSummary[]> => {
  if (!org) return []
  return fetchRepoList(
    `${HF_API}?author=${encodeURIComponent(
      org
    )}&sort=lastModified&direction=-1&limit=${limit}`
  )
}

const fetchRepoList = async (
  url: string
): Promise<HuggingFaceRepoSummary[]> => {
  const res = await fetch(url, {
    headers: { 'user-agent': 'Manifold/1.0 (+https://manifold.markets)' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok)
    throw new Error(`HuggingFace list: ${res.status} ${res.statusText}`)

  const body = (await res.json()) as unknown
  if (!Array.isArray(body)) return []
  return body.flatMap((row) => {
    if (!row || typeof row !== 'object' || !('id' in row)) return []
    const id = (row as { id: unknown }).id
    if (typeof id !== 'string') return []
    const downloads = (row as { downloads?: unknown }).downloads
    const lastModified = (row as { lastModified?: unknown }).lastModified
    return [
      {
        id,
        downloads: typeof downloads === 'number' ? downloads : undefined,
        lastModified:
          typeof lastModified === 'string' ? lastModified : undefined,
      },
    ]
  })
}

export const logHuggingFaceVerification = (
  permaslug: string,
  verification: HuggingFaceVerification
) => {
  if (verification.confirmed)
    log(
      `[model-classifier] ${permaslug} -> open (${verification.repo}, ` +
        `${verification.evidence.weightFileCount} weight files)`
    )
  else
    log(
      `[model-classifier] ${permaslug} -> unresolved (${
        verification.repo ?? 'no repo'
      }: ${verification.reason})`
    )
}
