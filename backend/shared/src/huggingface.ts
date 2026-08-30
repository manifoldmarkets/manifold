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
  // Before any URL is built. See isValidRepoId.
  if (!isValidRepoId(repo))
    return {
      confirmed: false,
      repo,
      reason: `malformed repo id: ${JSON.stringify(repo)}`,
    }

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
  if (body.private) return { confirmed: false, repo, reason: 'repo is private' }

  if (!isPubliclyGettable(body.gated, repo))
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
 * `"manual"` is NOT generally accepted, and the narrowness is the point.
 * HuggingFace defines it as the author approving each request individually,
 * which can stay pending or be refused — that is not public access, and
 * accepting it wholesale would let a future restricted release land on the
 * open side of an executable index with no human ever looking, because the
 * catalog watcher persists a publisher-declared verdict automatically.
 *
 * The eleven Llama and Gemma repos below are allowlisted individually. They
 * report `"manual"` while in practice anyone may accept the licence and
 * download, the weights are in general circulation, and the published seed
 * classifies every one of them open. Calling them closed would read as
 * obviously wrong to anyone checking, which is the worst outcome for a
 * settlement source. Enumerating them keeps that judgement where it can be
 * audited instead of hiding it inside a predicate.
 *
 * A new manual-gated repo therefore resolves to "unresolved" and goes to the
 * review queue. If it turns out to be another accept-the-licence line, add
 * it here deliberately.
 */
export const MANUAL_GATING_PUBLIC_REPOS = new Set([
  'google/gemma-3-12b-it',
  'google/gemma-3-27b-it',
  'google/gemma-3-4b-it',
  'google/gemma-3n-e4b-it',
  'meta-llama/llama-3.2-1b-instruct',
  'meta-llama/llama-3.2-3b-instruct',
  'meta-llama/llama-3.3-70b-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/meta-llama-3.1-70b-instruct',
  'meta-llama/meta-llama-3.1-8b-instruct',
])

const isPubliclyGettable = (
  gated: string | boolean | null | undefined,
  repo: string
) =>
  gated == null ||
  gated === false ||
  gated === 'auto' ||
  (gated === 'manual' && MANUAL_GATING_PUBLIC_REPOS.has(repo.toLowerCase()))

/**
 * Did a verification fail because the repo is genuinely not public, or
 * because HuggingFace could not be reached?
 *
 * Lives here, beside the code that PRODUCES these reason strings, so the two
 * cannot drift. A network blip, a 5xx or a rate-limit answer all come back
 * as `confirmed: false` exactly like a withdrawn repo does, and a caller
 * auditing existing verdicts must not report the first as the second.
 *
 * Parsed by string, not by pattern. An earlier version of this lived in the
 * audit job as a regex whose word boundary was mangled into a literal 0x08
 * control character while being edited, so it silently never matched and
 * every transport blip was reported as repository rot -- the exact failure
 * it existed to prevent, and invisible in review because the byte does not
 * render. Nothing here can fail that way.
 */
/** Non-5xx statuses that still mean "could not reach it", not "not public". */
export const TRANSPORT_FAILURE_STATUSES = new Set(['408', '429'])

const NOT_PUBLIC_PREFIX = 'not public: '

export const isTransportFailure = (reason: string) => {
  if (reason.startsWith('fetch failed')) return true
  if (!reason.startsWith(NOT_PUBLIC_PREFIX)) return false
  const status = reason.slice(NOT_PUBLIC_PREFIX.length).trim().split(' ')[0]
  if (TRANSPORT_FAILURE_STATUSES.has(status)) return true
  // The whole 5xx range, not an allowlist. Cloudflare alone serves 520/522/524
  // in front of HuggingFace and 501/599 exist too; every one of them means the
  // request failed rather than that the repo is gone, and an allowlist that
  // misses one turns an outage into an ERROR alert claiming weights were
  // withdrawn.
  const code = Number(status)
  return Number.isInteger(code) && code >= 500 && code <= 599
}

/**
 * A repo id is exactly `owner/name`, and it is validated before it is used to
 * build a URL.
 *
 * `encodeURIComponent` does not escape dots, so a proposed id containing a
 * traversal segment survived encoding intact and the fetch then normalised it
 * away: `openai/../attacker/gpt-oss-120b` requests
 * `api/models/attacker/gpt-oss-120b` -- verified live against HuggingFace,
 * which answers 200 for it -- while every guard upstream only ever looks at
 * `split('/')[0]` and sees `openai`. The attacker's repo is what gets checked;
 * the publisher's id is what gets stored. On the auto-apply path that writes
 * `open: true` with nobody looking.
 *
 * So the shape is enforced rather than escaped: two non-empty segments of
 * HuggingFace-legal characters, and neither segment may be `.` or `..`.
 */
const REPO_ID_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export const isValidRepoId = (repo: string): boolean => {
  const parts = repo.split('/')
  if (parts.length !== 2) return false
  return parts.every(
    (part) => part !== '.' && part !== '..' && REPO_ID_SEGMENT.test(part)
  )
}

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
