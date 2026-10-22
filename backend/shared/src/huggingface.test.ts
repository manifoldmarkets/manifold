import * as fs from 'fs'
import * as path from 'path'
import {
  MANUAL_GATING_PUBLIC_REPOS,
  isTransportFailure,
  isValidRepoId,
} from './huggingface'

describe('isTransportFailure', () => {
  it('treats unreachability as unreachable, not as repository rot', () => {
    expect(isTransportFailure('fetch failed: TypeError: network error')).toBe(
      true
    )
    // The WHOLE 5xx range, not an allowlist. Cloudflare fronts HuggingFace and
    // serves 520/522/524; 501 and 599 exist too. An allowlist that misses one
    // turns an outage into an ERROR alert claiming weights were withdrawn.
    const statuses = ['408', '429']
    for (let code = 500; code <= 599; code++) statuses.push(String(code))
    for (const status of statuses)
      expect([
        status,
        isTransportFailure(`not public: ${status} Whatever`),
      ]).toEqual([status, true])
  })

  it('still reports a genuinely absent or restricted repo as rot', () => {
    // 401 is HF's answer for both "private" and "does not exist" — the whole
    // reason an open verdict needs re-checking at all.
    expect(isTransportFailure('not public: 401 Unauthorized')).toBe(false)
    expect(isTransportFailure('not public: 404 Not Found')).toBe(false)
    expect(isTransportFailure('repo is private')).toBe(false)
    expect(isTransportFailure('repo has no weight files')).toBe(false)
    expect(isTransportFailure('gating is not public: "manual"')).toBe(false)
  })

  it('does not match a status embedded in a longer number', () => {
    expect(isTransportFailure('not public: 4290 Nonsense')).toBe(false)
  })

  /**
   * The regression this file exists for. A previous revision expressed the
   * status check as a regex ending in a literal 0x08 byte — a `\b` mangled
   * during editing — so it never matched and every transport blip was filed as
   * rot. It passed review because the byte does not render.
   */
  it('contains no invisible control characters in its source', () => {
    for (const file of ['huggingface.ts', 'perps/model-classifications.ts']) {
      const src = fs.readFileSync(path.join(__dirname, file), 'utf8')
      // Tab, LF and CR are the legitimate ones (these are CRLF checkouts).
      const allowed = new Set([9, 10, 13])
      const bad = [...src].filter(
        (ch) => ch.charCodeAt(0) < 32 && !allowed.has(ch.charCodeAt(0))
      )
      expect([file, bad.map((c) => c.charCodeAt(0))]).toEqual([file, []])
    }
  })
})

describe('MANUAL_GATING_PUBLIC_REPOS', () => {
  it('is the eleven Llama/Gemma repos and nothing else', () => {
    // Deliberately exact. `manual` gating means the author approves each
    // request, so anything added here is an assertion that a specific line is
    // public in practice — it should never grow by accident.
    expect([...MANUAL_GATING_PUBLIC_REPOS].sort()).toEqual([
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
  })

  it('is stored lowercase so the lookup is case-insensitive', () => {
    for (const repo of MANUAL_GATING_PUBLIC_REPOS)
      expect([repo, repo]).toEqual([repo, repo.toLowerCase()])
  })
})

describe('isValidRepoId', () => {
  it('rejects traversal segments that would fetch a different repository', () => {
    // Verified live: https://huggingface.co/api/models/openai/../openai-community/gpt2
    // answers 200 and resolves to openai-community/gpt2. encodeURIComponent
    // does not escape dots, so the id survived encoding and the fetch
    // normalised it away — while every upstream guard only reads split('/')[0]
    // and sees `openai`. The attacker's repo gets verified; the publisher's id
    // gets stored; the auto-apply path writes open: true.
    expect(isValidRepoId('openai/../attacker/gpt-oss-120b')).toBe(false)
    expect(isValidRepoId('openai/..')).toBe(false)
    expect(isValidRepoId('../attacker/x')).toBe(false)
    expect(isValidRepoId('openai/./gpt-oss')).toBe(false)
  })

  it('rejects anything that is not exactly owner/name', () => {
    expect(isValidRepoId('gpt-oss-120b')).toBe(false)
    expect(isValidRepoId('a/b/c')).toBe(false)
    expect(isValidRepoId('openai/')).toBe(false)
    expect(isValidRepoId('/gpt-oss')).toBe(false)
    expect(isValidRepoId('')).toBe(false)
    expect(isValidRepoId('openai/gpt oss')).toBe(false)
    expect(isValidRepoId('openai/gpt%2foss')).toBe(false)
  })

  it('accepts the real repo ids this index actually cites', () => {
    for (const repo of [
      'zai-org/GLM-5.3',
      'meta-llama/Llama-3.3-70B-Instruct',
      'mistralai/Mistral-Large-3-675B-Instruct-2512',
      'deepseek-ai/DeepSeek-V4-Pro-0813',
      'inclusionAI/Ling-3.0-flash',
      'google/gemma-3n-E4B-it',
      'tencent/Hy4-preview',
    ])
      expect([repo, isValidRepoId(repo)]).toEqual([repo, true])
  })
})
