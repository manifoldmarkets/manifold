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
 * Gated repos still count as public — Llama and Gemma sit behind a
 * click-through licence that any member of the public can accept, and the
 * methodology's line is "can anyone get them", not "is the licence tidy". A
 * private repo does not count, and neither does a repo with no weight files
 * (tokenizer-only publications are the exact trap Upstage's `solar-pro*` line
 * sets: `solar-pro3-tokenizer` resolves while the weights never shipped).
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
    gated?: string | boolean
    siblings?: { rfilename?: string }[]
  }
  if (body.private)
    return { confirmed: false, repo, reason: 'repo is private' }

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

/** Repo ids are `org/name`; the slash is structural and must not be escaped. */
const encodeRepo = (repo: string) =>
  repo.split('/').map(encodeURIComponent).join('/')

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
