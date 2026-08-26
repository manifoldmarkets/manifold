import {
  identifierTokens,
  proposedRepoMatchesModel,
  repoOwnerMatchesPublisher,
  weightsRepoNameOverlap,
} from './weights-repo-match'

describe('identifierTokens', () => {
  it('drops the org, splits digits from letters, and strips noise', () => {
    expect(identifierTokens('deepseek/deepseek-v4-pro-20260813')).toEqual([
      'deepseek',
      'v4',
      'pro',
    ])
    expect(identifierTokens('deepseek-ai/DeepSeek-V4-Pro-0813')).toEqual([
      'deepseek',
      'v4',
      'pro',
    ])
  })

  it('keeps version numbers attached to their letter', () => {
    // `v4` and `k2` discriminate; a bare `70` or `2507` does not.
    expect(identifierTokens('moonshotai/Kimi-K2-Instruct-0905')).toEqual([
      'kimi',
      'k2',
    ])
  })
})

describe('the repos that actually froze the feed', () => {
  it('accepts the real weights repo for each open model', () => {
    const realPairs: [string, string][] = [
      [
        'deepseek/deepseek-v4-pro-20260813',
        'deepseek-ai/DeepSeek-V4-Pro-0813',
      ],
      [
        'nvidia/nemotron-3.5-lightning-20260807',
        'nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-BF16',
      ],
      ['moonshotai/kimi-k2.5-0127', 'moonshotai/Kimi-K2.5'],
      ['qwen/qwen3-coder-480b-a35b-07-25', 'Qwen/Qwen3-Coder-480B-A35B-Instruct'],
      ['z-ai/glm-5.2-20260616', 'zai-org/GLM-5.2'],
    ]
    for (const [permaslug, repo] of realPairs)
      expect([permaslug, proposedRepoMatchesModel(permaslug, repo)]).toEqual([
        permaslug,
        true,
      ])
  })

  it('rejects the real-but-wrong repo that motivates the guard', () => {
    // Solar Open2 is a genuine, public, weight-bearing Upstage repo — and a
    // different model from Solar Pro 4. Verification alone would accept it.
    expect(
      proposedRepoMatchesModel(
        'upstage/solar-pro4-20260810',
        'upstage/Solar-Open2-250B'
      )
    ).toBe(false)
  })

  it('rejects a SIBLING in the same family, which verification cannot catch', () => {
    // The dropped token is the one that names the model. Every repo here is
    // real, public and weight-bearing, so live HF verification confirms all of
    // them — the guard is the only thing standing between a sibling's weights
    // and a closed model being marked open.
    for (const [permaslug, repo] of [
      // pro vs flash: same publisher, same version, different product
      ['deepseek/deepseek-v4-pro-20260813', 'deepseek-ai/DeepSeek-V4-Flash-0731'],
      ['deepseek/deepseek-v4-flash-20260731', 'deepseek-ai/DeepSeek-V4-Pro-0813'],
      // lightning vs ultra
      [
        'nvidia/nemotron-3.5-lightning-20260807',
        'nvidia/NVIDIA-Nemotron-3.5-Ultra-BF16',
      ],
      // same family and shape, different SIZE — the case that scored a perfect
      // 1.00 while sizes were being tokenized away to a bare unit letter
      ['qwen/qwen3-coder-480b-a35b-07-25', 'Qwen/Qwen3-Coder-30B-A3B-Instruct'],
    ] as [string, string][])
      expect([permaslug, repo, proposedRepoMatchesModel(permaslug, repo)]).toEqual(
        [permaslug, repo, false]
      )
  })

  it('keeps parameter counts distinguishable through tokenization', () => {
    // If 480b and 30b both collapse to `b`, siblings become indistinguishable.
    expect(identifierTokens('qwen/qwen3-coder-480b-a35b-07-25')).not.toEqual(
      identifierTokens('Qwen/Qwen3-Coder-30B-A3B-Instruct')
    )
  })

  it('rejects a same-org repo for an unrelated model family', () => {
    expect(
      proposedRepoMatchesModel('x-ai/grok-4.6-20260810', 'xai-org/grok-1')
    ).toBe(false)
    expect(
      proposedRepoMatchesModel(
        'deepseek/deepseek-v4-pro-20260813',
        'deepseek-ai/DeepSeek-R1'
      )
    ).toBe(false)
  })

  it('refuses to auto-apply when the model name is a single family token', () => {
    // `<family>-<integer>-<date>` reduces to ONE token, because bare integers
    // are dropped as noise. The ratio is then 1.00 against any repo carrying
    // the family name — and those repos are real, public, and weight-bearing,
    // so verification clears them too. Without a floor on the denominator both
    // guards pass and a closed frontier model lands on the open side.
    for (const [permaslug, repo] of [
      ['x-ai/grok-5-20260901', 'xai-org/grok-1'],
      ['openai/gpt-6-20260901', 'openai-community/gpt-2'],
      ['meta/llama-5-20260901', 'unsloth/Llama-3.1-8B-Instruct-GGUF'],
      ['z-ai/glm-6-20260901', 'zai-org/GLM-4.6'],
    ] as [string, string][]) {
      expect([permaslug, identifierTokens(permaslug).length]).toEqual([
        permaslug,
        1,
      ])
      // The ratio alone would accept every one of these.
      expect([permaslug, weightsRepoNameOverlap(permaslug, repo)]).toEqual([
        permaslug,
        1,
      ])
      expect([permaslug, proposedRepoMatchesModel(permaslug, repo)]).toEqual([
        permaslug,
        false,
      ])
    }
  })

  it('still accepts real pairs, which all clear the token floor', () => {
    // The floor must not cost us any genuine match: every real pair observed
    // contributes three or more distinctive tokens.
    for (const permaslug of [
      'deepseek/deepseek-v4-pro-20260813',
      'nvidia/nemotron-3.5-lightning-20260807',
      'qwen/qwen3-coder-480b-a35b-07-25',
    ])
      expect([
        permaslug,
        identifierTokens(permaslug).length >= 2,
      ]).toEqual([permaslug, true])
  })
})

describe('weightsRepoNameOverlap', () => {
  it('is measured over the model tokens, so extra repo tokens are free', () => {
    // Size and precision suffixes are normal on a weights repo and must not
    // count against it.
    expect(
      weightsRepoNameOverlap(
        'qwen/qwen3-30b-a3b-instruct-2507',
        'Qwen/Qwen3-30B-A3B-Instruct-2507'
      )
    ).toBe(1)
  })

  it('scores zero when the model names something the repo lacks', () => {
    expect(weightsRepoNameOverlap('newlab/aurora-1', 'otherlab/Zephyr-7B')).toBe(
      0
    )
  })

  it('never divides by zero on a degenerate identifier', () => {
    expect(weightsRepoNameOverlap('org/', 'org/Something')).toBe(0)
    expect(weightsRepoNameOverlap('', '')).toBe(0)
  })
})

describe('repoOwnerMatchesPublisher', () => {
  it('rejects the ox-alpha fabrication that cleared every other guard', () => {
    // Real: created 2026-08-21, 20 files named like weight shards, config
    // claiming 800B params, README "real ox alpha dataset npnp", built in 24
    // seconds, while stealth/ox-alpha was entering the ranked window. It is
    // public, carries .safetensors, and matches the name perfectly.
    expect(proposedRepoMatchesModel('stealth/ox-alpha', 'brokenshards/ox-alpha')).toBe(
      true
    )
    expect(
      repoOwnerMatchesPublisher('stealth/ox-alpha', 'brokenshards/ox-alpha')
    ).toBe(false)
  })

  it('rejects third-party fine-tunes, quants and distills', () => {
    const strangers: [string, string][] = [
      ['openai/gpt-3.5-turbo', 'jondurbin/airoboros-gpt-3.5-turbo-100k-7b'],
      ['~z-ai/glm-latest', 'drowzeys/keys-latest-GLM-5.2-Quantrio-INT4'],
      ['qwen/qwen3-max', 'DavidAU/Qwen3.6-27B-Fable-Fusion-711-GGUF'],
      ['openai/gpt-5.1-codex-max-20251204', 'TeichAI/Qwen3-4B-Codex-Max-Distill'],
    ]
    for (const [permaslug, repo] of strangers)
      expect(repoOwnerMatchesPublisher(permaslug, repo)).toBe(false)
  })

  it('rejects a namespace squatter whose org merely starts with the publisher', () => {
    // The reason this is an explicit map and not a prefix rule. HF org names
    // are first-come, so every one of these satisfies "org starts with the
    // publisher's name" — and `openai-community` is a real, existing org.
    const squatters: [string, string][] = [
      ['openai/gpt-oss-120b', 'openai-community/gpt-oss-120b'],
      ['anthropic/claude-x-20260101', 'anthropic-fan/claude-x'],
      ['qwen/qwen4-30b', 'qwenfake/Qwen4-30B'],
      ['mistralai/mistral-x-2601', 'mistralai-mirror/Mistral-X-2601'],
    ]
    for (const [permaslug, repo] of squatters)
      expect([permaslug, repoOwnerMatchesPublisher(permaslug, repo)]).toEqual([
        permaslug,
        false,
      ])
  })

  it('rejects an org the publisher name merely starts with', () => {
    // The reverse direction had ZERO legitimate users across all 122 seed
    // pairs and admits a 3-character squat, so it is not supported at all.
    expect(repoOwnerMatchesPublisher('meta/llama-5-20260901', 'met/llama-5')).toBe(
      false
    )
    expect(repoOwnerMatchesPublisher('mistralai/mistral-x', 'mistral/Mistral-X')).toBe(
      false
    )
  })

  it('accepts the org-name decorations publishers actually use', () => {
    // Every non-exact shape observed across the 175 open classifications that
    // carry a weights repo. If this list grows, PUBLISHER_HF_ORGS must too —
    // that is the intended maintenance cost of not using a prefix rule.
    const real: [string, string][] = [
      ['z-ai/glm-5.2-20260616', 'zai-org/GLM-5.2'],
      ['cohere/command-r-08-2024', 'CohereLabs/c4ai-command-r-08-2024'],
      ['cohere/command-a-03-2025', 'CohereForAI/c4ai-command-a-03-2025'],
      ['minimax/minimax-m1', 'MiniMaxAI/MiniMax-M1-40k'],
      ['ai21/jamba-large-1.7', 'ai21labs/AI21-Jamba-Large-1.7'],
      ['deepseek/deepseek-v4-pro', 'deepseek-ai/DeepSeek-V4-Pro'],
      ['perplexity/pplx-embed-v1-0.6B', 'perplexity-ai/pplx-embed-v1-0.6b'],
      ['meta/muse-glimmer-30b-20260810', 'meta-models/Muse-Glimmer-30B'],
      ['meta-llama/llama-guard-4-12b', 'meta-llama/Llama-Guard-4-12B'],
      ['meituan/longcat-2.0-20260720', 'meituan-longcat/LongCat-2.0'],
      ['liquid/lfm-2.5-2.6b-20260811', 'LiquidAI/LFM2.5-2.6B'],
      ['bytedance/ui-tars-1.5-7b', 'ByteDance-Seed/UI-TARS-1.5-7B'],
      ['xiaomi/mimo-v2.5-20260422', 'XiaomiMiMo/MiMo-V2.5'],
      ['stepfun/step-3.5-flash', 'stepfun-ai/Step-3.5-Flash'],
      ['x-ai/grok-2', 'xai-org/grok-2'],
      // exact matches still work
      ['moonshotai/kimi-k3-20260715', 'moonshotai/Kimi-K3'],
      ['mistralai/mistral-large-2512', 'mistralai/Mistral-Large-3-675B-Base-2512'],
      ['inclusionai/ling-3.0-flash-20260723', 'inclusionAI/Ling-3.0-flash'],
    ]
    for (const [permaslug, repo] of real)
      expect([permaslug, repoOwnerMatchesPublisher(permaslug, repo)]).toEqual([
        permaslug,
        true,
      ])
  })

  it('is a recommendation gate, not a verdict — cross-publisher releases fail it', () => {
    // venice/uncensored genuinely ships from cognitivecomputations. This
    // returning false must send the model to a human, never mark it closed.
    expect(
      repoOwnerMatchesPublisher(
        'venice/uncensored',
        'cognitivecomputations/Dolphin-Mistral-24B-Venice-Edition'
      )
    ).toBe(false)
  })

  it('does not crash on degenerate identifiers', () => {
    expect(repoOwnerMatchesPublisher('', '')).toBe(false)
    expect(repoOwnerMatchesPublisher('org/', '')).toBe(false)
    expect(repoOwnerMatchesPublisher('/model', 'owner/repo')).toBe(false)
  })
})
