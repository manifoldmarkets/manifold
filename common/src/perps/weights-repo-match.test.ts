import {
  identifierTokens,
  proposedRepoMatchesModel,
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
